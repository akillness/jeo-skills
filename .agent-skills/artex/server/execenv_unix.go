//go:build unix

package server

import (
	"os"
	"sort"
	"strings"
)

// Environment of the agent processes. When a process crosses from the server's
// identity to the executor's (the Bash shim, the MCP drop shim, a custom tool), its
// environment is rebuilt from the fixed allowlist below instead of being inherited
// from the server. ScrubSecretEnv and SealProcessEnv still remove the known secrets
// from the server's own environment; they are a deny list, and a credential under
// any other name (a variable an operator or an image adds) would reach the agent.
// The allowlist is the boundary: nothing outside it crosses, whatever its name.
//
// What an agent process sets for its own children afterwards (a nested bash, an
// exported variable) is its own business: the environment is rebuilt only when the
// identity changes.

// executorEnvNames are the server variables an agent process keeps: the search
// path and locale, the temp directory, the non-interactive defaults Norma sets, the
// proxy and CA trust variables the agents pass to their shells (agent.proxyEnv),
// the browser location of the image (Dockerfile), and the shim's own non-secret
// variables. HOME and XDG_CACHE_HOME are replaced by the executor's home.
var executorEnvNames = nameSet(
	"PATH", "HOME", "XDG_CACHE_HOME",
	"LANG", "LANGUAGE", "TERM", "TZ", "TMPDIR",
	"LC_ALL", "LC_CTYPE", "LC_NUMERIC", "LC_TIME", "LC_COLLATE", "LC_MONETARY",
	"LC_MESSAGES", "LC_PAPER", "LC_NAME", "LC_ADDRESS", "LC_TELEPHONE",
	"LC_MEASUREMENT", "LC_IDENTIFICATION",
	"PAGER", "GIT_PAGER", "SYSTEMD_PAGER", "DEBIAN_FRONTEND",
	"HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
	"ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy", "NODE_USE_ENV_PROXY",
	"SSL_CERT_FILE", "CURL_CA_BUNDLE", "REQUESTS_CA_BUNDLE", "GIT_SSL_CAINFO", "NODE_EXTRA_CA_CERTS",
	"PLAYWRIGHT_BROWSERS_PATH",
	envExecBash, envExecUID, envExecGID, envExecHome,
)

func nameSet(names ...string) map[string]bool {
	m := make(map[string]bool, len(names))
	for _, n := range names {
		m[n] = true
	}
	return m
}

// envExecKeep lists, comma-separated, names the drop shim keeps besides the
// allowlist: the variables an MCP stdio server is given in its configuration. It is
// not kept itself.
const envExecKeep = "ARTEX_EXEC_KEEP"

// executorEnvAllowed reports whether the variable name crosses to an agent process.
// The locale categories are the fixed POSIX set: a variable whose name starts with
// LC_ is not kept by prefix, so a secret cannot cross under an LC_ name.
func executorEnvAllowed(name string) bool {
	return executorEnvNames[name]
}

// executorEnv returns the entries of env an agent process keeps: the allowlisted
// names and the names in keep, in their order. Malformed entries are dropped.
func executorEnv(env []string, keep map[string]bool) []string {
	out := make([]string, 0, len(env))
	for _, kv := range env {
		name, _, ok := strings.Cut(kv, "=")
		if !ok || name == "" {
			continue
		}
		if executorEnvAllowed(name) || keep[name] {
			out = append(out, kv)
		}
	}
	return out
}

// sealExecutorEnv replaces the environment of the calling process, a shim about to
// become an agent process, with executorEnv of it and the names in envExecKeep.
func sealExecutorEnv() error {
	keep := map[string]bool{}
	for _, n := range strings.Split(os.Getenv(envExecKeep), ",") {
		if n = strings.TrimSpace(n); n != "" {
			keep[n] = true
		}
	}
	env := executorEnv(os.Environ(), keep)
	os.Clearenv()
	for _, kv := range env {
		k, v, _ := strings.Cut(kv, "=")
		if err := os.Setenv(k, v); err != nil {
			return err
		}
	}
	return nil
}

// agentProcessEnv is the base environment of a custom tool: the allowlist when it
// runs as the executor, the server's environment otherwise.
func agentProcessEnv(p ExecPrivilege) []string {
	if !p.Enabled {
		return os.Environ()
	}
	return executorEnv(os.Environ(), nil)
}

// withExecKeep adds envExecKeep to the configured environment of an MCP stdio
// server that runs as the executor, so the drop shim keeps those variables.
func withExecKeep(p ExecPrivilege, env map[string]string) map[string]string {
	if !p.Enabled || len(env) == 0 {
		return env
	}
	names := make([]string, 0, len(env))
	out := make(map[string]string, len(env)+1)
	for k, v := range env {
		names = append(names, k)
		out[k] = v
	}
	sort.Strings(names)
	out[envExecKeep] = strings.Join(names, ",")
	return out
}
