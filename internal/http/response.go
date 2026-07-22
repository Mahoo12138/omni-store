// Package httpserver 负责路由注册、中间件、统一响应和错误处理。
package httpserver

import (
	"encoding/json"
	"net/http"
)

// MVP 错误码（README §19.4）。
const (
	CodeUnauthorized        = "UNAUTHORIZED"
	CodeForbidden           = "FORBIDDEN"
	CodeSourceNotFound      = "SOURCE_NOT_FOUND"
	CodeSourceDisabled      = "SOURCE_DISABLED"
	CodePathInvalid         = "PATH_INVALID"
	CodePathExcluded        = "PATH_EXCLUDED"
	CodeFileNotFound        = "FILE_NOT_FOUND"
	CodeFileAlreadyExists   = "FILE_ALREADY_EXISTS"
	CodeTokenNotFound       = "TOKEN_NOT_FOUND"
	CodeConflict            = "CONFLICT"
	CodeLocked              = "LOCKED"
	CodeValidationError     = "VALIDATION_ERROR"
	CodePayloadTooLarge     = "PAYLOAD_TOO_LARGE"
	CodeInsufficientStorage = "INSUFFICIENT_STORAGE"
	CodeRateLimited         = "RATE_LIMITED"
	CodeInternalError       = "INTERNAL_ERROR"
	CodeNotImplemented      = "NOT_IMPLEMENTED"
)

// statusOf 映射错误码到 HTTP 状态码（README §19.4）。
func statusOf(code string) int {
	switch code {
	case CodeUnauthorized:
		return http.StatusUnauthorized
	case CodeForbidden:
		return http.StatusForbidden
	case CodeSourceNotFound, CodeFileNotFound, CodeTokenNotFound:
		return http.StatusNotFound
	case CodeSourceDisabled:
		return http.StatusForbidden
	case CodeConflict, CodeFileAlreadyExists:
		return http.StatusConflict
	case CodeLocked:
		return http.StatusLocked
	case CodeValidationError, CodePathInvalid, CodePathExcluded:
		return http.StatusBadRequest
	case CodePayloadTooLarge:
		return http.StatusRequestEntityTooLarge
	case CodeRateLimited:
		return http.StatusTooManyRequests
	case CodeInsufficientStorage:
		return http.StatusInsufficientStorage
	case CodeNotImplemented:
		return http.StatusNotImplemented
	default:
		return http.StatusInternalServerError
	}
}

type successEnvelope struct {
	Data      any    `json:"data"`
	RequestID string `json:"request_id"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

type errorEnvelope struct {
	Error     errorBody `json:"error"`
	RequestID string    `json:"request_id"`
}

// ListData 是列表响应的 data 结构。
type ListData struct {
	Items any   `json:"items"`
	Total int64 `json:"total"`
}

// WriteData 写统一成功响应。
func WriteData(w http.ResponseWriter, r *http.Request, data any) {
	writeJSON(w, http.StatusOK, successEnvelope{Data: data, RequestID: RequestIDFrom(r.Context())})
}

// WriteError 写统一错误响应，HTTP 状态码由错误码决定。
func WriteError(w http.ResponseWriter, r *http.Request, code, message string, details any) {
	writeJSON(w, statusOf(code), errorEnvelope{
		Error:     errorBody{Code: code, Message: message, Details: details},
		RequestID: RequestIDFrom(r.Context()),
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	// API JSON 一律 no-store（README §13.11）。
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
