package archivestore

import (
	"strings"
	"testing"
)

func TestArchiveStorageEnvironment(t *testing.T) {
	for _, key := range []string{
		"ARTEX_ARCHIVE_STORAGE", "ARTEX_ARCHIVE_S3_ENDPOINT", "ARTEX_ARCHIVE_S3_REGION",
		"ARTEX_ARCHIVE_S3_BUCKET", "ARTEX_ARCHIVE_S3_PREFIX", "ARTEX_ARCHIVE_S3_ACCESS_KEY_ID",
		"ARTEX_ARCHIVE_S3_SECRET_ACCESS_KEY", "ARTEX_ARCHIVE_S3_PATH_STYLE",
		"ARTEX_ARCHIVE_S3_SESSION_TOKEN", "ARTEX_ARCHIVE_S3_SSE", "ARTEX_ARCHIVE_S3_KMS_KEY_ID",
	} {
		t.Setenv(key, "")
	}
	for _, backend := range []string{"", "local"} {
		t.Setenv("ARTEX_ARCHIVE_STORAGE", backend)
		if store, err := FromEnv(); err != nil || store != nil {
			t.Fatalf("local default: %v %v", store, err)
		}
	}
	for _, backend := range []string{"unknown", "s3"} {
		t.Setenv("ARTEX_ARCHIVE_STORAGE", backend)
		if _, err := FromEnv(); err == nil {
			t.Fatalf("%q silently fell back to local", backend)
		}
	}
	t.Setenv("ARTEX_ARCHIVE_S3_ENDPOINT", "http://127.0.0.1:9000")
	t.Setenv("ARTEX_ARCHIVE_S3_BUCKET", "test-bucket")
	t.Setenv("ARTEX_ARCHIVE_S3_ACCESS_KEY_ID", "test-key")
	t.Setenv("ARTEX_ARCHIVE_S3_SECRET_ACCESS_KEY", "test-secret")
	t.Setenv("ARTEX_ARCHIVE_S3_PATH_STYLE", "true")
	store, err := FromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if uri := store.URI(1, 2, "checksum"); uri != "s3://test-bucket/artex/tasks/task-1-2-checksum.tar.zst" {
		t.Fatal("unexpected default object location", uri)
	}
	t.Setenv("ARTEX_ARCHIVE_S3_SECRET_ACCESS_KEY", "")
	if _, err := FromEnv(); err == nil {
		t.Fatal("missing credentials accepted")
	}
}

func TestArchiveEndpointValidation(t *testing.T) {
	config := Config{Bucket: "test", AccessKey: "test-key", SecretKey: "test-secret"}
	for _, endpoint := range []string{"https://objects.example.test", "http://127.0.0.1:9000", "http://127.0.0.2:9000", "http://[::1]:9000", "http://localhost:9000"} {
		config.Endpoint = endpoint
		if _, err := New(config); err != nil {
			t.Errorf("rejected %s: %v", endpoint, err)
		}
	}
	for _, endpoint := range []string{"http://objects.example.test", "https://user:test-secret@objects.example.test", "https://objects.example.test/bucket", "https://objects.example.test?token=test-secret", "https://objects.example.test#fragment"} {
		config.Endpoint = endpoint
		if _, err := New(config); err == nil {
			t.Error("accepted endpoint with non-loopback HTTP, credentials, path, query or fragment")
		} else if strings.Contains(err.Error(), "test-secret") {
			t.Fatal("configuration error disclosed a secret")
		}
	}
}

func TestArchiveEncryptionConfiguration(t *testing.T) {
	c := Config{Endpoint: "https://objects.example.test", Bucket: "test", AccessKey: "test", SecretKey: "test"}
	for _, mode := range []string{"none", "invalid"} {
		c.SSE = mode
		if _, err := New(c); err == nil {
			t.Fatal("unencrypted/invalid mode accepted")
		}
	}
	c.SSE = "AES256"
	c.KMSKeyID = "alias/archive"
	if _, err := New(c); err == nil {
		t.Fatal("KMS key accepted with SSE-S3")
	}
	c.SSE = "aws:kms"
	for _, key := range []string{"alias/archive", "bare-key-id", "arn:aws:kms:us-east-1:123456789012:alias/archive"} {
		c.KMSKeyID = key
		if _, err := New(c); err == nil {
			t.Fatalf("accepted noncanonical KMS key %q", key)
		}
	}
	c.KMSKeyID = "arn:aws:kms:us-east-1:123456789012:key/test-key"
	if _, err := New(c); err != nil {
		t.Fatal(err)
	}
}
