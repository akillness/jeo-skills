package archivestore

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
)

func archiveSource(t *testing.T, data []byte) (string, string) {
	t.Helper()
	filename := filepath.Join(t.TempDir(), "source")
	if err := os.WriteFile(filename, data, 0600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(data)
	return filename, hex.EncodeToString(sum[:])
}

func TestS3VerificationFailureCleansUploadedVersion(t *testing.T) {
	for _, failure := range []string{"wrong-kms", "checksum", "cancelled", "delete-denied"} {
		t.Run(failure, func(t *testing.T) {
			data := []byte("private archive")
			source, checksum := archiveSource(t, data)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			var present, deleted atomic.Bool
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.Method {
				case "PUT":
					_, _ = io.Copy(io.Discard, r.Body)
					present.Store(true)
					w.Header().Set("X-Amz-Version-Id", "uploaded-version")
				case "HEAD":
					w.Header().Set("ETag", `"test-etag"`)
					w.Header().Set("Content-Length", strconv.Itoa(len(data)))
					w.Header().Set("X-Amz-Server-Side-Encryption", "aws:kms")
					kms := "arn:aws:kms:us-east-1:123456789012:key/expected"
					if failure == "wrong-kms" {
						kms = "arn:aws:kms:us-east-1:123456789012:key/different"
					}
					w.Header().Set("X-Amz-Server-Side-Encryption-Aws-Kms-Key-Id", kms)
					if failure == "cancelled" {
						cancel()
					}
				case "GET":
					corrupt := bytes.Clone(data)
					corrupt[0] ^= 0xff
					serveArchiveRange(t, w, r, corrupt)
				case "DELETE":
					if r.URL.Query().Get("versionId") != "uploaded-version" {
						t.Error("cleanup did not target uploaded version")
					}
					deleted.Store(true)
					if failure == "delete-denied" {
						w.WriteHeader(403)
						return
					}
					present.Store(false)
					w.WriteHeader(204)
				default:
					t.Errorf("unexpected request %s", r.Method)
					w.WriteHeader(400)
				}
			}))
			defer srv.Close()
			store, err := New(Config{Endpoint: srv.URL, Bucket: "test", AccessKey: "test", SecretKey: "test", PathStyle: true,
				SSE: "aws:kms", KMSKeyID: "arn:aws:kms:us-east-1:123456789012:key/expected"})
			if err != nil {
				t.Fatal(err)
			}
			err = store.Upload(ctx, store.URI(1, 2, checksum), source, checksum)
			if err == nil {
				t.Fatal("accepted failed verification")
			}
			if failure == "wrong-kms" && !strings.Contains(err.Error(), "encryption") {
				t.Fatal(err)
			}
			if failure == "cancelled" && !errors.Is(err, context.Canceled) {
				t.Fatal(err)
			}
			if failure == "delete-denied" && (!strings.Contains(err.Error(), "SHA-256") || !strings.Contains(err.Error(), "delete unverified archive")) {
				t.Fatalf("verification and cleanup errors must both survive: %v", err)
			}
			if !deleted.Load() || present.Load() != (failure == "delete-denied") {
				t.Fatal("unverified object cleanup was not attempted/completed")
			}
			if got, readErr := os.ReadFile(source); readErr != nil || !bytes.Equal(got, data) {
				t.Fatal("source changed", readErr)
			}
		})
	}
}

func TestS3CancelledMultipartAbortsWithFreshContext(t *testing.T) {
	for _, denyAbort := range []bool{false, true} {
		t.Run(strconv.FormatBool(denyAbort), func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			var aborted atomic.Bool
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				q := r.URL.Query()
				switch {
				case r.Method == "POST" && q.Has("uploads"):
					fmt.Fprint(w, `<InitiateMultipartUploadResult><UploadId>cancelled-upload</UploadId></InitiateMultipartUploadResult>`)
				case r.Method == "PUT" && q.Has("partNumber"):
					cancel()
					_, _ = io.Copy(io.Discard, r.Body)
					w.WriteHeader(403)
				case r.Method == "DELETE" && q.Get("uploadId") == "cancelled-upload":
					aborted.Store(true)
					if denyAbort {
						w.WriteHeader(403)
					} else {
						w.WriteHeader(204)
					}
				default:
					t.Errorf("unexpected request %s", r.Method)
					w.WriteHeader(400)
				}
			}))
			defer srv.Close()
			data := bytes.Repeat([]byte("x"), 9<<20)
			source, sum := archiveSource(t, data)
			store := testRangeStore(t, srv.URL)
			err := store.Upload(ctx, store.URI(1, 2, sum), source, sum)
			if !errors.Is(err, context.Canceled) || !aborted.Load() {
				t.Fatalf("cancelled upload not aborted: %v", err)
			}
			if denyAbort && !strings.Contains(err.Error(), "abort archive multipart upload") {
				t.Fatalf("cleanup failure lost: %v", err)
			}
			if got, readErr := os.ReadFile(source); readErr != nil || !bytes.Equal(got, data) {
				t.Fatal("source changed", readErr)
			}
		})
	}
}

func TestS3SignedRequestsNeverFollowRedirects(t *testing.T) {
	var reached atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached.Add(1); w.WriteHeader(204) }))
	defer target.Close()
	for _, status := range []int{301, 302, 303, 307, 308} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") == "" || r.Header.Get("X-Amz-Security-Token") != "fixture-session" {
					t.Error("fixture request must be signed with session credentials")
				}
				w.Header().Set("Location", target.URL+"/redirected")
				w.WriteHeader(status)
			}))
			defer origin.Close()
			store, err := New(Config{Endpoint: origin.URL, Bucket: "test", AccessKey: "test", SecretKey: "test", SessionToken: "fixture-session", PathStyle: true})
			if err != nil {
				t.Fatal(err)
			}
			if err := store.Delete(context.Background(), store.URI(1, 2, "test")); err == nil {
				t.Fatal("redirect accepted")
			}
			if reached.Load() != 0 {
				t.Fatal("signed request followed redirect")
			}
		})
	}
}

func TestS3CustomCABundleForBothCredentialModes(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	defer srv.Close()
	for _, explicit := range []bool{false, true} {
		t.Run(strconv.FormatBool(explicit), func(t *testing.T) {
			isolateAWSCredentials(t)
			ca := filepath.Join(t.TempDir(), "ca.pem")
			if err := os.WriteFile(ca, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: srv.Certificate().Raw}), 0600); err != nil {
				t.Fatal(err)
			}
			t.Setenv("AWS_CA_BUNDLE", ca)
			c := Config{Endpoint: srv.URL, Bucket: "test", PathStyle: true}
			if explicit {
				c.AccessKey, c.SecretKey = "fixture", "fixture"
			} else {
				t.Setenv("AWS_ACCESS_KEY_ID", "fixture")
				t.Setenv("AWS_SECRET_ACCESS_KEY", "fixture")
			}
			store, err := New(c)
			if err != nil {
				t.Fatal(err)
			}
			if err := store.Delete(context.Background(), store.URI(1, 2, "test")); err != nil {
				t.Fatalf("configured CA not used: %v", err)
			}
		})
	}
}

func TestS3RangeRetriesHaveOneWireAttemptEach(t *testing.T) {
	for _, status := range []int{403, 429, 503} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			var gets atomic.Int32
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gets.Add(1)
				w.WriteHeader(status)
			}))
			defer srv.Close()
			store := testRangeStore(t, srv.URL)
			if _, err := store.readArchiveChunk(context.Background(), "key", `"etag"`, 0, 9, 10); err == nil {
				t.Fatal("failed request accepted")
			}
			want := int32(archiveReadAttempts)
			if status == 403 {
				want = 1
			}
			if got := gets.Load(); got != want {
				t.Fatalf("wire requests=%d want=%d", got, want)
			}
		})
	}
}
