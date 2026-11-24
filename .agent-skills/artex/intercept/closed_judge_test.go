package intercept

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"unicode/utf8"
)

// closedReply builds a valid answer object: every question "no" unless set.
func closedReply(set map[string]string) string {
	m := map[string]map[string]string{}
	for _, q := range closedQuestions {
		a := "no"
		if v, ok := set[q.ID]; ok {
			a = v
		}
		m[q.ID] = map[string]string{"answer": a, "evidence": "ev " + q.ID}
	}
	b, _ := json.Marshal(m)
	return string(b)
}

// fakeCompleter returns a fixed reply (or error) and counts its calls.
type fakeCompleter struct {
	reply        string
	err          error
	calls        int
	system, user string
}

func (f *fakeCompleter) complete(_ context.Context, profileID int64, system, user string) (string, int64, error) {
	f.calls++
	f.system, f.user = system, user
	return f.reply, 9, f.err
}

func closedCfg() JudgeConfig {
	return JudgeConfig{Enabled: true, Mode: JudgeModeClosed, Prompt: DefaultJudgePrompt, TimeoutSeconds: 5,
		FailAction: "allow", AskTimeoutSeconds: 60, AskTimeoutAction: "deny"}
}

var benignArgs = json.RawMessage(`{"command":"echo hi > report.txt"}`)

// The decision table. FailAction is set to allow in closedCfg: closed mode must
// still answer ask on every failure.
func TestClosedJudgeDecisionTable(t *testing.T) {
	bigArgs := json.RawMessage(`{"a":"` + strings.Repeat("x", JudgeArgumentCap) + `"}`)
	valid := closedReply(nil)
	cases := []struct {
		name, reply string
		err         error
		args        json.RawMessage
		action      string
		reason      string // expected reason prefix
		fallback    bool
		noCall      bool
	}{
		{name: "read-only allows", reply: closedReply(map[string]string{QReadOnly: "yes", QPentestAction: "yes"}), action: "allow", reason: "[model] allow read_only=yes: ev read_only"},
		{name: "read-only with unknown data_loss asks", reply: closedReply(map[string]string{QReadOnly: "yes", QDataLoss: "unknown"}), action: "ask", reason: "[model] ask data_loss=unknown: ev data_loss"},
		{name: "read-only with unknown policy asks", reply: closedReply(map[string]string{QReadOnly: "yes", QOperatorPolicy: "unknown"}), action: "ask", reason: "[model] ask operator_policy=unknown"},
		{name: "read-only with destructive and policy no allows", reply: closedReply(map[string]string{QReadOnly: "yes", QPentestAction: "unknown"}), action: "allow", reason: "[model] allow read_only=yes"},
		{name: "destructive overrides pentest", reply: closedReply(map[string]string{QPentestAction: "yes", QDataLoss: "yes"}), action: "deny", reason: "[model] deny data_loss=yes: ev data_loss"},
		{name: "destructive overrides read-only", reply: closedReply(map[string]string{QReadOnly: "yes", QAvailability: "yes"}), action: "deny", reason: "[model] deny availability=yes"},
		{name: "dos denies", reply: closedReply(map[string]string{QPentestAction: "yes", QDoS: "yes"}), action: "deny", reason: "[model] deny dos=yes"},
		{name: "credentials denies", reply: closedReply(map[string]string{QCredentialsACL: "yes"}), action: "deny", reason: "[model] deny credentials_acl=yes"},
		{name: "live config denies", reply: closedReply(map[string]string{QLiveConfig: "yes"}), action: "deny", reason: "[model] deny live_config=yes"},
		{name: "policy yes denies", reply: closedReply(map[string]string{QReadOnly: "yes", QOperatorPolicy: "yes"}), action: "deny", reason: "[model] deny operator_policy=yes"},
		{name: "unknown on a write asks", reply: closedReply(map[string]string{QPentestAction: "yes", QLiveConfig: "unknown"}), action: "ask", reason: "[model] ask live_config=unknown"},
		{name: "unknown read_only asks", reply: closedReply(map[string]string{QReadOnly: "unknown", QPentestAction: "yes"}), action: "ask", reason: "[model] ask read_only=unknown"},
		{name: "pentest write allows", reply: closedReply(map[string]string{QPentestAction: "yes"}), action: "allow", reason: "[model] allow pentest_action=yes"},
		{name: "clean write allows", reply: valid, action: "allow", reason: "[model] allow no_destructive_signal"},
		{name: "invalid output asks", reply: "ALLOW", action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "fenced output asks", reply: "```json\n" + valid + "\n```", action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "trailing text asks", reply: valid + " ok", action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "missing key asks", reply: strings.Replace(valid, `"dos":`, `"dos_x":`, 1), action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "duplicate key asks", reply: strings.Replace(valid, `{"availability":`, `{"read_only":{"answer":"yes","evidence":""},"availability":`, 1), action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "extra key asks", reply: strings.Replace(valid, `{"availability":`, `{"decision":{"answer":"yes","evidence":""},"availability":`, 1), action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "extra field asks", reply: strings.Replace(valid, `"evidence":"ev dos"`, `"evidence":"ev dos","score":"1"`, 1), action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "out-of-vocabulary asks", reply: closedReply(map[string]string{QDataLoss: "maybe"}), action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "upper-case answer asks", reply: closedReply(map[string]string{QDataLoss: "YES"}), action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "null answer asks", reply: strings.Replace(valid, `"answer":"no","evidence":"ev dos"`, `"answer":null,"evidence":"ev dos"`, 1), action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "long evidence asks", reply: strings.Replace(valid, `"ev dos"`, `"`+strings.Repeat("é", EvidenceRuneLimit+1)+`"`, 1), action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "multi-line evidence asks", reply: strings.Replace(valid, `"ev dos"`, `"a\nb"`, 1), action: "ask", reason: "[model] ask invalid_output", fallback: true},
		{name: "judge failure asks", err: errors.New("provider down"), action: "ask", reason: "[model] ask judge_failed: provider down", fallback: true},
		{name: "arguments above the cap ask", reply: valid, args: bigArgs, action: "ask", reason: "[model] ask arguments_over_cap", fallback: true, noCall: true},
		{name: "cap checked before the input is built", reply: valid, args: json.RawMessage(`{"a":"` + strings.Repeat("x", JudgeArgumentCap)), action: "ask", reason: "[model] ask arguments_over_cap", fallback: true, noCall: true},
		{name: "invalid arguments ask", reply: valid, args: json.RawMessage(`{"a":`), action: "ask", reason: "[model] ask review_context_incomplete", fallback: true, noCall: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := &fakeCompleter{reply: tc.reply, err: tc.err}
			args := tc.args
			if args == nil {
				args = benignArgs
			}
			dec, ok := judgeWith(t.Context(), closedCfg(), nil, f.complete, "Bash", args)
			if !ok || dec.Action != tc.action || !strings.HasPrefix(dec.Message, tc.reason) || dec.ModelFallback != tc.fallback {
				t.Fatalf("got ok=%v action=%q fallback=%v reason=%q, want %q %v %q", ok, dec.Action, dec.ModelFallback, dec.Message, tc.action, tc.fallback, tc.reason)
			}
			if (f.calls == 0) != tc.noCall {
				t.Fatalf("completer calls = %d, want call=%v", f.calls, !tc.noCall)
			}
			if tc.action == "ask" && (!dec.TimeoutEnabled || dec.TimeoutSeconds != 60 || dec.TimeoutAction != "deny") {
				t.Fatalf("ask lost the approval timeout: %+v", dec)
			}
			if dec.RuleID != 0 || dec.ConfigDigest == "" {
				t.Fatalf("model verdict carries rule %d / digest %q", dec.RuleID, dec.ConfigDigest)
			}
		})
	}
}

// Arguments exactly at the cap are judged; one byte more is not.
func TestClosedJudgeArgumentCapBoundary(t *testing.T) {
	pad := JudgeArgumentCap - len(`{"a":""}`)
	at := json.RawMessage(`{"a":"` + strings.Repeat("x", pad) + `"}`)
	f := &fakeCompleter{reply: closedReply(map[string]string{QReadOnly: "yes"})}
	if dec, _ := judgeWith(t.Context(), closedCfg(), nil, f.complete, "Bash", at); dec.Action != "allow" || f.calls != 1 {
		t.Fatalf("at the cap: %+v calls=%d", dec, f.calls)
	}
	if !strings.Contains(f.user, strings.Repeat("x", pad)) {
		t.Fatal("arguments at the cap were not sent complete")
	}
	over := json.RawMessage(`{"a":"` + strings.Repeat("x", pad+1) + `"}`)
	if dec, _ := judgeWith(t.Context(), closedCfg(), nil, f.complete, "Bash", over); dec.Action != "ask" || f.calls != 1 {
		t.Fatalf("over the cap: %+v calls=%d", dec, f.calls)
	}
}

// The request is the fixed system prompt plus the review input; the per-question
// answers reach the audit, and the reason records the trigger.
func TestClosedJudgeAuditRecordsAnswers(t *testing.T) {
	f := &fakeCompleter{reply: closedReply(map[string]string{QPentestAction: "yes", QDataLoss: "yes"})}
	dec, _ := judgeWith(t.Context(), closedCfg(), nil, f.complete, "Bash", benignArgs)
	if f.system != ClosedJudgePrompt || string(dec.ModelInput) != f.user || dec.ProfileID != 9 {
		t.Fatalf("request: system fixed=%v, model input stored=%v, profile=%d", f.system == ClosedJudgePrompt, string(dec.ModelInput) == f.user, dec.ProfileID)
	}
	raw, _ := json.Marshal(auditFor(t.Context(), dec, benignArgs, "denied"))
	if !strings.Contains(string(raw), `"initial_action":"deny","initial_reason":"[model] deny data_loss=yes: ev data_loss"`) ||
		!strings.Contains(string(raw), `"judge_answers":[{"id":"read_only","answer":"no","evidence":"ev read_only"},{"id":"availability",`) ||
		!strings.Contains(string(raw), `{"id":"data_loss","answer":"yes","evidence":"ev data_loss"}`) || strings.Count(string(raw), `"answer":`) != len(closedQuestions) {
		t.Fatalf("audit = %s", raw)
	}
}

// An empty mode is the default, closed; closed mode never uses the freeform
// reviewer, and an enabled closed judge with no completer asks.
func TestClosedJudgeIsTheDefaultMode(t *testing.T) {
	cfg, f := closedCfg(), &fakeCompleter{reply: closedReply(nil)}
	cfg.Mode = ""
	if dec, ok := judgeWith(t.Context(), cfg, func(context.Context, int64, string, ReviewInput) (Decision, error) {
		return Decision{Action: "allow"}, nil
	}, nil, "Bash", benignArgs); !ok || dec.Action != "ask" || !strings.HasPrefix(dec.Message, "[model] ask judge_not_wired") {
		t.Fatalf("closed mode without a completer: ok=%v %+v, want ask judge_not_wired", ok, dec)
	}
	if dec, ok := judgeWith(t.Context(), cfg, nil, f.complete, "Bash", benignArgs); !ok || f.calls != 1 || dec.JudgeAnswers == nil {
		t.Fatal("an empty mode did not run the closed judge")
	}
}

// Golden: the fixed closed-mode system prompt. Update the digest only with a
// deliberate change of the contract.
func TestClosedJudgePromptGolden(t *testing.T) {
	sum := sha256.Sum256([]byte(ClosedJudgePrompt))
	if got := hex.EncodeToString(sum[:]); got != closedPromptSHA256 {
		t.Fatalf("closed judge prompt changed: sha256 %s, want %s\n%s", got, closedPromptSHA256, ClosedJudgePrompt)
	}
	for _, q := range closedQuestions {
		if !strings.Contains(ClosedJudgePrompt, "\n"+q.ID+": "+q.Text+"\n") {
			t.Errorf("question %s missing", q.ID)
		}
	}
}

const closedPromptSHA256 = "8328bb7e3bcb1dbf109b57496d11e1907b21933af3fdfeaeb7b6f8516f445186"

// Golden of the existing behaviour: freeform sends the unchanged prompt and
// review input, honours the reviewer's verdict and the configured fail action,
// and applies no cap.
func TestFreeformJudgeUnchanged(t *testing.T) {
	sum := sha256.Sum256([]byte(EffectiveJudgePrompt(DefaultJudgePrompt)))
	if got := hex.EncodeToString(sum[:]); got != freeformPromptSHA256 {
		t.Fatalf("freeform prompt changed: sha256 %s, want %s", got, freeformPromptSHA256)
	}
	cfg := closedCfg()
	cfg.Mode = JudgeModeFreeform
	cfg.Prompt = "custom policy"
	var gotPrompt string
	var gotInput ReviewInput
	verdict, verr := Decision{Action: "deny", Message: "Actual action: x; Consequence if successful: y; Matched rule: D4"}, error(nil)
	reviewer := func(_ context.Context, _ int64, prompt string, in ReviewInput) (Decision, error) {
		gotPrompt, gotInput = prompt, in
		return verdict, verr
	}
	f := &fakeCompleter{}
	dec, ok := judgeWith(t.Context(), cfg, reviewer, f.complete, "Bash", benignArgs)
	if !ok || f.calls != 0 || dec.Action != "deny" || dec.Message != "[model] "+verdict.Message || dec.JudgeAnswers != nil || dec.ModelFallback {
		t.Fatalf("freeform verdict: %+v", dec)
	}
	if gotPrompt != EffectiveJudgePrompt("custom policy") {
		t.Fatal("freeform prompt is not the effective custom prompt")
	}
	if raw, _ := json.Marshal(gotInput); !strings.HasPrefix(string(raw), `{"version":4,"tool_name":"Bash","arguments":{"command":"echo hi `) || strings.Contains(string(raw), "operator_policy") {
		t.Fatalf("freeform review input changed: %s", raw)
	}
	// The configured fail action still applies in freeform (here: allow).
	verr = errors.New("down")
	if dec, _ := judgeWith(t.Context(), cfg, reviewer, nil, "Bash", benignArgs); dec.Action != "allow" || !dec.ModelFallback {
		t.Fatalf("freeform failure: %+v", dec)
	}
	verdict, verr = Decision{Action: "maybe"}, nil
	if dec, _ := judgeWith(t.Context(), cfg, reviewer, nil, "Bash", benignArgs); dec.Action != "allow" || !strings.Contains(dec.Message, "unparsable") {
		t.Fatalf("freeform unparsable: %+v", dec)
	}
	// No cap in freeform: large arguments reach the reviewer complete.
	verdict = Decision{Action: "allow", Message: "Actual action: x; Consequence if successful: y; Matched rule: A5"}
	big := json.RawMessage(`{"a":"` + strings.Repeat("x", JudgeArgumentCap) + `"}`)
	if dec, _ := judgeWith(t.Context(), cfg, reviewer, nil, "Bash", big); dec.Action != "allow" || len(gotInput.Arguments) != len(big) {
		t.Fatalf("freeform large arguments: %+v", dec)
	}
}

// Digest of EffectiveJudgePrompt(DefaultJudgePrompt) as on main before closed mode.
const freeformPromptSHA256 = "9b3372d154e10c7503d68324de86adcc079f7ee6beece7ee412eac00ae0d98ca"

func TestOperatorPolicyIsBoundedData(t *testing.T) {
	if operatorPolicy(DefaultJudgePrompt) != nil || operatorPolicy("  ") != nil {
		t.Fatal("the built-in template or an empty prompt is not an operator policy")
	}
	exact := strings.Repeat("é", PolicyRuneLimit)
	if p := operatorPolicy(exact); p == nil || p.Text != exact || p.Truncated {
		t.Fatal("a policy at the limit was changed")
	}
	p := operatorPolicy(exact + "ZZZ")
	if p == nil || !p.Truncated || p.Text != exact+PolicyTruncatedMarker || !utf8.ValidString(p.Text) {
		t.Fatalf("over the limit: truncated=%v len=%d", p != nil && p.Truncated, len(p.Text))
	}
	// The policy reaches the model in the user input, never in the system prompt.
	cfg := closedCfg()
	cfg.Prompt = "never touch host db01"
	f := &fakeCompleter{reply: closedReply(map[string]string{QOperatorPolicy: "yes"})}
	dec, _ := judgeWith(t.Context(), cfg, nil, f.complete, "Bash", benignArgs)
	if f.system != ClosedJudgePrompt || !strings.Contains(f.user, `"operator_policy":{"text":"never touch host db01"}`) || dec.Action != "deny" {
		t.Fatalf("policy as data: user=%s action=%s", f.user, dec.Action)
	}
}

func TestDefaultJudgeFailActionIsAsk(t *testing.T) {
	if defaultJudgeFailAction != "ask" {
		t.Fatalf("defaultJudgeFailAction = %q, want ask", defaultJudgeFailAction)
	}
}
