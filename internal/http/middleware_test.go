package httpserver

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
)

func TestMiddlewareRecoversPanicAndPreservesRequestID(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := WithRequestID(WithRecover(logger, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("test panic")
	})))
	request := httptest.NewRequest(http.MethodGet, "/panic", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	requestID := response.Header().Get("X-Request-Id")
	if !regexp.MustCompile(`^req_[0-9a-f]{16}$`).MatchString(requestID) {
		t.Fatalf("invalid request id: %q", requestID)
	}
	assertResponseRequestID(t, response)
	assertErrorResponse(t, response, http.StatusInternalServerError, CodeInternalError)
}

func TestStatusOfCoversPublicErrorContract(t *testing.T) {
	tests := map[string]int{
		CodeUnauthorized:        http.StatusUnauthorized,
		CodeForbidden:           http.StatusForbidden,
		CodeSourceNotFound:      http.StatusNotFound,
		CodePolicyNotFound:      http.StatusNotFound,
		CodeFileNotFound:        http.StatusNotFound,
		CodeTokenNotFound:       http.StatusNotFound,
		CodeSourceDisabled:      http.StatusForbidden,
		CodeConflict:            http.StatusConflict,
		CodeFileAlreadyExists:   http.StatusConflict,
		CodeLocked:              http.StatusLocked,
		CodeValidationError:     http.StatusBadRequest,
		CodePathInvalid:         http.StatusBadRequest,
		CodePathExcluded:        http.StatusBadRequest,
		CodePayloadTooLarge:     http.StatusRequestEntityTooLarge,
		CodeRateLimited:         http.StatusTooManyRequests,
		CodeInsufficientStorage: http.StatusInsufficientStorage,
		CodeNotImplemented:      http.StatusNotImplemented,
		CodeInternalError:       http.StatusInternalServerError,
	}
	for code, want := range tests {
		if got := statusOf(code); got != want {
			t.Errorf("statusOf(%q)=%d want=%d", code, got, want)
		}
	}
}
