package intercept

import (
	"bytes"
	"encoding/json"
	"net/netip"
	"regexp"
	"strconv"
	"strings"
)

// executeExtraTool is the tool that runs a deferred tool (every MCP tool, and
// the custom tools flagged deferred). The hook sees it, never the inner name.
const executeExtraTool = "ExecuteExtraTool"

// noTargetTools are the tools whose input names no network target: the search
// tool (its input is a query), the file and session tools, and the platform's
// domain tools, which read and write the platform's own records. Every name
// that is not listed here is scanned, so a tool added later is gated by default.
var noTargetTools = toolSet(
	"web_search",
	"Read", "Write", "Edit", "MultiEdit", "LS", "Glob", "Grep",
	"TodoWrite", "sleep", "TaskOutput", "TaskStop", "TaskList",
	// exploration graph, assets, findings, goals (agent.ToolSet)
	"graph_overview", "list_findings", "list_facts", "node_detail", "expand_digest",
	"get_worker_output", "get_worker_trace", "search_all_worker_traces",
	"add_hint", "add_intent", "steer_work", "kill_work",
	"set_goals", "set_constraints", "list_goals", "prove_goal", "goal_met",
	"insert_assets", "add_company_scope", "add_task_scope", "list_assets",
	"list_untested_assets", "list_companies", "report_finding", "record_fact",
	"save_task_credential", "list_task_credentials", "ingest_bbot", "ingest_scan_output", "record_coverage",
	// cross-task orchestration, findings and retests (server)
	"list_tasks", "list_llm_profiles", "spawn_task", "pause_task", "get_task_graph",
	"list_task_findings", "add_task_hint", "get_task_worker_trace",
	"list_task_worker_traces", "search_task_worker_traces", "get_task_node_detail",
	"update_finding_report", "get_finding_traffic", "bind_finding_traffic",
	"get_finding_retest_context", "record_finding_retest_result",
	"delete_assets_by_host", "create_skill", "update_skill_file",
	// the operator runs the command, not the platform
	"ask_operator",
	// recorded traffic
	"traffic_search", "traffic_get", "traffic_blob", "traffic_messages",
)

func toolSet(names ...string) map[string]bool {
	m := make(map[string]bool, len(names))
	for _, n := range names {
		m[n] = true
	}
	return m
}

// ExtractTargets returns the network targets a tool call declares in its
// input, normalised and without duplicates, in order of appearance.
//
// WebFetch names its target exactly. The command tools are read with the
// command-string rules: URLs with a scheme, IP literals, IP:port, host:port and
// CIDR. A bare host name is not a target there, because a file name such as
// x.py is a valid host name. Every other tool that is not known to have no
// target has each string of its input read with the same rules. This is what
// the model declared: a command can hide its target, and the process resolves
// names on its own. The gate detects a declared target; it does not prevent an
// undeclared connection.
func ExtractTargets(toolName string, input []byte) []Target {
	return extractDeclared(toolName, input).targets
}

// extractDeclared reads what a tool call declares: its targets, as
// ExtractTargets returns them, and the URLs it writes, as written, for the URL
// block rules. A URL is kept only when it names a target.
func extractDeclared(toolName string, input []byte) targetList {
	if toolName == executeExtraTool {
		var in struct {
			ToolName string          `json:"tool_name"`
			Params   json.RawMessage `json:"params"`
		}
		if json.Unmarshal(input, &in) == nil && in.ToolName != "" && in.ToolName != executeExtraTool {
			toolName, input = in.ToolName, in.Params
		}
	}
	if noTargetTools[toolName] {
		return targetList{}
	}
	var out targetList
	switch toolName {
	case "WebFetch":
		u := declaredFields(input).URL
		if t, ok := NormalizeTarget(u); ok {
			out.add(t)
			out.urls = append(out.urls, strings.TrimSpace(u))
		}
	case "Bash", "shell_open", "Monitor":
		out.scan(declaredFields(input).Command)
	case "shell_send":
		out.scan(declaredFields(input).Text)
	default:
		out.scanStrings(input)
	}
	return out
}

// declaredInput holds the fields of the built-in tools that carry a target.
type declaredInput struct {
	URL     string `json:"url"`
	Command string `json:"command"`
	Text    string `json:"text"`
}

// declaredFields decodes the input into a struct, as the tools themselves do:
// a key matches whatever its case and the last duplicate wins. The gate
// therefore reads the value the tool will run, not another spelling of the key.
func declaredFields(input []byte) declaredInput {
	var in declaredInput
	_ = json.Unmarshal(input, &in) // a field of another type is skipped, the others are kept
	return in
}

type targetList struct {
	targets []Target
	seen    map[Target]bool
	urls    []string // the URLs that name a target, as written
}

func (l *targetList) add(t Target) {
	if l.seen[t] {
		return
	}
	if l.seen == nil {
		l.seen = map[Target]bool{}
	}
	l.seen[t] = true
	l.targets = append(l.targets, t)
}

// scanStrings reads every string of a JSON input, in document order. It walks
// the tokens instead of decoding into a map, so both values of a duplicated key
// are read: the gate cannot know which one the tool behind the call keeps.
func (l *targetList) scanStrings(input []byte) {
	dec := json.NewDecoder(bytes.NewReader(input))
	for {
		tok, err := dec.Token()
		if err != nil {
			return
		}
		if s, ok := tok.(string); ok {
			l.scan(s)
		}
	}
}

// shellMeta are the characters that end a word for an unquoted shell.
const shellMeta = `|;&(){},\`

// urlHosts returns the readings of the authority of a URL found in a command.
// Whether the URL is quoted decides how its authority is read when a shell
// character sits in it: 'http://a.example;@b.example/' names b.example to the
// client, and without the quotes the shell ends the URL at a.example. A
// backslash is dropped by the shell and kept inside quotes. The gate cannot
// tell which applies, so it returns every reading and each one is a target.
func urlHosts(authority string) []string {
	host := func(s string) string {
		s = s[strings.LastIndexByte(s, '@')+1:]
		if i := strings.IndexAny(s, shellMeta); i >= 0 {
			s = s[:i]
		}
		return s
	}
	out := []string{host(authority)}
	if i := strings.IndexAny(authority, shellMeta); i >= 0 {
		out = append(out, host(authority[:i]), host(strings.ReplaceAll(authority, `\`, "")))
	}
	return out
}

var (
	// A URL with a scheme: the scheme, the authority, then the rest of the token.
	// The rest is consumed so that what a path or a query contains is not read
	// as a target.
	reURL = regexp.MustCompile(`(?i)\b([a-z][a-z0-9+.\-]*://)([^\s/?#"'<>` + "`" + `]*)[^\s"'<>` + "`" + `]*`)
	// [IPv6] and [IPv6]:port.
	reBracketed = regexp.MustCompile(`\[([0-9A-Fa-f:.]+(?:%[\w.\-]+)?)\](?::(\d{1,5}))?`)
	// IPv4, IPv4:port and IPv4/len.
	reIPv4 = regexp.MustCompile(`\d{1,3}(?:\.\d{1,3}){3}(?:/\d{1,2}|:\d{1,5})?`)
	// IPv6 and IPv6/len: at least two colons, checked by the parser afterwards.
	reIPv6 = regexp.MustCompile(`[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*(?:%[\w.\-]+)?(?:/\d{1,3})?`)
	// name:port, for a name with a dot and an alphabetic last label, or localhost.
	// A single label is not read as a host: user:1234 and image:22 are not targets.
	reHostPort = regexp.MustCompile(`(?i)(?:localhost|[a-z0-9_](?:[a-z0-9_\-]*[a-z0-9_])?(?:\.[a-z0-9_](?:[a-z0-9_\-]*[a-z0-9_])?)*\.[a-z][a-z0-9\-]*[a-z0-9]):\d{1,5}`)
)

// scan reads the targets of one string with the command-string rules. Each
// form is blanked once it is read, so a later rule never reads part of it again.
func (l *targetList) scan(s string) {
	if s == "" {
		return
	}
	b := []byte(s)
	blank := func(from, to int) {
		for i := from; i < to; i++ {
			b[i] = ' '
		}
	}
	each := func(re *regexp.Regexp, read func(m []int) bool) {
		for _, m := range re.FindAllSubmatchIndex(b, -1) {
			if read(m) {
				blank(m[0], m[1])
			}
		}
	}
	each(reURL, func(m []int) bool {
		scheme, found := string(b[m[2]:m[3]]), false
		for _, host := range urlHosts(string(b[m[4]:m[5]])) {
			// A host that is not a name ($HOST, a glob) is what the shell or the
			// client will make of it, which the gate cannot read.
			if t, ok := NormalizeTarget(scheme + host); ok && (t.Kind != TargetDomain || validHostname(t.Host)) {
				l.add(t)
				found = true
			}
		}
		if found {
			// The whole token, path and query included, from the original string.
			l.urls = append(l.urls, s[m[0]:m[1]])
		}
		// The scheme and what follows the authority are never read again. An
		// authority that named no host is: an address written in it still counts.
		blank(m[0], m[4])
		blank(m[5], m[1])
		return found
	})
	each(reBracketed, func(m []int) bool {
		a, err := netip.ParseAddr(string(b[m[2]:m[3]]))
		if err != nil {
			return false
		}
		t := Target{Kind: TargetIP, Host: a.Unmap().WithZone("").String()}
		if m[4] >= 0 {
			t.Port = validPort(string(b[m[4]:m[5]]))
		}
		l.add(t)
		return true
	})
	each(reIPv6, func(m []int) bool {
		start, end := m[0], m[1]
		if start > 0 && isWord(b[start-1]) || end < len(b) && (isWord(b[end]) || b[end] == ':') {
			return false
		}
		kind, host, ok := normalizeHost(string(b[start:end]), false)
		// "::" alone is punctuation (a slice, a scope operator), not an address.
		if !ok || kind == TargetDomain || host == "::" {
			return false
		}
		l.add(Target{Kind: kind, Host: host})
		return true
	})
	each(reIPv4, func(m []int) bool {
		start, end := m[0], m[1]
		if start > 0 && (isWord(b[start-1]) || b[start-1] == '.') {
			return false
		}
		// The address alone, when what follows it is not a port or a prefix length.
		addrEnd := start + bytes.IndexAny(b[start:end], "/:")
		if addrEnd < start {
			addrEnd = end
		}
		if !endsToken(b, end) {
			end = addrEnd
			if !endsToken(b, end) {
				return false
			}
		}
		a, err := netip.ParseAddr(string(b[start:addrEnd]))
		if err != nil {
			return false
		}
		t := Target{Kind: TargetIP, Host: a.String()}
		if end > addrEnd {
			switch suffix := string(b[addrEnd+1 : end]); b[addrEnd] {
			case '/':
				if p, err := netip.ParsePrefix(string(b[start:end])); err == nil {
					t = Target{Kind: TargetCIDR, Host: p.Masked().String()}
				}
			case ':':
				t.Port = validPort(suffix)
			}
		}
		l.add(t)
		return true
	})
	each(reHostPort, func(m []int) bool {
		start, end := m[0], m[1]
		// Not the tail of a longer word, a path or an address, and not the head of
		// a version number (name:1.25).
		if start > 0 && (isWord(b[start-1]) || strings.IndexByte(`.-/\`, b[start-1]) >= 0) {
			return false
		}
		if !endsToken(b, end) {
			return false
		}
		host, port, _ := strings.Cut(string(b[start:end]), ":")
		n := validPort(port)
		_, host, ok := normalizeHost(host, false)
		if n == 0 || !ok {
			return false
		}
		l.add(Target{Kind: TargetDomain, Host: host, Port: n})
		return true
	})
}

// endsToken reports whether the token that ends before b[i] really ends there:
// what follows is not a word character and not a dot that continues a name or
// a number.
func endsToken(b []byte, i int) bool {
	if i >= len(b) {
		return true
	}
	if isWord(b[i]) {
		return false
	}
	return b[i] != '.' || i+1 >= len(b) || !isWord(b[i+1])
}

func isWord(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_'
}

// validPort returns the port s names, 0 when it is not one.
func validPort(s string) int {
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 || n > 65535 {
		return 0
	}
	return n
}
