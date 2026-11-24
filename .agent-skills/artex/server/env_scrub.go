package server

import "os"

// secretEnv lists the credentials read from the environment only at startup:
// ARTEX_PG_DSN and ARTEX_PG_PASSWORD by NewManager (the password is a separate
// variable so Docker Compose does not paste it into a URL), ARTEX_SECRET_KEY,
// and the LLM API keys and custom headers by agent.FromEnv inside New.
// agent.FromEnv also reads ARTEX_LLM_PROXY and ARTEX_LLM_BASE_URL: both are URLs that
// can carry credentials in their userinfo (http://user:pass@proxy:3128). The archive
// store also captures ARTEX_ARCHIVE_S3_* credentials during New, before the scrub,
// so the client can use them without passing them to agent child processes.
//
// Without that override the AWS SDK's default chain reads the AWS_* names below
// while the store is built (LoadDefaultConfig) and keeps what it needs: the static
// keys, or the container endpoint and token and the web-identity role and token
// file path it fetches credentials from later. Credentials that come from a shared
// credentials or config file, or from the instance metadata service, are not in
// the environment: the scrub does not hide them from child processes.
var secretEnv = []string{
	"ARTEX_PG_DSN", "ARTEX_PG_PASSWORD", "ARTEX_SECRET_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
	"ARTEX_LLM_API_KEY", "ARTEX_LLM_CUSTOM_HEADERS",
	"ARTEX_LLM_PROXY", "ARTEX_LLM_BASE_URL",
	"ARTEX_ARCHIVE_S3_ACCESS_KEY_ID", "ARTEX_ARCHIVE_S3_SECRET_ACCESS_KEY", "ARTEX_ARCHIVE_S3_SESSION_TOKEN",
	"AWS_ACCESS_KEY_ID", "AWS_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY", "AWS_SECRET_KEY", "AWS_SESSION_TOKEN",
	"AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_AUTHORIZATION_TOKEN", "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
	"AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_ARN",
}

// ScrubSecretEnv removes secretEnv from the process environment once startup has
// read it. Child processes (agent shells, custom tools, MCP stdio servers) copy
// os.Environ() when they are spawned, so they no longer inherit these values.
//
// It runs inside New, after both readers and before the MCP discovery goroutine
// and the task resume loop: both can spawn children, and resuming a task starts
// workers that run shells. Scrubbing in main after New returned left that window
// open.
func ScrubSecretEnv() {
	for _, k := range secretEnv {
		_ = os.Unsetenv(k)
	}
}

// Option configures New. Options keep the test call sites unchanged: only the
// binary opts into scrubbing, because tests create several servers in one
// process and still need ARTEX_PG_DSN on later calls.
type Option func(*Server)

// WithSecretScrub makes New drop the startup secrets after reading them, before
// the MCP discovery goroutine and the task resume loop can spawn children.
func WithSecretScrub() Option { return func(s *Server) { s.scrubSecrets = true } }
