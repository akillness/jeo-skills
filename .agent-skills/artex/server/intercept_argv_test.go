package server

import (
	"testing"

	"github.com/Autumn-27/artex/intercept"
)

func TestValidateArgvRuleReq(t *testing.T) {
	base := interceptRuleReq{Name: "r", MatchTarget: "tool_input", MatchType: "argv", Pattern: `["nmap"]`, Action: "allow"}
	if err := validateInterceptRuleReq(base); err != nil {
		t.Fatalf("valid argv rule refused: %v", err)
	}
	for name, mut := range map[string]func(*interceptRuleReq){
		"tool_name target": func(r *interceptRuleReq) { r.MatchTarget = "tool_name" },
		"empty pattern":    func(r *interceptRuleReq) { r.Pattern = "" },
		"empty token":      func(r *interceptRuleReq) { r.Pattern = `["git",""]` },
		"flag token":       func(r *interceptRuleReq) { r.Pattern = `["nmap","-C"]` },
		"metacharacter":    func(r *interceptRuleReq) { r.Pattern = `["nmap;id"]` },
		"nine tokens":      func(r *interceptRuleReq) { r.Pattern = `["a","b","c","d","e","f","g","h","i"]` },
		"not an array":     func(r *interceptRuleReq) { r.Pattern = `git push` },
	} {
		req := base
		mut(&req)
		if err := validateInterceptRuleReq(req); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

// The manual rule form refuses an argv allow rule for a denylisted program,
// with the message of the "always allow" endpoint; deny and ask stay creatable.
func TestValidateArgvAllowDenylist(t *testing.T) {
	for _, pattern := range []string{`["python"]`, `["python3.11"]`, `["/usr/bin/env"]`, `["find"]`, `["docker","run"]`, `["git","push"]`, `["cmake"]`} {
		req := interceptRuleReq{Name: "r", MatchTarget: "tool_input", MatchType: "argv", Pattern: pattern, Action: "allow"}
		tokens, _ := intercept.ParseArgvPattern(pattern)
		want := intercept.CheckArgvAllow(tokens)
		if err := validateInterceptRuleReq(req); err == nil || want == nil || err.Error() != want.Error() {
			t.Errorf("allow %s: %v, want %v", pattern, err, want)
		}
		for _, action := range []string{"deny", "ask"} {
			req.Action = action
			if err := validateInterceptRuleReq(req); err != nil {
				t.Errorf("%s %s refused: %v", action, pattern, err)
			}
		}
	}
	for _, pattern := range []string{`["nmap"]`, `["curl"]`} {
		req := interceptRuleReq{Name: "r", MatchTarget: "tool_input", MatchType: "argv", Pattern: pattern, Action: "allow"}
		if err := validateInterceptRuleReq(req); err != nil {
			t.Errorf("allow %s refused: %v", pattern, err)
		}
	}
}
