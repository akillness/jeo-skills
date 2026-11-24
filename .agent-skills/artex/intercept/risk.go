package intercept

import (
	"encoding/json"
	"regexp"
	"strings"
)

// RiskReport is a deterministic estimate of how dangerous a pending tool call
// is. No model is involved, and it is computed when a pending row is read,
// never stored: changing the rules below re-scores every open request.
type RiskReport struct {
	Score   int      `json:"score"`   // 0..100
	Level   string   `json:"level"`   // low (<30) | medium (30..69) | high (>=70)
	Reasons []string `json:"reasons"` // one per matched signal, in table order
}

const (
	riskMediumAt = 30
	riskHighAt   = 70
	riskMax      = 100
)

func riskLevel(score int) string {
	switch {
	case score >= riskHighAt:
		return "high"
	case score >= riskMediumAt:
		return "medium"
	}
	return "low"
}

type riskSignal struct {
	reason string
	points int
	match  func(string) bool
}

func reSignal(reason string, points int, pattern string) riskSignal {
	re := regexp.MustCompile(pattern)
	return riskSignal{reason, points, re.MatchString}
}

// shellBase is the score of a shell command that matches no signal.
const shellBase = 10

// shellSignals are additive; each counts once, and reasons follow this order.
var shellSignals = []riskSignal{
	// 60 so that a destructive command alone reaches high: 10 + 60 = 70.
	reSignal("destructive command (rm -r, dd, mkfs, shred, truncate, DROP TABLE, DELETE FROM, shutdown)", 60,
		`(?i)\brm\s+([^;&|]*\s)?(-[a-z]*r[a-z]*|--recursive)(\s|$)|\bdd\s+[^;&|]*\b(if|of)=|\bmkfs\b|\bshred\b|\btruncate\b|\bdrop\s+table\b|\bdelete\s+from\b|\bshutdown\b`),
	reSignal("privilege change (sudo, su, chmod 777, setcap)", 40,
		`(^|[\s;&|(])(sudo|su)(\s|$)|\bchmod\s+(-\w+\s+)*0?777\b|\bsetcap\b`),
	reSignal("reads secrets (/etc/shadow, .ssh, .aws/credentials, .git-credentials)", 40,
		`/etc/shadow|\.ssh/|\.aws/credentials|\.git-credentials`),
	reSignal("possible exfiltration (curl upload, scp, remote rsync, nc, socat)", 40,
		`\bcurl\b[^;&|]*\s(-d|--data[\w-]*|-F|--form|-T|--upload-file)(\s|=|$)|\bscp\b|\brsync\b[^;&|]*\s\S+:|\bnc\b|\bncat\b|\bsocat\b`),
	reSignal("reverse shell pattern (/dev/tcp, nc -e)", 60,
		`/dev/tcp/|\b(nc|ncat)\b[^;&|]*\s-e(\s|$)`),
	reSignal("network scanner (nmap, nuclei, sqlmap, ffuf, hydra, masscan, dalfox)", 30,
		`\b(nmap|nuclei|sqlmap|ffuf|hydra|masscan|dalfox)\b`),
	{"writes files (redirection or tee)", 15, writesFile},
}

var teeRE = regexp.MustCompile(`(^|[|;&]\s*)tee\b`)

// writesFile reports an output redirection to a file, or tee. "2>&1" and
// redirections to /dev/null are not writes.
func writesFile(cmd string) bool {
	if teeRE.MatchString(cmd) {
		return true
	}
	for i := 0; i < len(cmd); i++ {
		if cmd[i] != '>' {
			continue
		}
		rest := strings.TrimLeft(strings.TrimPrefix(cmd[i+1:], ">"), " \t")
		if strings.HasPrefix(rest, "&") || strings.HasPrefix(rest, "/dev/null") || rest == "" {
			continue
		}
		return true
	}
	return false
}

// fileBase is the score of a file write or edit; a sensitive path adds
// fileSensitive on top, which makes it high.
const (
	fileBase      = 30
	fileSensitive = 40
)

var sensitivePathRE = regexp.MustCompile(`(^|/)(\.ssh|\.aws|\.gnupg)/|^/etc/|^/root/|^/boot/|/\.git-credentials$|/\.(bashrc|bash_profile|profile|zshrc)$|/authorized_keys$|(^|/)\.env$`)

// webBase is the score of a web read; a mutating method adds webMutating.
const (
	webBase     = 10
	webMutating = 30
)

// unknownBase is the floor for MCP tools, unrecognized tools and unreadable
// input: medium, never low.
const unknownBase = 30

// ScoreRisk scores one tool call. It never panics on malformed input: input
// that is not a JSON object scores medium with a reason.
func ScoreRisk(tool string, input json.RawMessage) RiskReport {
	var fields map[string]any
	if err := json.Unmarshal(input, &fields); err != nil || fields == nil {
		return riskReport(unknownBase, []string{"tool input is not a valid JSON object"})
	}
	str := func(keys ...string) string {
		for _, k := range keys {
			if v, ok := fields[k].(string); ok && v != "" {
				return v
			}
		}
		return ""
	}
	switch tool {
	case "Bash", "shell_open", "Monitor", "shell_send":
		cmd := str("command", "text")
		score, reasons := shellBase, []string{}
		for _, s := range shellSignals {
			if s.match(cmd) {
				score += s.points
				reasons = append(reasons, s.reason)
			}
		}
		return riskReport(score, reasons)
	case "Write", "Edit", "MultiEdit", "NotebookEdit":
		reasons := []string{"writes or edits a file"}
		score := fileBase
		if sensitivePathRE.MatchString(str("file_path", "path", "notebook_path")) {
			score += fileSensitive
			reasons = append(reasons, "sensitive path (system, credential or shell startup file)")
		}
		return riskReport(score, reasons)
	case "WebFetch", "web_search":
		method := strings.ToUpper(str("method"))
		switch method {
		case "POST", "PUT", "PATCH", "DELETE":
			return riskReport(webBase+webMutating, []string{"mutating HTTP method " + method})
		}
		return riskReport(webBase, []string{})
	}
	if strings.HasPrefix(tool, "mcp__") {
		return riskReport(unknownBase, []string{"MCP tool: no specific rules"})
	}
	return riskReport(unknownBase, []string{"unrecognized tool: no specific rules"})
}

func riskReport(score int, reasons []string) RiskReport {
	score = min(score, riskMax)
	return RiskReport{Score: score, Level: riskLevel(score), Reasons: reasons}
}
