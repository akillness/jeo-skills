package intercept

import (
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"strings"
	"unicode"

	"mvdan.cc/sh/v3/syntax"
)

// argvArity is the code-owned arity table (a port of cyberstrike's BashArity):
// how many leading tokens of a command form its human prefix, the program plus
// its subcommands. The longest entry that matches the start of the argv wins;
// a program that is not listed takes 1. It derives a prefix and nothing else:
// the security checks are in ParseSimpleCommand and ArgvPrefix.
var argvArity = map[string]int{
	"cat": 1, "cd": 1, "ls": 1, "rm": 1, "grep": 1, "head": 1, "tail": 1,
	"echo": 1, "pwd": 1, "find": 1, "curl": 1, "wget": 1, "nmap": 1,
	"git": 2, "npm": 2, "docker": 2, "kubectl": 2, "terraform": 2,
	"npm run": 3, "docker compose": 3, "kubectl rollout": 3, "git config": 3,
	"gcloud": 3, "gh": 3, "aws": 3,
}

// argvPrefixLen returns the number of leading tokens that form the prefix.
// The arity table is keyed by program name, so a path-qualified binary
// (/usr/bin/git) uses the same arity as the bare name.
func argvPrefixLen(tokens []string) int {
	if len(tokens) == 0 {
		return 0
	}
	key := make([]string, len(tokens))
	copy(key, tokens)
	key[0] = argvProgramName(tokens[0])
	for n := len(tokens); n > 0; n-- {
		if a, ok := argvArity[strings.Join(key[:n], " ")]; ok {
			return min(a, len(tokens))
		}
	}
	return min(1, len(tokens))
}

// ArgvPrefixOf returns the prefix of an argv: the program and its subcommands.
func ArgvPrefixOf(tokens []string) []string { return tokens[:argvPrefixLen(tokens)] }

// argvWord is one word of a parsed command. Literal reports that the word is
// fixed text: no expansion of any kind (no glob, tilde, brace, escape or
// parameter), so Value is exactly what the program receives.
type argvWord struct {
	Value   string
	Literal bool
}

var (
	errNotSimple  = errors.New("not a single simple command")
	errBackground = errors.New("the command runs in the background")
	errRedirect   = errors.New("the command has a redirection")
	errAssign     = errors.New("the command has a prefix assignment")
	errWrapper    = errors.New("the program is a wrapper that runs its arguments as a command")
)

// argvWrappers are programs that run their arguments as another command: the
// prefix of "command rm -rf /" would be ["command"], so no argv rule matches them.
var argvWrappers = map[string]bool{"command": true, "builtin": true, "env": true, "exec": true, "eval": true}

// ParseSimpleCommand parses a shell command line and accepts exactly one
// simple command: no assignment, redirection, pipeline, list (&&, ||, ;),
// subshell, background job or compound command, no wrapper program (command,
// builtin, env, exec, eval), and no command substitution, process
// substitution, parameter or arithmetic expansion or extended glob anywhere in
// the line. Arguments may hold plain globs and a tilde (they run nothing);
// such a word is returned with Literal false. The grammar is Bash, the shell
// the Bash tool runs the command with (norma tool/task.go shellCmd: bash -c).
func ParseSimpleCommand(command string) ([]argvWord, error) {
	f, err := syntax.NewParser(syntax.Variant(syntax.LangBash)).Parse(strings.NewReader(command), "")
	if err != nil {
		return nil, fmt.Errorf("the command does not parse: %w", err)
	}
	if len(f.Stmts) != 1 {
		return nil, errNotSimple
	}
	st := f.Stmts[0]
	switch {
	case st.Background || st.Coprocess || st.Disown:
		return nil, errBackground
	case len(st.Redirs) > 0:
		return nil, errRedirect
	}
	call, ok := st.Cmd.(*syntax.CallExpr)
	if !ok || st.Negated {
		return nil, errNotSimple
	}
	if len(call.Assigns) > 0 {
		return nil, errAssign
	}
	if len(call.Args) == 0 {
		return nil, errNotSimple
	}
	var bad error
	syntax.Walk(f, func(n syntax.Node) bool {
		switch n.(type) {
		case *syntax.CmdSubst, *syntax.ProcSubst, *syntax.ParamExp, *syntax.ArithmExp, *syntax.ExtGlob, *syntax.BraceExp:
			bad = errors.New("the command contains an expansion or a substitution")
		}
		return bad == nil
	})
	if bad != nil {
		return nil, bad
	}
	words := make([]argvWord, 0, len(call.Args))
	for _, w := range call.Args {
		word, ok := argvWordOf(w)
		if !ok {
			return nil, errors.New("the command contains an expansion or a substitution")
		}
		words = append(words, word)
	}
	if argvWrappers[path.Base(words[0].Value)] {
		return nil, errWrapper
	}
	return words, nil
}

// argvWordOf reads one word. ok is false for a part that is not text.
func argvWordOf(w *syntax.Word) (argvWord, bool) {
	var sb strings.Builder
	literal := true
	for _, part := range w.Parts {
		switch p := part.(type) {
		case *syntax.Lit:
			// Unquoted text: a glob, a tilde, a brace or an escape makes the word
			// differ from its text, so it is not literal.
			if strings.ContainsAny(p.Value, "*?[]{}~\\") {
				literal = false
			}
			sb.WriteString(p.Value)
		case *syntax.SglQuoted:
			if p.Dollar {
				literal = false
			}
			sb.WriteString(p.Value)
		case *syntax.DblQuoted:
			if p.Dollar {
				literal = false
			}
			for _, q := range p.Parts {
				lit, ok := q.(*syntax.Lit)
				if !ok {
					return argvWord{}, false
				}
				if strings.Contains(lit.Value, "\\") {
					literal = false
				}
				sb.WriteString(lit.Value)
			}
		default:
			return argvWord{}, false
		}
	}
	return argvWord{Value: sb.String(), Literal: literal}, true
}

// ArgvPrefix parses a command and derives its prefix with the arity table. It
// refuses (returns an error) when the command is not one simple command, when
// a prefix token is not literal, and when a prefix token is a flag: a flag
// before a subcommand ("git -C /repo push") yields no prefix at all, rather
// than an invented one.
func ArgvPrefix(command string) ([]string, error) {
	words, err := ParseSimpleCommand(command)
	if err != nil {
		return nil, err
	}
	tokens := make([]string, len(words))
	for i, w := range words {
		tokens[i] = w.Value
		if !w.Literal {
			tokens[i] = "\x00" // never a key of the arity table
		}
	}
	n := argvPrefixLen(tokens)
	for _, w := range words[:n] {
		if !w.Literal {
			return nil, errors.New("a token of the prefix is not literal text")
		}
		if err := checkArgvToken(w.Value); err != nil {
			return nil, err
		}
	}
	return tokens[:n], nil
}

// argvMaxTokens bounds the length of an argv pattern.
const argvMaxTokens = 8

// checkArgvToken applies the per-token pattern rules.
func checkArgvToken(tok string) error {
	if tok == "" {
		return errors.New("a token is empty")
	}
	if strings.HasPrefix(tok, "-") {
		return fmt.Errorf("token %q is a flag; a prefix holds the program and its subcommands only", tok)
	}
	if strings.ContainsAny(tok, ";&|><`$()") || strings.IndexFunc(tok, unicode.IsSpace) >= 0 {
		return fmt.Errorf("token %q contains a shell metacharacter or a space", tok)
	}
	return nil
}

// ParseArgvPattern validates the pattern of an argv rule: a JSON array of 1 to
// 8 tokens, none empty, none starting with '-', none holding a shell
// metacharacter (; & | > < ` $ ( )) or whitespace.
func ParseArgvPattern(pattern string) ([]string, error) {
	var tokens []string
	if err := json.Unmarshal([]byte(pattern), &tokens); err != nil {
		return nil, fmt.Errorf(`an argv pattern is a JSON array of strings, for example ["git","push"]: %w`, err)
	}
	if len(tokens) < 1 || len(tokens) > argvMaxTokens {
		return nil, fmt.Errorf("an argv pattern has 1 to %d tokens, got %d", argvMaxTokens, len(tokens))
	}
	for _, tok := range tokens {
		if err := checkArgvToken(tok); err != nil {
			return nil, err
		}
	}
	return tokens, nil
}

// argvRuleMatches reports whether a Bash call's command derives exactly the
// prefix tokens. Flags after the prefix are not constrained.
func argvRuleMatches(tokens []string, toolName string, input []byte) bool {
	if toolName != "Bash" || len(tokens) == 0 {
		return false
	}
	var in struct {
		Command string `json:"command"`
	}
	if json.Unmarshal(input, &in) != nil {
		return false
	}
	prefix, err := ArgvPrefix(in.Command)
	if err != nil || len(prefix) != len(tokens) {
		return false
	}
	for i := range prefix {
		if prefix[i] != tokens[i] {
			return false
		}
	}
	return true
}
