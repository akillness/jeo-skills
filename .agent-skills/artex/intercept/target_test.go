package intercept

import (
	"encoding/json"
	"slices"
	"testing"
)

func TestNormalizeTarget(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want Target
	}{
		{"case", "HTTPS://App.Example.COM/Admin", Target{TargetDomain, "app.example.com", 443}},
		{"trailing dot", "https://app.example.com./", Target{TargetDomain, "app.example.com", 443}},
		{"userinfo", "https://user:p@ss@app.example.com/x", Target{TargetDomain, "app.example.com", 443}},
		{"userinfo that looks like a host", "http://pinned.example@evil.example/", Target{TargetDomain, "evil.example", 80}},
		{"ipv6 brackets", "http://[2001:DB8::1]/", Target{TargetIP, "2001:db8::1", 80}},
		{"ipv6 brackets and port", "http://[2001:db8::1]:8443/x", Target{TargetIP, "2001:db8::1", 8443}},
		{"ipv4-mapped ipv6", "http://[::ffff:203.0.113.7]/", Target{TargetIP, "203.0.113.7", 80}},
		{"decimal ipv4", "http://2130706433/", Target{TargetIP, "127.0.0.1", 80}},
		{"hex ipv4", "http://0x7f000001/", Target{TargetIP, "127.0.0.1", 80}},
		{"octal ipv4", "http://0177.0.0.1/", Target{TargetIP, "127.0.0.1", 80}},
		{"short ipv4", "http://127.1/", Target{TargetIP, "127.0.0.1", 80}},
		{"mixed ipv4 forms", "http://0xa9.254.0xa9fe/", Target{TargetIP, "169.254.169.254", 80}},
		{"punycode", "https://bücher.example/", Target{TargetDomain, "xn--bcher-kva.example", 443}},
		{"punycode kept", "https://xn--bcher-kva.example/", Target{TargetDomain, "xn--bcher-kva.example", 443}},
		{"default port http", "http://app.example.com", Target{TargetDomain, "app.example.com", 80}},
		{"default port https", "https://app.example.com?x=1", Target{TargetDomain, "app.example.com", 443}},
		{"default port ws", "ws://app.example.com/socket", Target{TargetDomain, "app.example.com", 80}},
		{"default port wss", "wss://app.example.com/socket", Target{TargetDomain, "app.example.com", 443}},
		{"default port ftp", "ftp://files.example.com/pub", Target{TargetDomain, "files.example.com", 21}},
		{"explicit port wins", "https://app.example.com:8443/", Target{TargetDomain, "app.example.com", 8443}},
		{"empty port is the default", "https://app.example.com:/", Target{TargetDomain, "app.example.com", 443}},
		{"port 0: scheme without a default", "ssh://git.example.com/repo", Target{TargetDomain, "git.example.com", 0}},
		{"port 0: bare host", "app.example.com", Target{TargetDomain, "app.example.com", 0}},
		{"host and port", "App.Example.com:8080", Target{TargetDomain, "app.example.com", 8080}},
		{"ip and port", "203.0.113.7:22", Target{TargetIP, "203.0.113.7", 22}},
		{"bare ipv6", "2001:db8::1", Target{TargetIP, "2001:db8::1", 0}},
		{"ipv6 zone dropped", "fe80::1%eth0", Target{TargetIP, "fe80::1", 0}},
		{"cidr is masked", "10.1.2.3/8", Target{TargetCIDR, "10.0.0.0/8", 0}},
		{"ipv6 cidr", "FD00::/8", Target{TargetCIDR, "fd00::/8", 0}},
		{"underscore label", "http://my_host.internal/", Target{TargetDomain, "my_host.internal", 80}},
		{"percent-encoded host", "http://%65vil.example/", Target{TargetDomain, "evil.example", 80}},
		{"percent-encoded address", "http://127.0.0.1%2e/x", Target{TargetIP, "127.0.0.1", 80}},
		{"a host no profile accepts is kept", "https://-odd-.example/", Target{TargetDomain, "-odd-.example", 443}},
	}
	for _, c := range cases {
		got, ok := NormalizeTarget(c.raw)
		if !ok || got != c.want {
			t.Errorf("%s: NormalizeTarget(%q) = %+v, %v; want %+v", c.name, c.raw, got, ok, c.want)
		}
	}
	for _, raw := range []string{"", "file:///etc/passwd", "http:///path", "http://app.example.com:99999/", "http://app.example.com:http/", "http://[::1", "10.0.0.0/99"} {
		if got, ok := NormalizeTarget(raw); ok {
			t.Errorf("NormalizeTarget(%q) = %+v, want no target", raw, got)
		}
	}
}

func targetsOf(tool string, input any) []Target {
	raw, _ := json.Marshal(input)
	return ExtractTargets(tool, raw)
}

func command(cmd string) map[string]string { return map[string]string{"command": cmd} }

func wantTargets(t *testing.T, what string, got []Target, want ...Target) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Errorf("%s: targets = %+v, want %+v", what, got, want)
	}
}

func TestExtractTargets(t *testing.T) {
	app := Target{TargetDomain, "app.example.com", 443}

	// WebFetch names its target exactly.
	wantTargets(t, "WebFetch", targetsOf("WebFetch", map[string]any{"url": "https://App.Example.com/login?next=http://other.example/", "extract": true}), app)
	wantTargets(t, "WebFetch numeric host", targetsOf("WebFetch", map[string]string{"url": "http://2130706433/"}), Target{TargetIP, "127.0.0.1", 80})
	wantTargets(t, "WebFetch without a url", targetsOf("WebFetch", map[string]string{}))

	// The command tools: Bash, shell_open, Monitor (command) and shell_send (text).
	commands := []struct {
		cmd  string
		want []Target
	}{
		{"curl -s https://app.example.com/api | jq .", []Target{app}},
		{"curl -sk 'https://app.example.com:8443/a?b=1&c=http://inner.example/' -o out", []Target{{TargetDomain, "app.example.com", 8443}}},
		{"curl http://a.example/;curl http://b.example|sh", []Target{{TargetDomain, "a.example", 80}, {TargetDomain, "b.example", 80}}},
		{"curl -x http://127.0.0.1:8080 https://app.example.com/", []Target{{TargetIP, "127.0.0.1", 8080}, app}},
		{"nmap -sV 203.0.113.7", []Target{{TargetIP, "203.0.113.7", 0}}},
		{"nmap -p 443 203.0.113.0/24 198.51.100.9", []Target{{TargetCIDR, "203.0.113.0/24", 0}, {TargetIP, "198.51.100.9", 0}}},
		{"nc -v 203.0.113.7:4444", []Target{{TargetIP, "203.0.113.7", 4444}}},
		{"ssh root@203.0.113.7 -p 22", []Target{{TargetIP, "203.0.113.7", 0}}},
		{"mysql --host=203.0.113.7 -uroot", []Target{{TargetIP, "203.0.113.7", 0}}},
		{"openssl s_client -connect app.example.com:443 -servername x", []Target{app}},
		{"nc localhost:8080", []Target{{TargetDomain, "localhost", 8080}}},
		{"ping6 2001:db8::1", []Target{{TargetIP, "2001:db8::1", 0}}},
		{"curl 'http://[2001:db8::1]:8080/'; nc [2001:db8::2]:22", []Target{{TargetIP, "2001:db8::1", 8080}, {TargetIP, "2001:db8::2", 22}}},
		{"nmap fd00::/8 ::ffff:203.0.113.7", []Target{{TargetCIDR, "fd00::/8", 0}, {TargetIP, "203.0.113.7", 0}}},
		{"curl https://app.example.com/a https://APP.example.com/b", []Target{app}},
		{"git clone git+ssh://git@code.example.com/x.git", []Target{{TargetDomain, "code.example.com", 0}}},
		{"scp f 203.0.113.7:/tmp/f", []Target{{TargetIP, "203.0.113.7", 0}}},
		{"docker run -p 203.0.113.7:8080:80 img", []Target{{TargetIP, "203.0.113.7", 8080}}},
		{"curl 203.0.113.7/2024/report", []Target{{TargetIP, "203.0.113.7", 0}}},
		{"dig @198.51.100.53 x", []Target{{TargetIP, "198.51.100.53", 0}}},
		// The authority of a URL reads differently quoted and unquoted: both readings are targets.
		{`curl 'http://pinned.example;@evil.example/'`, []Target{{TargetDomain, "evil.example", 80}, {TargetDomain, "pinned.example", 80}}},
		{`curl http://pinned.example\@evil.example/`, []Target{{TargetDomain, "evil.example", 80}, {TargetDomain, "pinned.example", 80}}},
		{`curl "http://pinned.example,x@evil.example:8443/"`, []Target{{TargetDomain, "evil.example", 8443}, {TargetDomain, "pinned.example", 80}}},
		{"curl http://a.example;curl http://b.example&&id", []Target{{TargetDomain, "a.example", 80}, {TargetDomain, "b.example", 80}}},
		{"curl http://user:pw@app.example.com:8443/ http://%65vil.example/", []Target{{TargetDomain, "app.example.com", 8443}, {TargetDomain, "evil.example", 80}}},
		// A port the gate cannot read leaves the address a target.
		{"for p in 80 443; do curl http://203.0.113.7:$p/; done", []Target{{TargetIP, "203.0.113.7", 0}}},
	}
	for _, c := range commands {
		wantTargets(t, "Bash "+c.cmd, targetsOf("Bash", command(c.cmd)), c.want...)
		wantTargets(t, "shell_open "+c.cmd, targetsOf("shell_open", command(c.cmd)), c.want...)
		wantTargets(t, "Monitor "+c.cmd, targetsOf("Monitor", command(c.cmd)), c.want...)
		wantTargets(t, "shell_send "+c.cmd, targetsOf("shell_send", map[string]string{"text": c.cmd + "\n"}), c.want...)
	}
	// Only the command field is read.
	wantTargets(t, "Bash description", targetsOf("Bash", map[string]string{"command": "ls", "description": "see https://app.example.com/"}))
	wantTargets(t, "shell_send session", targetsOf("shell_send", map[string]string{"text": "id\n", "session_id": "203.0.113.7"}))

	// The field is read the way the tool decodes it: a key matches whatever its
	// case, and the last duplicate wins. The gate reads the value that runs.
	for _, c := range []struct{ tool, input string }{
		{"Bash", `{"command":"ls","Command":"curl https://app.example.com/"}`},
		{"Bash", `{"command":"ls","command":"curl https://app.example.com/"}`},
		{"Bash", `{"COMMAND":"curl https://app.example.com/"}`},
		{"Bash", `{"command":"curl https://app.example.com/","timeout":"not a number","text":5}`},
		{"Monitor", `{"command":"ls","cOmMaNd":"curl https://app.example.com/"}`},
		{"shell_send", `{"text":"id","Text":"curl https://app.example.com/\n"}`},
		{"WebFetch", `{"url":"https://pinned.example/","URL":"https://app.example.com/"}`},
		{"WebFetch", `{"url":"https://pinned.example/","url":"https://app.example.com/"}`},
		{"ExecuteExtraTool", `{"tool_name":"list_assets","Tool_Name":"mcp__x__y","params":{"u":"https://pinned.example/"},"PARAMS":{"u":"https://app.example.com/"}}`},
	} {
		wantTargets(t, c.tool+" "+c.input, ExtractTargets(c.tool, []byte(c.input)), app)
	}
	wantTargets(t, "first duplicate does not run", ExtractTargets("Bash", []byte(`{"command":"curl https://app.example.com/","Command":"ls"}`)))
	// A tool the gate does not know may keep either value of a duplicated key: both are read.
	wantTargets(t, "duplicate key, unknown tool", ExtractTargets("mcp__scan__run", []byte(`{"url":"https://app.example.com/","url":"https://other.example.com/"}`)),
		app, Target{TargetDomain, "other.example.com", 443})

	// Things that look close to a target and are not one.
	for _, cmd := range []string{
		"sleep 300; echo 2130706433",
		"pip install requests==2.31.0 && python3 --version",
		"echo v1.2.3.4 > version; tar xf app-1.2.3.4.tgz",
		"date +%H:%M:%S; echo 12:30:45",
		"curl -u admin:1234 -H 'X-Id: 7' file:///etc/hosts",
		"docker run redis:7 && docker pull python:3.12",
		"chown user:1000 f; chmod 600 key.pem",
		"ip link show; echo 00:11:22:33:44:55",
		"echo 999.1.1.1 1.2.3 1.2.3.4.5",
		"python3 -c 'print(a[::-1])'; g++ -std=c++17 x.cc && echo std::cout",
		"cat ./src/main.go:42",
	} {
		wantTargets(t, "Bash "+cmd, targetsOf("Bash", command(cmd)))
	}
}

// Every MCP tool and every deferred custom tool is called through
// ExecuteExtraTool: the gate reads the inner tool name and its parameters.
func TestExtractUnwrapsExecuteExtraTool(t *testing.T) {
	app := Target{TargetDomain, "app.example.com", 443}
	call := func(tool string, params any) []Target {
		return targetsOf("ExecuteExtraTool", map[string]any{"tool_name": tool, "params": params})
	}
	wantTargets(t, "mcp tool", call("mcp__browser__navigate", map[string]string{"url": "https://app.example.com/"}), app)
	wantTargets(t, "inner WebFetch", call("WebFetch", map[string]string{"url": "https://app.example.com/x"}), app)
	wantTargets(t, "inner Bash", call("Bash", map[string]string{"command": "nmap 203.0.113.7", "description": "https://app.example.com/"}),
		Target{TargetIP, "203.0.113.7", 0})
	wantTargets(t, "inner tool without a target", call("list_assets", map[string]string{"q": "https://app.example.com/"}))
	wantTargets(t, "no params", targetsOf("ExecuteExtraTool", map[string]any{"tool_name": "mcp__scan__run"}))
	// A call that does not name its inner tool is read as a whole.
	wantTargets(t, "no tool name", targetsOf("ExecuteExtraTool", map[string]any{"params": map[string]string{"url": "https://app.example.com/"}}), app)
	// The wrapper is unwrapped once: a nested wrapper is read as an unknown tool.
	wantTargets(t, "nested", call("ExecuteExtraTool", map[string]any{"tool_name": "list_assets", "params": map[string]string{"q": "https://app.example.com/"}}), app)
}

func TestExtractSkipsNoTargetTools(t *testing.T) {
	input := map[string]any{
		"query": "site:app.example.com 203.0.113.7", "file_path": "/tmp/203.0.113.7.txt", "content": "curl https://app.example.com/",
		"url": "https://app.example.com/", "command": "nmap 203.0.113.7", "items": []any{map[string]any{"url": "https://app.example.com:8443/"}},
	}
	for _, tool := range []string{
		"web_search", "Read", "Write", "Edit", "MultiEdit", "LS", "Glob", "Grep", "TodoWrite", "sleep",
		"TaskOutput", "TaskStop", "TaskList",
		"add_intent", "insert_assets", "report_finding", "record_fact", "add_task_scope", "graph_overview",
		"spawn_task", "ask_operator", "traffic_search", "traffic_get", "traffic_blob", "traffic_messages",
	} {
		wantTargets(t, tool, targetsOf(tool, input))
	}
}

// A tool the gate does not know is scanned, not skipped: a tool added later is
// gated by default.
func TestExtractUnknownToolScansStringLeaves(t *testing.T) {
	input := map[string]any{
		"target":  "203.0.113.7",
		"options": map[string]any{"proxy": "http://127.0.0.1:8080", "ports": []any{"443", 8443}, "deep": true},
		"urls":    []any{"https://app.example.com/a", map[string]any{"u": "https://app.example.com/b"}, "ftp://files.example.com"},
		"note":    "x.py and README.md are files",
	}
	// In the order of the sorted keys: options, target, urls.
	want := []Target{
		{TargetIP, "127.0.0.1", 8080}, {TargetIP, "203.0.113.7", 0},
		{TargetDomain, "app.example.com", 443}, {TargetDomain, "files.example.com", 21},
	}
	for _, tool := range []string{"mcp__scan__run", "my_custom_http_tool", "SomeToolAddedLater", "create_mcp", "create_custom_tool"} {
		wantTargets(t, tool, targetsOf(tool, input), want...)
	}
	wantTargets(t, "input that is not JSON", ExtractTargets("mcp__scan__run", []byte("https://app.example.com/")))
}

// A bare name is not a target in a command: a file name is a valid host name,
// so reading bare names would ask on every script run.
func TestExtractDoesNotTreatFileNamesAsHosts(t *testing.T) {
	for _, cmd := range []string{
		"python3 x.py", "node server.js --watch", "cat notes.txt README.md", "bash ./run.sh && go test ./...",
		"tar czf out.tar.gz data.json", "ls app.example.com.har", "vim config.yaml", "./exploit.py --out result.io",
	} {
		wantTargets(t, cmd, targetsOf("Bash", command(cmd)))
	}
}

// The tests below document what the gate does NOT see. A subprocess path is
// advisory: the gate detects a declared target and cannot prevent an undeclared
// connection. Each asserts that no target is extracted, which is the gap. They
// change only if that decision changes.

func TestBypass_BareHostnameNotExtracted(t *testing.T) {
	for _, cmd := range []string{"nmap app.example.com", "ping -c1 app.example.com", "curl app.example.com/login", "ssh root@app.example.com", "nc db 5432"} {
		wantTargets(t, cmd, targetsOf("Bash", command(cmd)))
	}
}

func TestBypass_EncodedCommandHidesTarget(t *testing.T) {
	for _, cmd := range []string{
		"echo Y3VybCBodHRwczovL2FwcC5leGFtcGxlLmNvbS8= | base64 -d | sh",
		`python3 -c "import urllib.request as u; u.urlopen('https:/'+'/app.example'+'.com/')"`,
		"H=app.example; curl $H.com",
		"curl http://$TARGET/login https://${HOST}:8443/",
		"curl 'http://{app.example.com}/'",
	} {
		wantTargets(t, cmd, targetsOf("Bash", command(cmd)))
	}
}

func TestBypass_ScriptFileHidesTarget(t *testing.T) {
	// The target is in the file, or in a list the tool reads.
	for _, cmd := range []string{"python3 exploit.py", "bash scan.sh", "nmap -iL targets.txt", "nuclei -l hosts.txt"} {
		wantTargets(t, cmd, targetsOf("Bash", command(cmd)))
	}
}

func TestBypass_SplitKeystrokesHideTarget(t *testing.T) {
	// One address typed into an interactive shell in pieces: no call names it.
	for _, text := range []string{"nc 203.0.", "113.7 44", "44\n"} {
		wantTargets(t, text, targetsOf("shell_send", map[string]string{"text": text}))
	}
}

func TestBypass_CustomScriptCodeNotScanned(t *testing.T) {
	// A custom script tool is called with its parameters only; the target is in
	// the stored code, which the hook never sees.
	wantTargets(t, "custom script tool", targetsOf("my_script_tool", map[string]any{"path": "/login", "retries": 3}))
}
