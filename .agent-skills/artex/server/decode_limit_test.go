package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeAcceptsSmallBody(t *testing.T) {
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"x":"ok"}`))
	var v map[string]string
	if err := decode(w, r, &v); err != nil || v["x"] != "ok" {
		t.Fatalf("decode: %v %+v", err, v)
	}
}

func TestDecodeCapsBody(t *testing.T) {
	w := httptest.NewRecorder()
	body := strings.NewReader(`{"x":"` + strings.Repeat("a", decodeMaxBytes) + `"}`)
	r := httptest.NewRequest(http.MethodPost, "/", body)
	var v map[string]string
	err := decode(w, r, &v)
	var tooLarge *http.MaxBytesError
	if !errors.As(err, &tooLarge) {
		t.Fatalf("err=%v, want the body cap", err)
	}
}

func TestRawJSONBodyOverTheCapIs413(t *testing.T) {
	h := limitRequestBody(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var v map[string]string
		if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
			writeErr(w, 400, err.Error())
			return
		}
		writeJSON(w, 200, v)
	}))
	small := httptest.NewRecorder()
	h.ServeHTTP(small, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"x":"ok"}`)))
	if small.Code != 200 {
		t.Fatalf("small body status=%d", small.Code)
	}
	large := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"x":"`+strings.Repeat("a", decodeMaxBytes)+`"}`))
	h.ServeHTTP(large, req)
	if large.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status=%d body=%s, want 413", large.Code, large.Body.String())
	}
}

func TestMultipartBodyIsNotGivenTheJSONCap(t *testing.T) {
	h := limitRequestBody(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := r.Body.(*limitedBody); ok {
			t.Errorf("multipart body was given the JSON cap")
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("not-read"))
	r.Header.Set("Content-Type", "multipart/form-data; boundary=abc")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusNoContent {
		t.Fatalf("status=%d", w.Code)
	}
}
