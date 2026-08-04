package s3api

import (
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/omni-store/omnistore/internal/audit"
	"github.com/omni-store/omnistore/internal/models"
)

type initiateMultipartUploadResult struct {
	XMLName  xml.Name `xml:"InitiateMultipartUploadResult"`
	XMLNS    string   `xml:"xmlns,attr"`
	Bucket   string   `xml:"Bucket"`
	Key      string   `xml:"Key"`
	UploadID string   `xml:"UploadId"`
}

func (h *Handler) createMultipartUpload(w http.ResponseWriter, r *http.Request, user *models.User, src *models.StorageSource, key string) {
	upload, err := h.multipart.Create(user.ID, src.SourceID, key)
	if err != nil {
		h.logger.Error("创建 S3 Multipart Upload 失败", "err", err, "source_id", src.SourceID, "key", key)
		h.writeError(w, r, http.StatusInternalServerError, "InternalError", "创建 Multipart Upload 失败", key)
		return
	}
	h.writeXML(w, http.StatusOK, initiateMultipartUploadResult{
		XMLNS: xmlNamespace, Bucket: src.SourceID, Key: key, UploadID: upload.UploadID,
	})
	h.logMutation(r, user, "create_multipart_upload", src.SourceID, key, audit.StatusSuccess, "")
}

func (h *Handler) uploadPart(w http.ResponseWriter, r *http.Request, authenticated *authenticatedRequest, src *models.StorageSource, key string) {
	partNumber, err := strconv.Atoi(r.URL.Query().Get("partNumber"))
	if err != nil || partNumber < 1 || partNumber > MaxMultipartParts {
		h.writeError(w, r, http.StatusBadRequest, "InvalidArgument", "partNumber 必须为 1-10000", key)
		return
	}
	body, chunked, err := multipartPayloadReader(r, authenticated.PayloadHash)
	if err != nil {
		h.writePayloadError(w, r, err, key)
		return
	}
	part, err := h.multipart.UploadPart(authenticated.User.ID, src.SourceID, key,
		r.URL.Query().Get("uploadId"), partNumber, body)
	if err != nil {
		if isPayloadReadError(err) {
			h.writePayloadError(w, r, err, key)
			return
		}
		h.writeMultipartError(w, r, err, key)
		return
	}
	w.Header().Set("ETag", part.ETag)
	if chunked != nil && chunked.trailerValue != "" {
		w.Header().Set(chunked.checksumName, chunked.trailerValue)
	}
	w.WriteHeader(http.StatusOK)
	h.logMutation(r, authenticated.User, "upload_part", src.SourceID, key, audit.StatusSuccess, "")
}

type listPartsResult struct {
	XMLName              xml.Name       `xml:"ListPartsResult"`
	XMLNS                string         `xml:"xmlns,attr"`
	Bucket               string         `xml:"Bucket"`
	Key                  string         `xml:"Key"`
	UploadID             string         `xml:"UploadId"`
	PartNumberMarker     int            `xml:"PartNumberMarker"`
	NextPartNumberMarker int            `xml:"NextPartNumberMarker,omitempty"`
	MaxParts             int            `xml:"MaxParts"`
	IsTruncated          bool           `xml:"IsTruncated"`
	Parts                []listPartItem `xml:"Part"`
}

type listPartItem struct {
	PartNumber   int       `xml:"PartNumber"`
	LastModified time.Time `xml:"LastModified"`
	ETag         string    `xml:"ETag"`
	Size         int64     `xml:"Size"`
}

func (h *Handler) listParts(w http.ResponseWriter, r *http.Request, user *models.User, src *models.StorageSource, key string) {
	marker, err := parseBoundedQueryInt(r, "part-number-marker", 0, 0, MaxMultipartParts)
	if err != nil {
		h.writeError(w, r, http.StatusBadRequest, "InvalidArgument", err.Error(), key)
		return
	}
	maxParts, err := parseBoundedQueryInt(r, "max-parts", 1000, 0, 1000)
	if err != nil {
		h.writeError(w, r, http.StatusBadRequest, "InvalidArgument", err.Error(), key)
		return
	}
	uploadID := r.URL.Query().Get("uploadId")
	parts, err := h.multipart.ListParts(user.ID, src.SourceID, key, uploadID)
	if err != nil {
		h.writeMultipartError(w, r, err, key)
		return
	}
	result := listPartsResult{
		XMLNS: xmlNamespace, Bucket: src.SourceID, Key: key, UploadID: uploadID,
		PartNumberMarker: marker, MaxParts: maxParts,
	}
	for _, part := range parts {
		if part.PartNumber <= marker {
			continue
		}
		if len(result.Parts) == maxParts {
			result.IsTruncated = true
			break
		}
		result.Parts = append(result.Parts, listPartItem{
			PartNumber: part.PartNumber, LastModified: part.CreatedAt.UTC(), ETag: part.ETag, Size: part.Size,
		})
	}
	if result.IsTruncated && len(result.Parts) > 0 {
		result.NextPartNumberMarker = result.Parts[len(result.Parts)-1].PartNumber
	}
	h.writeXML(w, http.StatusOK, result)
}

type completeMultipartUploadRequest struct {
	Parts []CompletedPart `xml:"Part"`
}

type completeMultipartUploadResult struct {
	XMLName  xml.Name `xml:"CompleteMultipartUploadResult"`
	XMLNS    string   `xml:"xmlns,attr"`
	Location string   `xml:"Location"`
	Bucket   string   `xml:"Bucket"`
	Key      string   `xml:"Key"`
	ETag     string   `xml:"ETag"`
}

func (h *Handler) completeMultipartUpload(w http.ResponseWriter, r *http.Request, authenticated *authenticatedRequest, src *models.StorageSource, key string) {
	body, _, err := multipartPayloadReader(r, authenticated.PayloadHash)
	if err != nil {
		h.writePayloadError(w, r, err, key)
		return
	}
	const maxCompleteBody = 2 << 20
	data, err := io.ReadAll(io.LimitReader(body, maxCompleteBody+1))
	if err != nil {
		h.writePayloadError(w, r, err, key)
		return
	}
	if len(data) > maxCompleteBody {
		h.writeError(w, r, http.StatusBadRequest, "MalformedXML", "CompleteMultipartUpload 请求过大", key)
		return
	}
	var request completeMultipartUploadRequest
	if err := xml.Unmarshal(data, &request); err != nil {
		h.writeError(w, r, http.StatusBadRequest, "MalformedXML", "CompleteMultipartUpload XML 非法", key)
		return
	}
	etag, _, err := h.multipart.Complete(authenticated.User.ID, src, key,
		r.URL.Query().Get("uploadId"), request.Parts)
	if err != nil {
		h.writeMultipartError(w, r, err, key)
		return
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	location := (&url.URL{Scheme: scheme, Host: r.Host, Path: "/" + src.SourceID + "/" + key}).String()
	h.writeXML(w, http.StatusOK, completeMultipartUploadResult{
		XMLNS: xmlNamespace, Location: location, Bucket: src.SourceID, Key: key, ETag: etag,
	})
	h.logMutation(r, authenticated.User, "complete_multipart_upload", src.SourceID, key, audit.StatusSuccess, "")
}

func (h *Handler) abortMultipartUpload(w http.ResponseWriter, r *http.Request, user *models.User, src *models.StorageSource, key string) {
	if err := h.multipart.Abort(user.ID, src.SourceID, key, r.URL.Query().Get("uploadId")); err != nil {
		h.writeMultipartError(w, r, err, key)
		return
	}
	w.WriteHeader(http.StatusNoContent)
	h.logMutation(r, user, "abort_multipart_upload", src.SourceID, key, audit.StatusSuccess, "")
}

func multipartPayloadReader(r *http.Request, payloadHash string) (io.Reader, *awsChunkedReader, error) {
	if err := validatePayloadHash(payloadHash); err != nil {
		return nil, nil, err
	}
	body := io.Reader(r.Body)
	var chunked *awsChunkedReader
	if payloadHash == streamingUnsignedTrailer {
		var err error
		chunked, err = newAWSChunkedReader(r.Body, r.Header.Get("X-Amz-Decoded-Content-Length"), r.Header.Get("X-Amz-Trailer"))
		if err != nil {
			return nil, nil, err
		}
		body = chunked
	} else if payloadHash != "UNSIGNED-PAYLOAD" {
		body = newVerifyingReader(body, payloadHash)
	}
	return body, chunked, nil
}

func parseBoundedQueryInt(r *http.Request, name string, fallback, minValue, maxValue int) (int, error) {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minValue || value > maxValue {
		return 0, fmt.Errorf("%s 必须为 %d-%d", name, minValue, maxValue)
	}
	return value, nil
}

func (h *Handler) writePayloadError(w http.ResponseWriter, r *http.Request, err error, resource string) {
	if strings.HasPrefix(r.Header.Get("X-Amz-Content-Sha256"), "STREAMING-") && r.Header.Get("X-Amz-Content-Sha256") != streamingUnsignedTrailer {
		h.writeError(w, r, http.StatusNotImplemented, "NotImplemented", err.Error(), resource)
		return
	}
	code := "InvalidRequest"
	if strings.Contains(err.Error(), "x-amz-content-sha256") {
		code = "XAmzContentSHA256Mismatch"
	}
	h.writeError(w, r, http.StatusBadRequest, code, err.Error(), resource)
}

func isPayloadReadError(err error) bool {
	message := err.Error()
	return strings.Contains(message, "x-amz-") || strings.Contains(message, "aws-chunked") ||
		errors.Is(err, io.ErrUnexpectedEOF)
}

func (h *Handler) writeMultipartError(w http.ResponseWriter, r *http.Request, err error, resource string) {
	switch {
	case errors.Is(err, ErrNoSuchUpload):
		h.writeError(w, r, http.StatusNotFound, "NoSuchUpload", err.Error(), resource)
	case errors.Is(err, ErrInvalidPart):
		h.writeError(w, r, http.StatusBadRequest, "InvalidPart", err.Error(), resource)
	case errors.Is(err, ErrInvalidPartOrder):
		h.writeError(w, r, http.StatusBadRequest, "InvalidPartOrder", err.Error(), resource)
	case errors.Is(err, ErrEntityTooSmall):
		h.writeError(w, r, http.StatusBadRequest, "EntityTooSmall", err.Error(), resource)
	case errors.Is(err, ErrEntityTooLarge):
		h.writeError(w, r, http.StatusRequestEntityTooLarge, "EntityTooLarge", err.Error(), resource)
	default:
		h.writeFileError(w, r, err, resource)
	}
}
