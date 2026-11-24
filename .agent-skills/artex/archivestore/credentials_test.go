package archivestore

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func isolateAWSCredentials(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "AWS_DEFAULT_PROFILE",
		"AWS_ROLE_ARN", "AWS_ROLE_SESSION_NAME", "AWS_WEB_IDENTITY_TOKEN_FILE",
		"AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI",
		"AWS_CONTAINER_AUTHORIZATION_TOKEN", "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
		"AWS_EC2_METADATA_SERVICE_ENDPOINT", "AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE",
	} {
		t.Setenv(key, "")
	}
	dir := t.TempDir()
	t.Setenv("AWS_SHARED_CREDENTIALS_FILE", filepath.Join(dir, "credentials"))
	t.Setenv("AWS_CONFIG_FILE", filepath.Join(dir, "config"))
	t.Setenv("AWS_EC2_METADATA_DISABLED", "true")
}

func TestArchiveCredentialChain(t *testing.T) {
	config := Config{Endpoint: "https://objects.example.test", Bucket: "test"}
	for _, mode := range []string{"explicit-session", "environment", "shared-profile", "ecs", "imds"} {
		t.Run(mode, func(t *testing.T) {
			isolateAWSCredentials(t)
			c := config
			switch mode {
			case "explicit-session":
				t.Setenv("AWS_ACCESS_KEY_ID", "other-key")
				t.Setenv("AWS_SECRET_ACCESS_KEY", "other-secret")
				c.AccessKey, c.SecretKey, c.SessionToken = "fixture-key", "fixture-secret", "fixture-session"
			case "environment":
				t.Setenv("AWS_ACCESS_KEY_ID", "fixture-key")
				t.Setenv("AWS_SECRET_ACCESS_KEY", "fixture-secret")
				t.Setenv("AWS_SESSION_TOKEN", "fixture-session")
			case "shared-profile":
				t.Setenv("AWS_PROFILE", "archive")
				data := `[archive]
aws_access_key_id=fixture-key
aws_secret_access_key=fixture-secret
aws_session_token=fixture-session
`
				if err := os.WriteFile(os.Getenv("AWS_SHARED_CREDENTIALS_FILE"), []byte(data), 0600); err != nil {
					t.Fatal(err)
				}
			case "ecs", "imds":
				srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if mode == "imds" {
						switch r.URL.Path {
						case "/latest/api/token":
							if r.Method != "PUT" {
								t.Error("IMDS did not use token request")
							}
							w.Header().Set("X-aws-ec2-metadata-token-ttl-seconds", "21600")
							fmt.Fprint(w, "fixture-imds-token")
							return
						case "/latest/meta-data/iam/security-credentials/":
							if r.Header.Get("X-aws-ec2-metadata-token") != "fixture-imds-token" {
								t.Error("missing IMDSv2 token")
							}
							fmt.Fprint(w, "archive-role")
							return
						case "/latest/meta-data/iam/security-credentials/archive-role":
							if r.Header.Get("X-aws-ec2-metadata-token") != "fixture-imds-token" {
								t.Error("missing IMDSv2 token")
							}
						default:
							t.Errorf("unexpected IMDS request %s", r.URL.Path)
							w.WriteHeader(404)
							return
						}
					} else if r.Header.Get("Authorization") != "fixture-container-token" {
						t.Error("missing ECS authorization token")
					}
					_ = json.NewEncoder(w).Encode(map[string]any{
						"Code": "Success", "AccessKeyId": "fixture-key", "SecretAccessKey": "fixture-secret",
						"Token": "fixture-session", "Expiration": time.Now().Add(time.Hour).UTC().Format(time.RFC3339),
					})
				}))
				defer srv.Close()
				if mode == "imds" {
					t.Setenv("AWS_EC2_METADATA_DISABLED", "false")
					t.Setenv("AWS_EC2_METADATA_V1_DISABLED", "true")
					t.Setenv("AWS_EC2_METADATA_SERVICE_ENDPOINT", srv.URL)
				} else {
					t.Setenv("AWS_CONTAINER_CREDENTIALS_FULL_URI", srv.URL+"/credentials")
					t.Setenv("AWS_CONTAINER_AUTHORIZATION_TOKEN", "fixture-container-token")
				}
			}
			store, err := New(c)
			if err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			credentials, err := store.client.Options().Credentials.Retrieve(ctx)
			if err != nil {
				t.Fatal(err)
			}
			if credentials.AccessKeyID != "fixture-key" || credentials.SecretAccessKey != "fixture-secret" || credentials.SessionToken != "fixture-session" {
				t.Fatal("wrong credential provider or session token")
			}
			if (mode == "imds" || mode == "ecs") && !credentials.CanExpire {
				t.Fatal("role credentials must remain refreshable")
			}
		})
	}
}

func TestArchiveIncompleteCredentialOverride(t *testing.T) {
	isolateAWSCredentials(t)
	t.Setenv("AWS_ACCESS_KEY_ID", "valid-ambient-key")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "valid-ambient-secret")
	for _, c := range []Config{{AccessKey: "private-value"}, {SecretKey: "private-value"}, {SessionToken: "private-value"}} {
		c.Endpoint, c.Bucket = "https://objects.example.test", "test"
		if _, err := New(c); err == nil || strings.Contains(err.Error(), "private-value") {
			t.Fatalf("partial override must fail without disclosing credentials: %v", err)
		}
	}
}

// The server removes the AWS credential variables from its environment once the
// store is built, so that child processes do not inherit them. The SDK must have
// captured by then everything it needs to sign: the static keys, and for the
// container and web-identity providers the endpoint, token and file path they
// fetch credentials from later (their first fetch happens after the scrub here).
func TestReview318CredentialsSurviveEnvScrub(t *testing.T) {
	scrubbed := []string{
		"AWS_ACCESS_KEY_ID", "AWS_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY", "AWS_SECRET_KEY", "AWS_SESSION_TOKEN",
		"AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_AUTHORIZATION_TOKEN", "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
		"AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_ARN",
	}
	for _, mode := range []string{"environment", "environment-alternate-names", "container", "web-identity"} {
		t.Run(mode, func(t *testing.T) {
			isolateAWSCredentials(t)
			for _, key := range append([]string{
				"ARTEX_ARCHIVE_S3_ACCESS_KEY_ID", "ARTEX_ARCHIVE_S3_SECRET_ACCESS_KEY", "ARTEX_ARCHIVE_S3_SESSION_TOKEN",
				"ARTEX_ARCHIVE_S3_SSE", "ARTEX_ARCHIVE_S3_KMS_KEY_ID", "ARTEX_ARCHIVE_S3_PREFIX", "AWS_ENDPOINT_URL_STS",
			}, scrubbed...) {
				t.Setenv(key, "")
			}
			var envScrubbed atomic.Bool
			var fetchedAfterScrub atomic.Int32
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if envScrubbed.Load() {
					fetchedAfterScrub.Add(1)
				}
				expiration := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
				if mode == "container" {
					if r.Header.Get("Authorization") != "fixture-container-token" {
						t.Error("missing container authorization token")
					}
					_ = json.NewEncoder(w).Encode(map[string]any{
						"AccessKeyId": "fixture-key", "SecretAccessKey": "fixture-secret",
						"Token": "fixture-session", "Expiration": expiration,
					})
					return
				}
				if err := r.ParseForm(); err != nil || r.PostForm.Get("Action") != "AssumeRoleWithWebIdentity" ||
					r.PostForm.Get("WebIdentityToken") != "fixture-web-identity-token" ||
					r.PostForm.Get("RoleArn") != "arn:aws:iam::123456789012:role/archive" {
					t.Errorf("unexpected STS request: %v %v", err, r.PostForm)
				}
				w.Header().Set("Content-Type", "text/xml")
				fmt.Fprintf(w, `<AssumeRoleWithWebIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><AssumeRoleWithWebIdentityResult><Credentials><AccessKeyId>fixture-key</AccessKeyId><SecretAccessKey>fixture-secret</SecretAccessKey><SessionToken>fixture-session</SessionToken><Expiration>%s</Expiration></Credentials></AssumeRoleWithWebIdentityResult></AssumeRoleWithWebIdentityResponse>`, expiration)
			}))
			defer provider.Close()
			switch mode {
			case "environment":
				t.Setenv("AWS_ACCESS_KEY_ID", "fixture-key")
				t.Setenv("AWS_SECRET_ACCESS_KEY", "fixture-secret")
				t.Setenv("AWS_SESSION_TOKEN", "fixture-session")
			case "environment-alternate-names":
				t.Setenv("AWS_ACCESS_KEY", "fixture-key")
				t.Setenv("AWS_SECRET_KEY", "fixture-secret")
				t.Setenv("AWS_SESSION_TOKEN", "fixture-session")
			case "container":
				t.Setenv("AWS_CONTAINER_CREDENTIALS_FULL_URI", provider.URL+"/credentials")
				t.Setenv("AWS_CONTAINER_AUTHORIZATION_TOKEN", "fixture-container-token")
			case "web-identity":
				tokenFile := filepath.Join(t.TempDir(), "token")
				if err := os.WriteFile(tokenFile, []byte("fixture-web-identity-token"), 0600); err != nil {
					t.Fatal(err)
				}
				t.Setenv("AWS_WEB_IDENTITY_TOKEN_FILE", tokenFile)
				t.Setenv("AWS_ROLE_ARN", "arn:aws:iam::123456789012:role/archive")
				t.Setenv("AWS_ENDPOINT_URL_STS", provider.URL)
			}
			var authorization, sessionToken atomic.Value
			objects := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodHead {
					t.Errorf("unexpected S3 operation: %s", r.Method)
				}
				authorization.Store(r.Header.Get("Authorization"))
				sessionToken.Store(r.Header.Get("X-Amz-Security-Token"))
				w.WriteHeader(http.StatusNotFound)
			}))
			defer objects.Close()
			t.Setenv("ARTEX_ARCHIVE_STORAGE", "s3")
			t.Setenv("ARTEX_ARCHIVE_S3_ENDPOINT", objects.URL)
			t.Setenv("ARTEX_ARCHIVE_S3_REGION", "us-east-1")
			t.Setenv("ARTEX_ARCHIVE_S3_BUCKET", "fixture")
			t.Setenv("ARTEX_ARCHIVE_S3_PATH_STYLE", "true")
			store, err := FromEnv()
			if err != nil || store == nil {
				t.Fatalf("store from environment: %v", err)
			}
			for _, key := range scrubbed {
				if err := os.Unsetenv(key); err != nil {
					t.Fatal(err)
				}
			}
			envScrubbed.Store(true)

			// HEAD is the first request of a download. The fixture answers 404, so
			// the call fails; only the signature of the request matters here.
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			checksum := strings.Repeat("a", 64)
			err = store.Download(ctx, store.URI(1, 2, checksum), filepath.Join(t.TempDir(), "probe"), checksum, 1)
			if err == nil {
				t.Fatal("the fixture has no object: the download must fail")
			}
			got, _ := authorization.Load().(string)
			if !strings.Contains(got, "Credential=fixture-key/") || !strings.Contains(got, "Signature=") {
				t.Fatalf("request not signed with the captured key after the scrub: Authorization=%q (%v)", got, err)
			}
			if token, _ := sessionToken.Load().(string); token != "fixture-session" {
				t.Fatalf("session token lost after the scrub: %q", token)
			}
			if lazy := mode == "container" || mode == "web-identity"; lazy && fetchedAfterScrub.Load() == 0 {
				t.Fatal("the provider was expected to fetch its credentials after the scrub")
			}
		})
	}
}
