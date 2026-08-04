package s3api

import (
	"bufio"
	"encoding/base64"
	"errors"
	"fmt"
	"hash"
	"hash/crc32"
	"hash/crc64"
	"io"
	"net/textproto"
	"strconv"
	"strings"

	"crypto/sha1"
	"crypto/sha256"
)

const streamingUnsignedTrailer = "STREAMING-UNSIGNED-PAYLOAD-TRAILER"

type awsChunkedReader struct {
	reader          *bufio.Reader
	remaining       int64
	decoded         int64
	expectedDecoded int64
	checksumName    string
	checksum        hash.Hash
	trailerValue    string
	done            bool
	needChunkCRLF   bool
}

func newAWSChunkedReader(body io.Reader, decodedLength, trailerName string) (*awsChunkedReader, error) {
	length, err := strconv.ParseInt(decodedLength, 10, 64)
	if err != nil || length < 0 {
		return nil, fmt.Errorf("x-amz-decoded-content-length 非法")
	}
	trailerName = strings.ToLower(strings.TrimSpace(trailerName))
	checksum, err := checksumForTrailer(trailerName)
	if err != nil {
		return nil, err
	}
	return &awsChunkedReader{
		reader: bufio.NewReader(body), expectedDecoded: length,
		checksumName: trailerName, checksum: checksum,
	}, nil
}

func checksumForTrailer(name string) (hash.Hash, error) {
	switch name {
	case "x-amz-checksum-crc32":
		return crc32.NewIEEE(), nil
	case "x-amz-checksum-crc32c":
		return crc32.New(crc32.MakeTable(crc32.Castagnoli)), nil
	case "x-amz-checksum-crc64nvme":
		// CRC-64/NVME 的反射多项式；hash/crc64 的 Update 使用标准初始值和最终异或。
		return crc64.New(crc64.MakeTable(0x9A6C9329AC4BC9B5)), nil
	case "x-amz-checksum-sha1":
		return sha1.New(), nil
	case "x-amz-checksum-sha256":
		return sha256.New(), nil
	default:
		return nil, fmt.Errorf("不支持的 x-amz-trailer: %s", name)
	}
}

func (r *awsChunkedReader) Read(p []byte) (int, error) {
	if r.done {
		return 0, io.EOF
	}
	if len(p) == 0 {
		return 0, nil
	}
	if r.needChunkCRLF {
		ending := make([]byte, 2)
		if _, err := io.ReadFull(r.reader, ending); err != nil || string(ending) != "\r\n" {
			return 0, fmt.Errorf("aws-chunked 数据块结尾非法")
		}
		r.needChunkCRLF = false
	}
	if r.remaining == 0 {
		line, err := r.reader.ReadString('\n')
		if err != nil || !strings.HasSuffix(line, "\r\n") {
			return 0, fmt.Errorf("aws-chunked 数据块头非法")
		}
		sizeField := strings.SplitN(strings.TrimSuffix(line, "\r\n"), ";", 2)[0]
		size, err := strconv.ParseInt(sizeField, 16, 64)
		if err != nil || size < 0 {
			return 0, fmt.Errorf("aws-chunked 数据块大小非法")
		}
		if size == 0 {
			trailers, err := textproto.NewReader(r.reader).ReadMIMEHeader()
			if err != nil {
				return 0, fmt.Errorf("读取 aws-chunked trailer 失败: %w", err)
			}
			r.trailerValue = strings.TrimSpace(trailers.Get(r.checksumName))
			if err := r.verify(); err != nil {
				return 0, err
			}
			r.done = true
			return 0, io.EOF
		}
		r.remaining = size
	}
	if int64(len(p)) > r.remaining {
		p = p[:r.remaining]
	}
	n, err := r.reader.Read(p)
	if n > 0 {
		_, _ = r.checksum.Write(p[:n])
		r.decoded += int64(n)
		r.remaining -= int64(n)
		if r.remaining == 0 {
			r.needChunkCRLF = true
		}
	}
	if errors.Is(err, io.EOF) {
		return n, io.ErrUnexpectedEOF
	}
	return n, err
}

func (r *awsChunkedReader) verify() error {
	if r.decoded != r.expectedDecoded {
		return fmt.Errorf("x-amz-decoded-content-length 不匹配")
	}
	expected, err := base64.StdEncoding.DecodeString(r.trailerValue)
	if err != nil || len(expected) == 0 {
		return fmt.Errorf("aws-chunked trailer 校验和非法")
	}
	actual := r.checksum.Sum(nil)
	if len(actual) != len(expected) {
		return fmt.Errorf("aws-chunked trailer 校验和不匹配")
	}
	var mismatch byte
	for i := range actual {
		mismatch |= actual[i] ^ expected[i]
	}
	if mismatch != 0 {
		return fmt.Errorf("aws-chunked trailer 校验和不匹配")
	}
	return nil
}
