package intercept

import (
	"encoding/json"
	"errors"
	"slices"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestArgvArityTable(t *testing.T) {
	for _, c := range []struct {
		argv, want []string
	}{
		{[]string{"git", "push", "origin", "main"}, []string{"git", "push"}},
		{[]string{"git", "config", "user.name", "x"}, []string{"git", "config", "user.name"}},
		{[]string{"npm", "install", "left-pad"}, []string{"npm", "install"}},
		{[]string{"npm", "run", "build", "--watch"}, []string{"npm", "run", "build"}},
		{[]string{"docker", "compose", "up", "-d"}, []string{"docker", "compose", "up"}},
		{[]string{"docker", "ps"}, []string{"docker", "ps"}},
		{[]string{"kubectl", "rollout", "status", "x"}, []string{"kubectl", "rollout", "status"}},
		{[]string{"gh", "pr", "list", "--json"}, []string{"gh", "pr", "list"}},
		{[]string{"nmap", "-p", "80", "x"}, []string{"nmap"}},        // fallback to tokens[0]
		{[]string{"unknowntool", "a", "b"}, []string{"unknowntool"}}, // fallback to tokens[0]
		{[]string{"cat", "/etc/hosts"}, []string{"cat"}},
		{[]string{"git"}, []string{"git"}}, // arity longer than the argv
		{nil, []string{}},
	} {
		if got := ArgvPrefixOf(c.argv); !slices.Equal(got, c.want) {
			t.Errorf("prefix(%q) = %q, want %q", c.argv, got, c.want)
		}
	}
}

func TestArgvPrefixParsing(t *testing.T) {
	ok := []struct {
		cmd  string
		want []string
	}{
		{"nmap -p 80 10.0.0.1", []string{"nmap"}},
		{"git push --force origin main", []string{"git", "push"}},
		{"  git   push  ", []string{"git", "push"}},
		{`'git' "push" origin`, []string{"git", "push"}}, // quoting is removed
		{`git 'pu'"sh"`, []string{"git", "push"}},
		{`nmap "a b" 'c;d'`, []string{"nmap"}},          // metacharacters quoted in arguments
		{`nmap *.txt ~/scan`, []string{"nmap"}},         // glob and tilde after the prefix
		{`ls -la # $(id) in a comment`, []string{"ls"}}, // a comment runs nothing
		{"npm run build", []string{"npm", "run", "build"}},
	}
	for _, c := range ok {
		got, err := ArgvPrefix(c.cmd)
		if err != nil || !slices.Equal(got, c.want) {
			t.Errorf("ArgvPrefix(%q) = %q, %v; want %q", c.cmd, got, err, c.want)
		}
	}
	refused := []string{
		"",
		"nmap x; rm -rf /",          // list
		"nmap x && id",              // and
		"nmap x || id",              // or
		"nmap x | tee out",          // pipeline
		"(nmap x)",                  // subshell
		"{ nmap x; }",               // block
		"! nmap x",                  // negation
		"nmap $(id)",                // command substitution in an argument
		"nmap `id`",                 // backquote substitution
		`nmap "$(id)"`,              // substitution inside double quotes
		"nmap x$(id)y",              // substitution inside a word
		"nmap <(id)",                // process substitution
		"nmap $HOME",                // parameter expansion
		`nmap "${x}"`,               // parameter expansion in quotes
		"nmap $((1+2))",             // arithmetic expansion
		"nmap @(a|b)",               // extended glob
		"$X push",                   // expanded program
		"git $SUB",                  // expanded subcommand
		"git *",                     // glob in the prefix
		"git ~",                     // tilde in the prefix
		`g\it push`,                 // escape in the prefix
		"git -C /repo push",         // flag before the subcommand
		"git --no-pager log",        // flag before the subcommand
		"if true; then nmap x; fi",  // compound
		"for i in 1; do nmap; done", // loop
		"nmap x\nid",                // two statements
		"time nmap x",               // time clause
		"export X=1",                // declaration
		"'' push",                   // empty program
		"nmap 'unterminated",        // parse error
	}
	for _, cmd := range refused {
		if got, err := ArgvPrefix(cmd); err == nil {
			t.Errorf("ArgvPrefix(%q) = %q, want a refusal", cmd, got)
		}
	}
}

// refusedWith checks that each command is refused by the parser with want, and
// that an argv rule for its program matches nothing.
func refusedWith(t *testing.T, want error, cmds ...string) {
	t.Helper()
	for _, cmd := range cmds {
		if _, err := ParseSimpleCommand(cmd); !errors.Is(err, want) {
			t.Errorf("ParseSimpleCommand(%q) error = %v, want %v", cmd, err, want)
		}
		input, _ := json.Marshal(map[string]string{"command": cmd})
		for _, p := range [][]string{{"nmap"}, {"command"}, {"builtin"}, {"env"}} {
			if argvRuleMatches(p, "Bash", input) {
				t.Errorf("%q matched the argv rule %q", cmd, p)
			}
		}
	}
}

func TestArgvRejectsBackground(t *testing.T) {
	refusedWith(t, errBackground, "nmap x &", "nmap -p 80 x&")
}

func TestArgvRejectsRedirections(t *testing.T) {
	refusedWith(t, errRedirect, "nmap x > out", "nmap x >> out", "nmap x 2>&1", "nmap x < in",
		"nmap x <<EOF\nhi\nEOF", "nmap x <<< hi", "nmap x &> out", "> out nmap x")
}

func TestArgvRejectsPrefixAssignments(t *testing.T) {
	refusedWith(t, errAssign, "FOO=bar nmap x", "LD_PRELOAD=/tmp/x.so nmap", "A=1 B=2 nmap x", "PATH=. nmap")
}

func TestArgvRejectsWrappers(t *testing.T) {
	refusedWith(t, errWrapper, "command nmap x", "command -p rm -rf /", "builtin echo x", "env nmap x",
		"env FOO=1 nmap", "/usr/bin/env nmap", "exec nmap x", "eval nmap x", `"command" rm x`)
}

// A command that does not parse is no match, never an error: Match reports
// no rule and the normal flow (judge, approval) continues.
func TestArgvParseFailureIsNoMatch(t *testing.T) {
	ic := New(nil)
	ic.SetRulesForTest([]db.InterceptRule{{ID: 1, Name: "argv allow nmap", Enabled: true, MatchTarget: "tool_input",
		MatchType: "argv", Pattern: `["nmap"]`, Action: "allow"}})
	for _, input := range []string{`{"command":"nmap 'unterminated"}`, `{"command":"nmap $("}`, `{"command":""}`, `{}`, `not json`} {
		if dec, ok := ic.Match("Bash", []byte(input)); ok {
			t.Errorf("%s matched: %+v", input, dec)
		}
	}
}

func TestArgvRuleMatching(t *testing.T) {
	bash := func(cmd string) []byte {
		b, _ := json.Marshal(map[string]string{"command": cmd})
		return b
	}
	for _, c := range []struct {
		pattern []string
		tool    string
		cmd     string
		want    bool
	}{
		{[]string{"nmap"}, "Bash", "nmap -p 80 x", true},
		{[]string{"nmap"}, "Bash", "nmapx -p 80 x", false},
		{[]string{"nmap"}, "Bash", "nmap x; rm -rf /", false},
		{[]string{"nmap"}, "Bash", "nmap $(rm -rf /)", false},
		{[]string{"nmap"}, "Bash", "nmap x`id`", false},
		{[]string{"nmap"}, "Bash", "/usr/bin/nmap x", false},
		{[]string{"nmap"}, "shell_open", "nmap x", false}, // Bash only
		{[]string{"git", "push"}, "Bash", "git push --force", true},
		{[]string{"git", "push"}, "Bash", "git -C /repo push", false},
		{[]string{"git", "push"}, "Bash", "git pushx", false},
		{[]string{"git"}, "Bash", "git push", false}, // strict equality with the derived prefix
		{[]string{"git", "push", "origin"}, "Bash", "git push origin", false},
	} {
		if got := argvRuleMatches(c.pattern, c.tool, bash(c.cmd)); got != c.want {
			t.Errorf("%q on %s %q = %v, want %v", c.pattern, c.tool, c.cmd, got, c.want)
		}
	}
	if argvRuleMatches([]string{"nmap"}, "Bash", []byte(`not json`)) {
		t.Error("unreadable input matched")
	}
}

func TestParseArgvPattern(t *testing.T) {
	if got, err := ParseArgvPattern(`["git","push"]`); err != nil || !slices.Equal(got, []string{"git", "push"}) {
		t.Fatalf("valid pattern: %q %v", got, err)
	}
	for name, p := range map[string]string{
		"not json":     "git push",
		"not strings":  `[1,2]`,
		"empty array":  `[]`,
		"empty token":  `["git",""]`,
		"flag token":   `["git","--force"]`,
		"dash token":   `["-rf"]`,
		"semicolon":    `["nmap;id"]`,
		"ampersand":    `["a&b"]`,
		"pipe":         `["a|b"]`,
		"redirect":     `["a>b"]`,
		"input":        `["a<b"]`,
		"backquote":    "[\"a`b\"]",
		"dollar":       `["$HOME"]`,
		"parenthesis":  `["a(b)"]`,
		"space":        `["git push"]`,
		"newline":      `["a\nb"]`,
		"tab":          `["a\tb"]`,
		"nine tokens":  `["a","b","c","d","e","f","g","h","i"]`,
		"empty string": ``,
	} {
		if _, err := ParseArgvPattern(p); err == nil {
			t.Errorf("%s: %q accepted", name, p)
		}
	}
	if _, err := ParseArgvPattern(`["a","b","c","d","e","f","g","h"]`); err != nil {
		t.Errorf("eight tokens refused: %v", err)
	}
}

// An argv allow rule takes its place in the priority order: a deny rule with a
// higher priority still wins, and an argv rule with a bad pattern is not loaded.
func TestArgvAllowBelowDeny(t *testing.T) {
	ic := New(nil)
	ic.SetRulesForTest([]db.InterceptRule{
		{ID: 1, Name: "no force flag", Enabled: true, Priority: 50, MatchTarget: "tool_input", MatchType: "regex",
			Pattern: `--force`, Action: "deny"},
		{ID: 2, Name: "argv allow nmap", Enabled: true, Priority: -1000, MatchTarget: "tool_input", MatchType: "argv",
			Pattern: `["nmap"]`, Action: "allow"},
	})
	dec, ok := ic.Match("Bash", []byte(`{"command":"nmap --force 10.0.0.1"}`))
	if !ok || dec.Action != "deny" || dec.RuleID != 1 {
		t.Fatalf("force flag: %+v %v, want the deny rule", dec, ok)
	}
	dec, ok = ic.Match("Bash", []byte(`{"command":"nmap 10.0.0.1"}`))
	if !ok || dec.Action != "allow" || dec.RuleID != 2 {
		t.Fatalf("nmap: %+v %v, want the argv allow", dec, ok)
	}
	if _, ok := ic.Match("Bash", []byte(`{"command":"nmap 10.0.0.1; id"}`)); ok {
		t.Fatal("a compound command matched the argv rule")
	}
	if _, ok := compileRule(db.InterceptRule{MatchType: "argv", Pattern: `["-x"]`}); ok {
		t.Fatal("an argv rule with a flag token compiled")
	}
}
