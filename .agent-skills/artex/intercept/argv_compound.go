package intercept

import (
	"encoding/json"
	"path"
	"strings"

	"mvdan.cc/sh/v3/syntax"
)

// argvMaxNestedPayloads bounds how deeply nested shell/eval/env -S payloads
// (for example, bash -c "bash -c ...") are re-parsed and walked.
const argvMaxNestedPayloads = 3

// argvMaxWrapperCandidates bounds option-disambiguation branching (for example
// repeated ambiguous optional-value flags like xargs -l) so pathological input
// cannot cause exponential work.
const argvMaxWrapperCandidates = 8

// callWord is one argument word of a *syntax.CallExpr for deny/ask matching.
// Literal is true when the word contains no runtime expansion; Value holds the
// unquoted text. AssignLike is true when the word begins with a literal
// NAME= prefix (for example FOO=1 or FOO=$(id)), so wrappers like env and sudo
// can skip environment assignments without skipping arbitrary opaque tokens.
type callWord struct {
	Value      string
	Literal    bool
	AssignLike bool
}

// argvCompoundMatches reports whether any command executed within a Bash tool
// call matches the deny/ask prefix rule tokens. It parses the entire Bash line,
// walks every *syntax.CallExpr in the AST, strips known wrapper programs, and
// recurses into eval, shell -c, env -S, flock -c, and parallel command-string
// payloads up to argvMaxNestedPayloads deep.
//
// Parse errors never panic and always return false (no match).
func argvCompoundMatches(tokens []string, toolName string, input []byte) bool {
	if toolName != "Bash" || len(tokens) == 0 {
		return false
	}
	var in struct {
		Command string `json:"command"`
	}
	if json.Unmarshal(input, &in) != nil {
		return false
	}
	if strings.TrimSpace(in.Command) == "" {
		return false
	}
	return bashCommandMatchesArgv(tokens, in.Command, 0)
}

func bashCommandMatchesArgv(rule []string, command string, depth int) bool {
	f, err := syntax.NewParser(syntax.Variant(syntax.LangBash)).Parse(strings.NewReader(command), "")
	if err != nil {
		return false
	}
	matched := false
	syntax.Walk(f, func(n syntax.Node) bool {
		if matched {
			return false
		}
		call, ok := n.(*syntax.CallExpr)
		if !ok || len(call.Args) == 0 {
			return true
		}
		words := make([]callWord, len(call.Args))
		for i, w := range call.Args {
			words[i] = callWordOf(w)
		}
		if callMatchesArgv(rule, words, depth) {
			matched = true
			return false
		}
		return true
	})
	return matched
}

// callMatchesArgv checks a single call's argv against rule, stripping known
// wrappers repeatedly and recursing into nested Bash payloads up to
// argvMaxNestedPayloads deep.
func callMatchesArgv(rule []string, argv []callWord, depth int) bool {
	if len(argv) == 0 {
		return false
	}
	if argvMatchesRulePrefix(rule, argv) {
		return true
	}
	if !argv[0].Literal || argv[0].Value == "" {
		return false
	}
	prog := path.Base(argv[0].Value)
	rest := argv[1:]

	switch {
	case prog == "eval":
		if depth >= argvMaxNestedPayloads {
			return false
		}
		payload, ok := evalPayload(rest)
		if !ok {
			return false
		}
		return bashCommandMatchesArgv(rule, payload, depth+1)

	case isShellWrapper(prog):
		if depth >= argvMaxNestedPayloads {
			return false
		}
		payload, ok := shellDashCPayload(rest)
		if !ok {
			return false
		}
		return bashCommandMatchesArgv(rule, payload, depth+1)

	case prog == "env":
		return envMatchesArgv(rule, rest, depth)

	case prog == "find":
		return findExecMatches(rule, rest, depth)

	case prog == "flock":
		return flockMatchesArgv(rule, rest, depth)

	case prog == "parallel":
		return parallelMatchesArgv(rule, rest, depth)
	}

	for _, next := range stripOneWrapperCandidates(prog, rest) {
		if len(next) > 0 && len(next) < len(argv) {
			if callMatchesArgv(rule, next, depth) {
				return true
			}
		}
	}
	return false
}

// argvMatchesRulePrefix compares rule against the first len(rule) tokens of
// argv. For token 0, a rule token without a path separator matches the basename
// of the actual program; a rule token with a separator must match verbatim.
func argvMatchesRulePrefix(rule []string, argv []callWord) bool {
	if len(rule) == 0 || len(argv) < len(rule) {
		return false
	}
	for i, want := range rule {
		if !argv[i].Literal {
			return false
		}
		got := argv[i].Value
		if i == 0 {
			if got == "" {
				return false
			}
			if !strings.ContainsAny(want, "/\\") {
				got = path.Base(got)
			}
		}
		if got != want {
			return false
		}
	}
	return true
}

// callWordOf converts a Bash AST word into a callWord. Words containing any
// expansion (parameter, command/process substitution, arithmetic, glob, brace
// expansion, tilde, ANSI-C/locale quoting) become opaque (Literal: false)
// rather than failing the whole call.
func callWordOf(w *syntax.Word) callWord {
	if w == nil || len(w.Parts) == 0 {
		return callWord{}
	}
	assignLike := false
	if firstLit, ok := w.Parts[0].(*syntax.Lit); ok && hasAssignPrefix(firstLit.Value) {
		assignLike = true
	}

	var sb strings.Builder
	literal := true
	for _, part := range w.Parts {
		switch p := part.(type) {
		case *syntax.Lit:
			s, ok := unescapeBareLit(p.Value)
			if !ok {
				literal = false
				continue
			}
			sb.WriteString(s)
		case *syntax.SglQuoted:
			if p.Dollar {
				literal = false
				continue
			}
			sb.WriteString(p.Value)
		case *syntax.DblQuoted:
			if p.Dollar {
				literal = false
				continue
			}
			for _, q := range p.Parts {
				lit, ok := q.(*syntax.Lit)
				if !ok {
					literal = false
					break
				}
				sb.WriteString(unescapeDblQuotedLit(lit.Value))
			}
		default:
			literal = false
		}
	}
	if !literal {
		return callWord{Literal: false, AssignLike: assignLike}
	}
	val := sb.String()
	if !assignLike && hasAssignPrefix(val) {
		assignLike = true
	}
	return callWord{Value: val, Literal: true, AssignLike: assignLike}
}

func unescapeBareLit(s string) (string, bool) {
	var sb strings.Builder
	sb.Grow(len(s))
	hasOpenBrace := false
	hasCloseBrace := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '\\' {
			if i+1 >= len(s) {
				return "", false
			}
			i++
			if s[i] == '\n' {
				continue
			}
			sb.WriteByte(s[i])
			continue
		}
		switch c {
		case '*', '?', '[', ']', '~':
			return "", false
		case '{':
			hasOpenBrace = true
		case '}':
			hasCloseBrace = true
		}
		sb.WriteByte(c)
	}
	if hasOpenBrace && hasCloseBrace && (strings.Contains(s, ",") || strings.Contains(s, "..")) {
		return "", false
	}
	return sb.String(), true
}

func unescapeDblQuotedLit(s string) string {
	var sb strings.Builder
	sb.Grow(len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+1 < len(s) {
			switch s[i+1] {
			case '\n':
				i++
				continue
			case '"', '$', '`', '\\':
				i++
				sb.WriteByte(s[i])
				continue
			}
		}
		sb.WriteByte(s[i])
	}
	return sb.String()
}

func hasAssignPrefix(s string) bool {
	eq := strings.IndexByte(s, '=')
	if eq <= 0 {
		return false
	}
	for i := 0; i < eq; i++ {
		c := s[i]
		isLetter := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'
		isDigit := c >= '0' && c <= '9'
		if i == 0 && !isLetter {
			return false
		}
		if !isLetter && !isDigit {
			return false
		}
	}
	return true
}

func isShellWrapper(prog string) bool {
	switch prog {
	case "sh", "bash", "zsh", "dash", "ksh", "fish":
		return true
	}
	return false
}

// Known leading options of POSIX/Bash/Zsh/Dash/Ksh/Fish shells.
// Short flags may appear with '-' or '+' (only '-c' enables command mode);
// -o/+o and -O/+O take a single option-name value.
const shellShortNoArg = "abBCdefhHiklmnpPrstuvxETLN"

var (
	shellLongNoArg = strSet(
		"debugger", "dump-po-strings", "dump-strings", "interactive", "login",
		"no-config", "noediting", "noprofile", "norc", "posix", "pretty-print",
		"private", "restricted", "verbose",
	)
	shellLongArg = strSet("init-file", "rcfile")
)

// shellDashCPayload parses a shell's leading options (combined short clusters
// containing c, -o/+o and -O/+O with a value, known long options, and --) and
// returns the literal command string if -c (or --command) was given.
// No -c (script/stdin mode), unknown options, or opaque options before -c
// return ("", false).
func shellDashCPayload(args []callWord) (string, bool) {
	hasC := false
	i := 0
	for i < len(args) {
		if !args[i].Literal {
			return "", false
		}
		tok := args[i].Value
		if tok == "--" || tok == "-" {
			i++
			break
		}
		if !strings.HasPrefix(tok, "-") && !strings.HasPrefix(tok, "+") {
			break
		}
		if strings.HasPrefix(tok, "--") {
			name := tok[2:]
			if eq := strings.IndexByte(name, '='); eq >= 0 {
				flagName, val := name[:eq], name[eq+1:]
				if flagName == "command" {
					return val, true
				}
				if shellLongArg[flagName] {
					i++
					continue
				}
				return "", false
			}
			if name == "command" {
				if i+1 >= len(args) || !args[i+1].Literal {
					return "", false
				}
				return args[i+1].Value, true
			}
			if shellLongNoArg[name] {
				i++
				continue
			}
			if shellLongArg[name] {
				if i+1 >= len(args) {
					return "", false
				}
				i += 2
				continue
			}
			return "", false
		}

		// Short option or combined short-option cluster starting with '-' or '+'.
		sign := tok[0]
		flags := tok[1:]
		if flags == "" {
			break
		}
		consumedNext := false
		for j := 0; j < len(flags); j++ {
			ch := flags[j]
			switch {
			case ch == 'c' && sign == '-':
				hasC = true
			case ch == 'o' || ch == 'O':
				if j+1 < len(flags) {
					j = len(flags)
				} else {
					if i+1 >= len(args) {
						return "", false
					}
					consumedNext = true
				}
			case strings.IndexByte(shellShortNoArg, ch) >= 0:
				continue
			default:
				return "", false
			}
		}
		if consumedNext {
			i += 2
		} else {
			i++
		}
	}
	if !hasC || i >= len(args) || !args[i].Literal {
		return "", false
	}
	return args[i].Value, true
}

// evalPayload joins eval's arguments with spaces for re-parsing as Bash.
// A leading "--" is stripped. Opaque arguments are substituted with an
// unexpanded placeholder ($__opaque) so they never shift a later literal word
// into command position, while trailing opaque args still let a leading literal
// command match.
func evalPayload(args []callWord) (string, bool) {
	if len(args) > 0 && args[0].Literal && args[0].Value == "--" {
		args = args[1:]
	}
	if len(args) == 0 {
		return "", false
	}
	parts := make([]string, 0, len(args))
	hasLiteral := false
	for _, a := range args {
		if a.Literal {
			parts = append(parts, a.Value)
			hasLiteral = true
		} else {
			parts = append(parts, "$__opaque")
		}
	}
	if !hasLiteral {
		return "", false
	}
	return strings.Join(parts, " "), true
}

// envMatchesArgv handles env's options (including -S/--split-string, whose
// value is re-parsed as a Bash line at depth+1), NAME=VALUE assignments, and
// any trailing wrapped command. Unknown options are over-approximated (tried
// as 0-arg and, when applicable, 1-arg) up to argvMaxWrapperCandidates.
func envMatchesArgv(rule []string, args []callWord, depth int) bool {
	spec := wrapperSpecs["env"]
	checkSplitString := func(val string) bool {
		if depth >= argvMaxNestedPayloads || strings.TrimSpace(val) == "" {
			return false
		}
		if bashCommandMatchesArgv(rule, val, depth+1) {
			return true
		}
		// If the split-string payload starts with env options (e.g. -i or -u),
		// also evaluate it as an env invocation.
		if strings.HasPrefix(strings.TrimSpace(val), "-") {
			return bashCommandMatchesArgv(rule, "env "+val, depth+1)
		}
		return false
	}

	candidates := 0
	seenIdx := map[int]bool{}
	var walk func(i int) bool
	walk = func(i int) bool {
		if candidates >= argvMaxWrapperCandidates {
			return false
		}
		for i < len(args) {
			if !args[i].Literal {
				if args[i].AssignLike {
					break
				}
				return false
			}
			tok := args[i].Value
			if tok == "--" {
				i++
				break
			}
			if tok == "-" {
				i++
				continue
			}
			if !strings.HasPrefix(tok, "-") {
				break
			}
			if strings.HasPrefix(tok, "--") {
				name := tok[2:]
				if eq := strings.IndexByte(name, '='); eq >= 0 {
					flagName, val := name[:eq], name[eq+1:]
					if flagName == "split-string" && checkSplitString(val) {
						return true
					}
					// Known or unknown --flag=val skips one token.
					i++
					continue
				}
				if name == "help" || name == "version" {
					return false
				}
				if name == "split-string" {
					if i+1 >= len(args) {
						return false
					}
					if args[i+1].Literal && checkSplitString(args[i+1].Value) {
						return true
					}
					i += 2
					continue
				}
				if spec.longNoArg[name] || spec.longOptVal[name] {
					i++
					continue
				}
				if spec.longArg[name] {
					if i+1 >= len(args) {
						return false
					}
					i += 2
					continue
				}
				// Unknown long option without "=": try 0-arg and 1-arg.
				if walk(i + 1) {
					return true
				}
				if i+1 < len(args) && walk(i+2) {
					return true
				}
				return false
			}

			flags := tok[1:]
			consumedNext := false
			unknownOpt := false
			for j := 0; j < len(flags); j++ {
				ch := flags[j]
				switch {
				case ch == 'S':
					if j+1 < len(flags) {
						if checkSplitString(flags[j+1:]) {
							return true
						}
						j = len(flags)
					} else {
						if i+1 >= len(args) {
							return false
						}
						if args[i+1].Literal && checkSplitString(args[i+1].Value) {
							return true
						}
						consumedNext = true
					}
				case strings.IndexByte(spec.shortNoArg, ch) >= 0:
					continue
				case strings.IndexByte(spec.shortArg, ch) >= 0:
					if j+1 < len(flags) {
						j = len(flags)
					} else {
						if i+1 >= len(args) {
							return false
						}
						consumedNext = true
					}
				default:
					unknownOpt = true
					j = len(flags)
				}
			}
			if unknownOpt {
				if walk(i + 1) {
					return true
				}
				if i+1 < len(args) && walk(i+2) {
					return true
				}
				return false
			}
			if consumedNext {
				i += 2
			} else {
				i++
			}
		}

		for i < len(args) && args[i].AssignLike {
			i++
		}
		if i >= len(args) || seenIdx[i] {
			return false
		}
		seenIdx[i] = true
		candidates++
		return callMatchesArgv(rule, args[i:], depth)
	}
	return walk(0)
}

// findExecMatches walks every -exec, -execdir, -ok, and -okdir clause inside a
// find invocation (terminated by literal ";" or "+") and runs callMatchesArgv
// on each wrapped command.
func findExecMatches(rule []string, args []callWord, depth int) bool {
	for i := 0; i < len(args); i++ {
		if !args[i].Literal {
			continue
		}
		switch args[i].Value {
		case "-exec", "-execdir", "-ok", "-okdir":
			start := i + 1
			end := start
			terminated := false
			for end < len(args) {
				if args[end].Literal && (args[end].Value == ";" || args[end].Value == "+") {
					terminated = true
					break
				}
				end++
			}
			if terminated && end > start {
				if callMatchesArgv(rule, args[start:end], depth) {
					return true
				}
				i = end
			}
		}
	}
	return false
}

// flockMatchesArgv handles both "flock [opts] <file> <cmd...>" and
// "flock [opts] <file> -c <cmd-string>" / "flock [opts] -c <cmd-string> <file>".
func flockMatchesArgv(rule []string, args []callWord, depth int) bool {
	spec := wrapperSpecs["flock"]
	i := 0
	for i < len(args) {
		if !args[i].Literal {
			return false
		}
		tok := args[i].Value
		if tok == "--" {
			i++
			break
		}
		if !strings.HasPrefix(tok, "-") || tok == "-" {
			break
		}
		if strings.HasPrefix(tok, "--") {
			name := tok[2:]
			if eq := strings.IndexByte(name, '='); eq >= 0 {
				flagName, val := name[:eq], name[eq+1:]
				if flagName == "command" {
					if depth < argvMaxNestedPayloads && bashCommandMatchesArgv(rule, val, depth+1) {
						return true
					}
					i++
					continue
				}
				if spec.longArg[flagName] {
					i++
					continue
				}
				return false
			}
			if name == "command" {
				if i+1 >= len(args) {
					return false
				}
				if depth < argvMaxNestedPayloads && args[i+1].Literal && bashCommandMatchesArgv(rule, args[i+1].Value, depth+1) {
					return true
				}
				i += 2
				continue
			}
			if spec.longNoArg[name] {
				i++
				continue
			}
			if spec.longArg[name] {
				if i+1 >= len(args) {
					return false
				}
				i += 2
				continue
			}
			return false
		}

		flags := tok[1:]
		consumedNext := false
		for j := 0; j < len(flags); j++ {
			ch := flags[j]
			switch {
			case ch == 'c':
				if j+1 < len(flags) {
					if depth < argvMaxNestedPayloads && bashCommandMatchesArgv(rule, flags[j+1:], depth+1) {
						return true
					}
					j = len(flags)
				} else {
					if i+1 >= len(args) {
						return false
					}
					if depth < argvMaxNestedPayloads && args[i+1].Literal && bashCommandMatchesArgv(rule, args[i+1].Value, depth+1) {
						return true
					}
					consumedNext = true
				}
			case strings.IndexByte(spec.shortNoArg, ch) >= 0:
				continue
			case strings.IndexByte(spec.shortArg, ch) >= 0:
				if j+1 < len(flags) {
					j = len(flags)
				} else {
					if i+1 >= len(args) {
						return false
					}
					consumedNext = true
				}
			default:
				return false
			}
		}
		if consumedNext {
			i += 2
		} else {
			i++
		}
	}

	// Skip positional <lockfile>.
	if i >= len(args) {
		return false
	}
	i++
	if i >= len(args) {
		return false
	}
	// Handle "flock <file> -c <cmd-string>" / "flock <file> --command <cmd-string>".
	if args[i].Literal {
		tok := args[i].Value
		if tok == "-c" || tok == "--command" {
			if i+1 < len(args) && args[i+1].Literal && depth < argvMaxNestedPayloads {
				return bashCommandMatchesArgv(rule, args[i+1].Value, depth+1)
			}
			return false
		}
		if strings.HasPrefix(tok, "--command=") {
			if depth < argvMaxNestedPayloads {
				return bashCommandMatchesArgv(rule, strings.TrimPrefix(tok, "--command="), depth+1)
			}
			return false
		}
		if strings.HasPrefix(tok, "-c") && len(tok) > 2 {
			if depth < argvMaxNestedPayloads {
				return bashCommandMatchesArgv(rule, tok[2:], depth+1)
			}
			return false
		}
	}
	return callMatchesArgv(rule, args[i:], depth)
}

// parallelMatchesArgv strips parallel's leading options, stops before GNU
// parallel's input separators (:::, :::+, ::::, ::::+), and matches the
// wrapped command (including single-string shell commands like
// "parallel 'nmap -p 80 {}' ::: target").
//
// When no command precedes ":::", GNU parallel executes each argument after
// ":::" as a command line, so each literal argument up to the next separator
// is parsed as a Bash line at depth+1.
//
// Note: "parallel -a FILE" / "--arg-file FILE" and "parallel :::: FILE" read
// command lines from a file that the matcher does not read.
func parallelMatchesArgv(rule []string, args []callWord, depth int) bool {
	isParallelSep := func(w callWord) bool {
		return w.Literal && (w.Value == ":::" || w.Value == ":::+" || w.Value == "::::" || w.Value == "::::+")
	}
	for _, cand := range stripOneWrapperCandidates("parallel", args) {
		end := len(cand)
		for idx, w := range cand {
			if isParallelSep(w) {
				end = idx
				break
			}
		}
		cmd := cand[:end]
		if len(cmd) == 0 {
			// No command before separator: for ":::" each following literal
			// argument (until any subsequent separator) runs as a command line.
			// For ":::+", "::::", and "::::+", do not guess.
			if end < len(cand) && cand[end].Literal && cand[end].Value == ":::" && depth < argvMaxNestedPayloads {
				for _, arg := range cand[end+1:] {
					if isParallelSep(arg) {
						break
					}
					if arg.Literal && bashCommandMatchesArgv(rule, arg.Value, depth+1) {
						return true
					}
				}
			}
			continue
		}
		if callMatchesArgv(rule, cmd, depth) {
			return true
		}
		if len(cmd) == 1 && cmd[0].Literal && depth < argvMaxNestedPayloads {
			if bashCommandMatchesArgv(rule, cmd[0].Value, depth+1) {
				return true
			}
		}
	}
	return false
}

// wrapperSpec describes the leading-option layout for a known wrapper program.
// Explicit non-executing modes (stopShort / stopLong, plus --help / --version)
// skip unwrapping. Unknown options on a known wrapper are over-approximated
// (trying both 0-arg and 1-arg interpretations, capped by
// argvMaxWrapperCandidates) rather than returning no match.
type wrapperSpec struct {
	shortNoArg   string          // short flags that take no argument
	shortArg     string          // short flags that take one argument (attached or next token)
	shortOptAtt  string          // short flags that accept only an optional attached argument (never next token)
	shortOptAmb  string          // short flags with optional attached OR separate next-token value (try both)
	stopShort    string          // short flags indicating a non-executing mode (skip unwrapping)
	longNoArg    map[string]bool // --flag (no value)
	longArg      map[string]bool // --flag VAL or --flag=VAL
	longOptVal   map[string]bool // --flag or --flag=VAL (never consumes next token)
	stopLong     map[string]bool // --flag indicating a non-executing mode (skip unwrapping)
	allowBareMin bool            // treat bare "-" as a no-arg option
	allowNumFlag bool            // treat -<digits> as a no-arg option (nice -10)
	skipAssigns  bool            // skip NAME=VALUE tokens after options (env, sudo)
	posBeforeCmd int             // required positional arguments before the wrapped command
}

func strSet(names ...string) map[string]bool {
	m := make(map[string]bool, len(names))
	for _, n := range names {
		m[n] = true
	}
	return m
}

var wrapperSpecs = map[string]wrapperSpec{
	"env": {
		shortNoArg:   "i0v",
		shortArg:     "uCa",
		longNoArg:    strSet("ignore-environment", "null", "debug"),
		longArg:      strSet("unset", "chdir", "argv0"),
		longOptVal:   strSet("block-signal", "default-signal", "ignore-signal"),
		allowBareMin: true,
		skipAssigns:  true,
	},
	"command": {
		shortNoArg: "p",
		stopShort:  "vV",
	},
	"builtin": {},
	"exec": {
		shortNoArg: "cl",
		shortArg:   "a",
	},
	"nohup": {},
	"setsid": {
		shortNoArg: "cfw",
		longNoArg:  strSet("ctty", "fork", "wait"),
	},
	"stdbuf": {
		shortArg: "ioe",
		longArg:  strSet("input", "output", "error"),
	},
	"nice": {
		shortArg:     "n",
		longArg:      strSet("adjustment"),
		allowNumFlag: true,
	},
	"ionice": {
		shortNoArg: "t",
		shortArg:   "cn",
		stopShort:  "pPu",
		longNoArg:  strSet("ignore"),
		longArg:    strSet("class", "classdata"),
		stopLong:   strSet("pid", "pgid", "uid"),
	},
	"timeout": {
		shortNoArg:   "fpv",
		shortArg:     "ks",
		longNoArg:    strSet("foreground", "preserve-status", "verbose"),
		longArg:      strSet("kill-after", "signal"),
		posBeforeCmd: 1, // DURATION
	},
	"taskset": {
		shortNoArg:   "ca",
		stopShort:    "p",
		longNoArg:    strSet("cpu-list", "all-tasks"),
		stopLong:     strSet("pid"),
		posBeforeCmd: 1, // MASK / CPU-LIST
	},
	"chrt": {
		shortNoArg:   "abdforiRv",
		shortArg:     "TPD",
		stopShort:    "pm",
		longNoArg:    strSet("all-tasks", "batch", "deadline", "fifo", "idle", "other", "rr", "reset-on-fork", "verbose"),
		longArg:      strSet("sched-runtime", "sched-period", "sched-deadline"),
		stopLong:     strSet("pid", "max"),
		posBeforeCmd: 1, // PRIORITY
	},
	"sudo": {
		shortNoArg:  "AbBEHikKnPsSv",
		shortArg:    "CDghprRtTuU",
		stopShort:   "elV",
		longNoArg:   strSet("askpass", "background", "bell", "set-home", "login", "reset-timestamp", "remove-timestamp", "non-interactive", "preserve-groups", "shell", "stdin", "validate"),
		longArg:     strSet("close-from", "chdir", "group", "host", "prompt", "role", "chroot", "type", "command-timeout", "user", "other-user"),
		longOptVal:  strSet("preserve-env"),
		stopLong:    strSet("edit", "list"),
		skipAssigns: true,
	},
	"doas": {
		shortNoArg: "Lns",
		shortArg:   "au",
		stopShort:  "C",
	},
	"watch": {
		shortNoArg:  "bcCegprtwx",
		shortArg:    "nq",
		shortOptAmb: "d",
		longNoArg:   strSet("beep", "color", "no-color", "errexit", "chgexit", "precise", "no-rerun", "no-title", "no-wrap", "exec"),
		longArg:     strSet("interval", "equexit"),
		longOptVal:  strSet("differences"),
	},
	"flock": {
		shortNoArg:   "sxeunFo",
		shortArg:     "wE",
		longNoArg:    strSet("shared", "exclusive", "unlock", "nb", "nonblock", "no-fork", "close", "verbose"),
		longArg:      strSet("timeout", "wait", "conflict-exit-code"),
		posBeforeCmd: 1, // LOCKFILE
	},
	"strace": {
		shortNoArg: "cCdfFikqrtTvwxyYzZ",
		shortArg:   "abeEIoOpPsSuUX",
		longNoArg:  strSet("summary-only", "summary", "debug", "follow-forks", "instruction-pointer", "stack-traces", "quiet", "relative-timestamps", "absolute-timestamps", "syscall-times", "no-abbrev", "summary-wall-clock", "hex", "decode-fds", "decode-pids", "successful-only", "failed-only"),
		longArg:    strSet("columns", "detach-on", "trace", "env", "interruptible", "output", "output-separately", "attach", "trace-path", "string-limit", "summary-sort-by", "user", "signal", "status", "inject", "fault", "raw", "read", "write", "abbrev", "verbose", "silence", "strings-in-hex", "const-print-style"),
	},
	"ltrace": {
		shortNoArg: "bcCfiLrStT",
		shortArg:   "aADeFlnopsuwx",
		longNoArg:  strSet("no-signals", "demangle", "syscalls"),
		longArg:    strSet("align", "arraylen", "config", "debug", "library", "indent", "output", "attach", "strsize", "username", "where"),
	},
	"xargs": {
		shortNoArg:  "0oprtx",
		shortArg:    "adEILnPsR",
		shortOptAtt: "ei",
		shortOptAmb: "l",
		longNoArg:   strSet("null", "open-tty", "interactive", "no-run-if-empty", "verbose", "exit", "show-limits"),
		longArg:     strSet("arg-file", "delimiter", "eof", "replace", "max-lines", "max-args", "max-procs", "max-chars", "process-slot-var"),
	},
	"busybox": {
		stopLong: strSet("list", "list-full", "list-modules", "install"),
	},
	"chroot": {
		longNoArg:    strSet("skip-chdir"),
		longArg:      strSet("userspec", "groups"),
		posBeforeCmd: 1, // NEWROOT
	},
	"parallel": {
		shortNoArg: "0kmquvXi",
		shortArg:   "jnNPILSadEC",
		longNoArg:  strSet("null", "keep-order", "quote", "ungroup", "verbose", "bar", "eta", "progress", "no-notice", "will-cite", "plain", "pipe", "pipepart", "line-buffer", "group", "dry-run", "shuf", "link", "xargs"),
		longArg:    strSet("jobs", "max-args", "max-procs", "max-lines", "sshlogin", "sshloginfile", "basefile", "transferfile", "total-jobs", "block", "recstart", "recend", "compress-program", "use-compress-program", "nice", "sshdelay", "arg-file", "delimiter", "colsep", "tagstring", "timeout", "delay", "retries", "results", "joblog", "workdir", "wd", "env", "halt", "memfree", "load"),
		longOptVal: strSet("tag"),
	},
}

// stripOneWrapperCandidates returns the possible wrapped-command slices after
// stripping prog's options, assignments, and required positional arguments.
// For unambiguous known options it returns one slice; for optional-argument
// flags (such as xargs -l) or unknown options on a known wrapper it tries both
// 0-arg and 1-arg interpretations up to argvMaxWrapperCandidates.
func stripOneWrapperCandidates(prog string, args []callWord) [][]callWord {
	spec, ok := wrapperSpecs[prog]
	if !ok {
		return nil
	}
	var out [][]callWord
	seenIdx := map[int]bool{}
	var walk func(i int)
	walk = func(i int) {
		if len(out) >= argvMaxWrapperCandidates {
			return
		}
		for i < len(args) {
			if !args[i].Literal {
				if spec.skipAssigns && args[i].AssignLike {
					break
				}
				return
			}
			tok := args[i].Value
			if tok == "--" {
				i++
				break
			}
			if tok == "-" {
				if spec.allowBareMin {
					i++
					continue
				}
				break
			}
			if !strings.HasPrefix(tok, "-") {
				break
			}
			if strings.HasPrefix(tok, "--") {
				name := tok[2:]
				if eq := strings.IndexByte(name, '='); eq >= 0 {
					flagName := name[:eq]
					if spec.stopLong[flagName] {
						return
					}
					// Known or unknown --flag=val consumes one token.
					i++
					continue
				}
				if name == "help" || name == "version" || spec.stopLong[name] {
					return
				}
				if spec.longNoArg[name] || spec.longOptVal[name] {
					i++
					continue
				}
				if spec.longArg[name] {
					if i+1 >= len(args) {
						return
					}
					i += 2
					continue
				}
				// Unknown long option without "=": try both 0-arg and 1-arg.
				walk(i + 1)
				if i+1 < len(args) {
					walk(i + 2)
				}
				return
			}

			flags := tok[1:]
			if spec.allowNumFlag && isAllDigits(flags) {
				i++
				continue
			}
			consumedNext := false
			ambiguousNext := false
			unknownNext := false
			for j := 0; j < len(flags); j++ {
				ch := flags[j]
				switch {
				case strings.IndexByte(spec.stopShort, ch) >= 0:
					return
				case strings.IndexByte(spec.shortNoArg, ch) >= 0:
					continue
				case strings.IndexByte(spec.shortOptAtt, ch) >= 0:
					j = len(flags)
				case strings.IndexByte(spec.shortOptAmb, ch) >= 0:
					if j+1 < len(flags) {
						// Attached value (e.g. -l5) consumes the rest of this token.
						j = len(flags)
					} else {
						// Bare flag: try treating as no-arg AND (if a next token
						// could be its optional argument) consuming the next token.
						ambiguousNext = true
					}
				case strings.IndexByte(spec.shortArg, ch) >= 0:
					if j+1 < len(flags) {
						j = len(flags)
					} else {
						if i+1 >= len(args) {
							return
						}
						consumedNext = true
					}
				default:
					// Unknown short flag on a known wrapper: try both 0-arg and 1-arg.
					unknownNext = true
					j = len(flags)
				}
			}
			if unknownNext {
				walk(i + 1)
				if i+1 < len(args) {
					walk(i + 2)
				}
				return
			}
			if ambiguousNext && !consumedNext {
				// Interpretation 1: no-arg.
				walk(i + 1)
				// Interpretation 2: consumes next token as optional value
				// (e.g. xargs -l 5 nmap, watch -d permanent nmap).
				if i+1 < len(args) && optAmbMayConsume(prog, args[i+1]) {
					walk(i + 2)
				}
				return
			}
			if consumedNext {
				i += 2
			} else {
				i++
			}
		}

		if spec.skipAssigns {
			for i < len(args) && args[i].AssignLike {
				i++
			}
		}
		if spec.posBeforeCmd > 0 {
			if i+spec.posBeforeCmd > len(args) {
				return
			}
			i += spec.posBeforeCmd
		}
		if i >= len(args) || seenIdx[i] {
			return
		}
		seenIdx[i] = true
		out = append(out, args[i:])
	}
	walk(0)
	return out
}

func optAmbMayConsume(prog string, next callWord) bool {
	if !next.Literal {
		return true
	}
	switch prog {
	case "xargs":
		return isAllDigits(next.Value)
	case "watch":
		return next.Value == "permanent" || next.Value == "cumulative"
	default:
		return !strings.HasPrefix(next.Value, "-")
	}
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}
