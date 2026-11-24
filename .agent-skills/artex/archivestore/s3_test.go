package archivestore

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func TestS3RoundTripAndIntegrity(t *testing.T) {
	for _, sse := range []string{"AES256", "aws:kms"} {
		kms := ""
		if sse == "aws:kms" {
			kms = "arn:aws:kms:us-east-1:123456789012:key/test-key"
		}
		for _, size := range []int{1024, 10 << 20} {
			t.Run(sse+"/"+strconv.Itoa(size), func(t *testing.T) {
				var mu sync.Mutex
				var object []byte
				parts := map[int][]byte{}
				corrupt, multipart := false, false
				srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					mu.Lock()
					defer mu.Unlock()
					q := r.URL.Query()
					if (r.Method == "PUT" && !q.Has("partNumber")) || (r.Method == "POST" && q.Has("uploads")) {
						if r.Header.Get("X-Amz-Server-Side-Encryption") != sse || r.Header.Get("X-Amz-Server-Side-Encryption-Aws-Kms-Key-Id") != kms {
							t.Error("upload did not explicitly request the configured encryption")
						}
					}
					if r.Method == "HEAD" {
						if r.Header.Get("X-Amz-Server-Side-Encryption") != "" {
							t.Error("encryption write header leaked into HEAD")
						}
						w.Header().Set("X-Amz-Server-Side-Encryption", sse)
						if kms != "" {
							w.Header().Set("X-Amz-Server-Side-Encryption-Aws-Kms-Key-Id", kms)
						}
					}
					w.Header().Set("ETag", `"test-etag"`)
					switch {
					case r.Method == "POST" && q.Has("uploads"):
						multipart = true
						fmt.Fprint(w, `<InitiateMultipartUploadResult><UploadId>test-upload</UploadId></InitiateMultipartUploadResult>`)
					case r.Method == "PUT" && q.Has("partNumber"):
						n, _ := strconv.Atoi(q.Get("partNumber"))
						parts[n], _ = io.ReadAll(r.Body)
					case r.Method == "POST" && q.Has("uploadId"):
						for i := 1; i <= len(parts); i++ {
							object = append(object, parts[i]...)
						}
						fmt.Fprint(w, `<CompleteMultipartUploadResult><ETag>test-etag</ETag></CompleteMultipartUploadResult>`)
					case r.Method == "PUT":
						object, _ = io.ReadAll(r.Body)
					case r.Method == "HEAD":
						w.Header().Set("Content-Length", strconv.Itoa(len(object)))
					case r.Method == "GET":
						data := object
						if corrupt {
							data = bytes.Clone(object)
							data[0] ^= 0xff
						}
						serveArchiveRange(t, w, r, data)
					case r.Method == "DELETE":
						object = nil
						w.WriteHeader(204)
					default:
						t.Errorf("unexpected request %s %s", r.Method, r.URL)
						w.WriteHeader(400)
					}
				}))
				defer srv.Close()
				store, err := New(Config{Endpoint: srv.URL, Bucket: "test-bucket", Prefix: "test/tasks", AccessKey: "test", SecretKey: "test", PathStyle: true, SSE: sse, KMSKeyID: kms})
				if err != nil {
					t.Fatal(err)
				}
				data := bytes.Repeat([]byte{0x42}, size)
				h := sha256.Sum256(data)
				checksum := hex.EncodeToString(h[:])
				root := t.TempDir()
				source := filepath.Join(root, "source")
				if err := os.WriteFile(source, data, 0600); err != nil {
					t.Fatal(err)
				}
				uri := store.URI(1, 2, checksum)
				ctx := context.Background()
				if err := store.Upload(ctx, uri, source, checksum); err != nil {
					t.Fatal(err)
				}
				if multipart != (size > 8<<20) {
					t.Fatalf("multipart=%v size=%d", multipart, size)
				}
				dest := filepath.Join(root, "download")
				if err := store.Download(ctx, uri, dest, checksum, int64(size)); err != nil {
					t.Fatal(err)
				}
				got, _ := os.ReadFile(dest)
				if !bytes.Equal(got, data) {
					t.Fatal("download differs")
				}
				mu.Lock()
				corrupt = true
				mu.Unlock()
				bad := filepath.Join(root, "bad")
				if err := store.Download(ctx, uri, bad, checksum, int64(size)); err == nil {
					t.Fatal("accepted corrupt object")
				}
				if _, err := os.Stat(bad); !os.IsNotExist(err) {
					t.Fatal("left corrupt download")
				}
				if err := store.Upload(ctx, uri, source, checksum); err == nil {
					t.Fatal("upload accepted failed readback")
				}
				if err := store.Delete(ctx, uri); err != nil {
					t.Fatal(err)
				}
			})
		}
	}
}

func serveArchiveRange(t *testing.T, w http.ResponseWriter, r *http.Request, data []byte) {
	t.Helper()
	var start, end int64
	if n, err := fmt.Sscanf(r.Header.Get("Range"), "bytes=%d-%d", &start, &end); err != nil || n != 2 || start < 0 || end < start || end >= int64(len(data)) {
		t.Errorf("invalid range %q", r.Header.Get("Range"))
		w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
		return
	}
	if r.Header.Get("If-Match") != `"test-etag"` {
		t.Errorf("missing object version condition: %q", r.Header.Get("If-Match"))
		w.WriteHeader(http.StatusPreconditionFailed)
		return
	}
	w.Header().Set("ETag", `"test-etag"`)
	w.Header().Set("Content-Length", strconv.FormatInt(end-start+1, 10))
	w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, len(data)))
	w.WriteHeader(http.StatusPartialContent)
	_, _ = w.Write(data[start : end+1])
}

func TestS3ReadbackRetriesInterruptedRange(t *testing.T) {
	data := append(bytes.Repeat([]byte{0x42}, int(archiveReadChunkSize)), bytes.Repeat([]byte{0x73}, 1024)...)
	var mu sync.Mutex
	var ranges []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		w.Header().Set("ETag", `"test-etag"`)
		if r.Method == "HEAD" {
			w.Header().Set("Content-Length", strconv.Itoa(len(data)))
			return
		}
		ranges = append(ranges, r.Header.Get("Range"))
		if len(ranges) == 2 {
			w.Header().Set("Content-Length", strconv.FormatInt(int64(len(data))-archiveReadChunkSize, 10))
			w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", archiveReadChunkSize, len(data)-1, len(data)))
			w.WriteHeader(http.StatusPartialContent)
			_, _ = w.Write(data[archiveReadChunkSize : archiveReadChunkSize+128]) // Close during a later chunk.
			return
		}
		serveArchiveRange(t, w, r, data)
	}))
	defer srv.Close()
	store := testRangeStore(t, srv.URL)
	h := sha256.Sum256(data)
	checksum := hex.EncodeToString(h[:])
	dest := filepath.Join(t.TempDir(), "archive")
	if err := store.Download(context.Background(), store.URI(1, 2, checksum), dest, checksum, int64(len(data))); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(dest)
	if err != nil || !bytes.Equal(got, data) {
		t.Fatalf("retried download differs: %v", err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(ranges) != 3 || ranges[1] != ranges[2] || ranges[0] != fmt.Sprintf("bytes=0-%d", archiveReadChunkSize-1) || ranges[2] != fmt.Sprintf("bytes=%d-%d", archiveReadChunkSize, len(data)-1) {
		t.Fatalf("retry did not stay within the interrupted range: %v", ranges)
	}
}

func testRangeStore(t *testing.T, endpoint string) *Store {
	t.Helper()
	s, err := New(Config{Endpoint: endpoint, Bucket: "test-bucket", Prefix: "test/tasks", AccessKey: "test", SecretKey: "test", PathStyle: true})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestS3ReadbackRejectsInvalidRangesAndExhaustedRetries(t *testing.T) {
	for _, mode := range []string{"ignored-range", "changed-etag", "changed-object", "truncated"} {
		t.Run(mode, func(t *testing.T) {
			data := bytes.Repeat([]byte{0x42}, 1024)
			var mu sync.Mutex
			gets := 0
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				mu.Lock()
				defer mu.Unlock()
				w.Header().Set("ETag", `"test-etag"`)
				if r.Method == "HEAD" {
					w.Header().Set("Content-Length", strconv.Itoa(len(data)))
					return
				}
				gets++
				if mode == "changed-object" {
					w.WriteHeader(http.StatusPreconditionFailed)
					return
				}
				w.Header().Set("Content-Length", strconv.Itoa(len(data)))
				if mode == "ignored-range" {
					_, _ = w.Write(data)
					return
				}
				if mode == "changed-etag" {
					w.Header().Set("ETag", `"different-object"`)
				}
				w.Header().Set("Content-Range", fmt.Sprintf("bytes 0-%d/%d", len(data)-1, len(data)))
				w.WriteHeader(http.StatusPartialContent)
				if mode == "truncated" {
					_, _ = w.Write(data[:128])
				} else {
					_, _ = w.Write(data)
				}
			}))
			defer srv.Close()
			store := testRangeStore(t, srv.URL)
			h := sha256.Sum256(data)
			checksum := hex.EncodeToString(h[:])
			dest := filepath.Join(t.TempDir(), "archive")
			if err := store.Download(context.Background(), store.URI(1, 2, checksum), dest, checksum, int64(len(data))); err == nil {
				t.Fatal("accepted invalid or incomplete readback")
			}
			if _, err := os.Stat(dest); !os.IsNotExist(err) {
				t.Fatal("left a failed download on disk")
			}
			mu.Lock()
			defer mu.Unlock()
			want := 1
			if mode == "truncated" {
				want = archiveReadAttempts
			}
			if gets != want {
				t.Fatalf("GET count %d, want %d", gets, want)
			}
		})
	}
}

type failedArchiveWriter struct{ err error }

func (w failedArchiveWriter) Write([]byte) (int, error) { return 0, w.err }

func TestS3ReadbackPropagatesOutputFailure(t *testing.T) {
	data := []byte("test archive")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("ETag", `"test-etag"`)
		if r.Method == "HEAD" {
			w.Header().Set("Content-Length", strconv.Itoa(len(data)))
			return
		}
		serveArchiveRange(t, w, r, data)
	}))
	defer srv.Close()
	store := testRangeStore(t, srv.URL)
	h := sha256.Sum256(data)
	outputError := errors.New("output disk full")
	err := store.readVerified(context.Background(), "test/tasks/archive", failedArchiveWriter{outputError}, hex.EncodeToString(h[:]), int64(len(data)), false)
	if !errors.Is(err, outputError) {
		t.Fatalf("lost output error: %v", err)
	}
}

func TestS3ReadbackStopsOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	data := bytes.Repeat([]byte{0x42}, 1024)
	gets := make(chan struct{}, archiveReadAttempts+1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("ETag", `"test-etag"`)
		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		if r.Method == "HEAD" {
			return
		}
		gets <- struct{}{}
		w.Header().Set("Content-Range", fmt.Sprintf("bytes 0-%d/%d", len(data)-1, len(data)))
		w.WriteHeader(http.StatusPartialContent)
		_, _ = w.Write(data[:128])
		w.(http.Flusher).Flush()
		cancel()
	}))
	defer srv.Close()
	store := testRangeStore(t, srv.URL)
	h := sha256.Sum256(data)
	checksum := hex.EncodeToString(h[:])
	dest := filepath.Join(t.TempDir(), "archive")
	err := store.Download(ctx, store.URI(1, 2, checksum), dest, checksum, int64(len(data)))
	if !errors.Is(err, context.Canceled) || len(gets) != 1 {
		t.Fatalf("cancellation was not honored: error=%v GETs=%d", err, len(gets))
	}
	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Fatal("left a cancelled download on disk")
	}
}

func TestS3RejectsForeignLocations(t *testing.T) {
	s, err := New(Config{Endpoint: "https://sfo3.digitaloceanspaces.com", Bucket: "allowed", Prefix: "archives/tasks", AccessKey: "test", SecretKey: "test"})
	if err != nil {
		t.Fatal(err)
	}
	for _, uri := range []string{"s3://other/archives/tasks/a", "s3://allowed/archives/other/a", "s3://allowed/archives/tasks/../a", "s3://allowed/archives/tasks/%2e%2e/a", "s3://allowed/archives/tasks/a?secret=x", "s3://user@allowed/archives/tasks/a", "file:///etc/passwd"} {
		if err := s.Validate(uri); err == nil {
			t.Errorf("accepted %s", uri)
		}
	}
	var absent *Store
	if absent.Validate("s3://allowed/archives/tasks/a") == nil {
		t.Fatal("missing config accepted")
	}
}

func TestS3UploadRejectsUnconfirmedEncryption(t *testing.T) {
	for _, mode := range []string{"missing", "different", "kms-without-key"} {
		t.Run(mode, func(t *testing.T) {
			data := []byte("private archive")
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.Method {
				case "PUT":
					_, _ = io.Copy(io.Discard, r.Body)
				case "DELETE":
					w.WriteHeader(204)
				case "HEAD":
					w.Header().Set("ETag", `"test-etag"`)
					w.Header().Set("Content-Length", strconv.Itoa(len(data)))
					if mode != "missing" {
						w.Header().Set("X-Amz-Server-Side-Encryption", "aws:kms")
					}
				default:
					t.Errorf("content must not be accepted before encryption confirmation: %s", r.Method)
					w.WriteHeader(400)
				}
			}))
			defer srv.Close()
			c := Config{Endpoint: srv.URL, Bucket: "test", Prefix: "tasks", AccessKey: "test", SecretKey: "test", PathStyle: true}
			if mode == "kms-without-key" {
				c.SSE = "aws:kms"
			}
			store, err := New(c)
			if err != nil {
				t.Fatal(err)
			}
			filename := filepath.Join(t.TempDir(), "source")
			if err := os.WriteFile(filename, data, 0600); err != nil {
				t.Fatal(err)
			}
			sum := sha256.Sum256(data)
			checksum := hex.EncodeToString(sum[:])
			if err := store.Upload(context.Background(), store.URI(1, 2, checksum), filename, checksum); err == nil || !strings.Contains(err.Error(), "encryption") {
				t.Fatalf("unconfirmed encryption accepted: %v", err)
			}
			if got, err := os.ReadFile(filename); err != nil || !bytes.Equal(got, data) {
				t.Fatal("source was not retained", err)
			}
		})
	}
}

func TestS3MultipartFailureAbortsUpload(t *testing.T) {
	var aborted atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		switch {
		case r.Method == "POST" && q.Has("uploads"):
			if r.Header.Get("X-Amz-Server-Side-Encryption") != "AES256" {
				t.Error("multipart encryption missing")
			}
			fmt.Fprint(w, `<InitiateMultipartUploadResult><UploadId>failed-upload</UploadId></InitiateMultipartUploadResult>`)
		case r.Method == "PUT" && q.Has("partNumber"):
			_, _ = io.Copy(io.Discard, r.Body)
			w.WriteHeader(403)
		case r.Method == "DELETE" && q.Get("uploadId") == "failed-upload":
			aborted.Store(true)
			w.WriteHeader(204)
		default:
			t.Errorf("unexpected failed-upload request: %s", r.Method)
			w.WriteHeader(400)
		}
	}))
	defer srv.Close()
	store := testRangeStore(t, srv.URL)
	data := bytes.Repeat([]byte("x"), 9<<20)
	checksum := sha256.Sum256(data)
	sum := hex.EncodeToString(checksum[:])
	filename := filepath.Join(t.TempDir(), "source")
	if err := os.WriteFile(filename, data, 0600); err != nil {
		t.Fatal(err)
	}
	if err := store.Upload(context.Background(), store.URI(1, 2, sum), filename, sum); err == nil {
		t.Fatal("failed part accepted")
	}
	if !aborted.Load() {
		t.Fatal("failed multipart upload was not aborted")
	}
	if info, err := os.Stat(filename); err != nil || info.Size() != int64(len(data)) {
		t.Fatal("source was not retained", err)
	}
}
