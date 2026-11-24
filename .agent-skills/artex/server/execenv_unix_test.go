//go:build unix

package server

import (
	"os"
	"strings"
	"testing"
)

// The allowlist keeps the named variables and the extra names, and drops
// everything else, secrets under known and unknown names alike.
func TestExecutorEnvAllowlist(t *testing.T) {
	env := []string{
		"PATH=/usr/bin", "LANG=C.UTF-8", "LC_ALL=C", "LC_CTYPE=C.UTF-8", "HTTP_PROXY=http://127.0.0.1:8788",
		"SSL_CERT_FILE=/ca.pem", "PLAYWRIGHT_BROWSERS_PATH=/pw", envExecHome + "=/data/exec-home",
		"ARTEX_PG_DSN=postgres://artex:pw@postgres/artex", "OPENAI_API_KEY=sk-x",
		"MY_COMPANY_TOKEN=t0k3n", "LC_REVIEW_SECRET=leak", "ARTEX_NOISE_PROFILE=quiet", "MCP_TOKEN=abc",
		envExecKeep + "=MCP_TOKEN", "malformed", "=empty-name",
	}
	got := strings.Join(executorEnv(env, map[string]bool{"MCP_TOKEN": true}), "|")
	want := strings.Join([]string{
		"PATH=/usr/bin", "LANG=C.UTF-8", "LC_ALL=C", "LC_CTYPE=C.UTF-8", "HTTP_PROXY=http://127.0.0.1:8788",
		"SSL_CERT_FILE=/ca.pem", "PLAYWRIGHT_BROWSERS_PATH=/pw", envExecHome + "=/data/exec-home",
		"MCP_TOKEN=abc",
	}, "|")
	if got != want {
		t.Fatalf("executorEnv =\n%s\nwant\n%s", got, want)
	}
	for _, k := range secretEnv {
		if executorEnvAllowed(k) {
			t.Errorf("secret variable %s is on the allowlist", k)
		}
	}
}

// withExecKeep names the configured variables for the shim, only for an executor.
func TestWithExecKeep(t *testing.T) {
	env := map[string]string{"B_TOKEN": "2", "A_TOKEN": "1"}
	got := withExecKeep(ExecPrivilege{Enabled: true, UID: 10001, GID: 10001}, env)
	if got[envExecKeep] != "A_TOKEN,B_TOKEN" || got["A_TOKEN"] != "1" || got["B_TOKEN"] != "2" || len(got) != 3 {
		t.Fatalf("withExecKeep = %v", got)
	}
	if _, ok := env[envExecKeep]; ok {
		t.Fatal("withExecKeep changed its argument")
	}
	if got := withExecKeep(ExecPrivilege{}, env); len(got) != 2 {
		t.Fatalf("a disabled drop must leave the env as is: %v", got)
	}
	if got := withExecKeep(ExecPrivilege{Enabled: true}, nil); got != nil {
		t.Fatalf("no configured env: %v", got)
	}
}

// agentProcessEnv filters only for an executor.
func TestAgentProcessEnv(t *testing.T) {
	t.Setenv("ARTEX_ISOLATION_CANARY", "canary")
	has := func(env []string) bool {
		for _, kv := range env {
			if strings.HasPrefix(kv, "ARTEX_ISOLATION_CANARY=") {
				return true
			}
		}
		return false
	}
	if !has(agentProcessEnv(ExecPrivilege{})) {
		t.Fatal("with the drop disabled the server environment is passed as before")
	}
	if has(agentProcessEnv(ExecPrivilege{Enabled: true, UID: 10001, GID: 10001})) {
		t.Fatal("an executor process must not inherit a variable outside the allowlist")
	}
	if len(agentProcessEnv(ExecPrivilege{Enabled: true})) == 0 && os.Getenv("PATH") != "" {
		t.Fatal("PATH must cross")
	}
}
