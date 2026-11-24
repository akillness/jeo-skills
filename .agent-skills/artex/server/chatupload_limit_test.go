package server

import (
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

type uploadLimitZeroReader struct{}

func (uploadLimitZeroReader) Read(p []byte) (int, error) {
	clear(p)
	return len(p), nil
}

func TestChatUpload512MiBBoundary(t *testing.T) {
	if maxChatUpload != 512<<20 {
		t.Fatal("attachment limit must be 512 MiB")
	}
	cases := []struct {
		name   string
		sizes  []int64
		status int
	}{
		{"above previous limit", []int64{129 << 20}, http.StatusOK},
		{"exactly 512 MiB", []int64{512 << 20}, http.StatusOK},
		{"single file over limit", []int64{(512 << 20) + 1}, http.StatusRequestEntityTooLarge},
		{"combined files exactly at limit", []int64{256 << 20, 256 << 20}, http.StatusOK},
		{"combined files over limit", []int64{256 << 20, (256 << 20) + 1}, http.StatusRequestEntityTooLarge},
		{"request body over limit", []int64{(513 << 20) + 1}, http.StatusRequestEntityTooLarge},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			workDir := t.TempDir()
			spillDir := t.TempDir()
			t.Setenv("TMPDIR", spillDir)
			body, writer := io.Pipe()
			form := multipart.NewWriter(writer)
			done := make(chan error, 1)
			go func() {
				for _, size := range tc.sizes {
					part, err := form.CreateFormFile("file", "boundary.bin")
					if err == nil {
						_, err = io.CopyN(part, uploadLimitZeroReader{}, size)
					}
					if err != nil {
						writer.CloseWithError(err)
						done <- err
						return
					}
				}
				err := form.Close()
				writer.CloseWithError(err)
				done <- err
			}()
			req := httptest.NewRequest(http.MethodPost, "/api/chat/upload?scope=staging&id=boundary-test", body)
			req.Header.Set("Content-Type", form.FormDataContentType())
			rec := httptest.NewRecorder()
			srv := &Server{m: &Manager{dir: workDir}}
			srv.chatUpload(rec, req)
			body.Close()
			writeErr := <-done
			if rec.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", rec.Code, tc.status, rec.Body.String())
			}
			if tc.status == http.StatusOK {
				if writeErr != nil {
					t.Fatal(writeErr)
				}
				var reply struct {
					Attachments []chatAttachment `json:"attachments"`
				}
				if err := json.Unmarshal(rec.Body.Bytes(), &reply); err != nil {
					t.Fatal(err)
				}
				if len(reply.Attachments) != len(tc.sizes) {
					t.Fatalf("got %d attachments", len(reply.Attachments))
				}
				for i, attachment := range reply.Attachments {
					info, err := os.Stat(attachment.Abs)
					if err != nil || attachment.Size != tc.sizes[i] || info.Size() != tc.sizes[i] {
						t.Fatalf("attachment size mismatch: %+v, %v", attachment, err)
					}
				}
			} else {
				var reply struct {
					Error string `json:"error"`
				}
				if err := json.Unmarshal(rec.Body.Bytes(), &reply); err != nil {
					t.Fatal(err)
				}
				if reply.Error != "files exceed the 512 MiB upload limit" {
					t.Fatalf("unexpected size-limit error: %q", reply.Error)
				}
				files, err := os.ReadDir(filepath.Join(workDir, "drafts", "boundary-test", "uploads"))
				if err != nil || len(files) != 0 {
					t.Fatalf("oversized upload saved files: %v, %v", files, err)
				}
			}
			spillFiles, err := os.ReadDir(spillDir)
			if err != nil || len(spillFiles) != 0 {
				t.Fatalf("multipart files were not cleaned up: %v, %v", spillFiles, err)
			}
		})
	}
}
