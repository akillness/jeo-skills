package notify

import (
	"errors"
	"strings"
	"testing"
)

func TestMaskedValueHidesBodyButKeepsTailHint(t *testing.T) {
	const secret = "https://oapi.dingtalk.com/robot/send?access_token=abcdef123456"
	got := MaskedValue(secret)
	if strings.Contains(got, "abcdef123456") {
		t.Fatalf("masked value leaked the full credential: %q", got)
	}
	if strings.Contains(got, "oapi.dingtalk.com") {
		t.Fatalf("masked value should not expose the address body: %q", got)
	}
	// The last 6 characters must be kept so the user can recognize which bot it is.
	if !strings.HasSuffix(got, "123456") {
		t.Fatalf("should keep the last 6 characters as an identification hint: %q", got)
	}
	if !IsMasked(got) {
		t.Fatalf("a masked value must be recognized by IsMasked: %q", got)
	}
}

func TestMaskedValueShortSecretGivesNoHint(t *testing.T) {
	// If a short credential also exposed its last 6 characters, that would expose
	// the entire credential.
	for _, s := range []string{"abc", "abcdef", ""} {
		got := MaskedValue(s)
		if got != MaskedPrefix {
			t.Fatalf("a credential of length %d should give no tail hint, got %q", len(s), got)
		}
		if s != "" && strings.Contains(got, s) {
			t.Fatalf("masked value contains the original value: %q", got)
		}
	}
}

func TestMaskConfigMasksOnlySecrets(t *testing.T) {
	cfg := map[string]any{
		"webhook": "https://example.com/hook?token=SECRETVALUE",
		"secret":  "SECtest123456",
		"port":    float64(587),
		"host":    "smtp.example.com",
	}
	masked := MaskConfig(KindDingTalk, cfg)
	for _, k := range []string{"webhook", "secret"} {
		s, _ := masked[k].(string)
		if !IsMasked(s) {
			t.Errorf("%s should be masked, got %q", k, s)
		}
	}
	// Non-credential fields must be kept as-is, otherwise the UI cannot render.
	if masked["port"] != float64(587) {
		t.Errorf("non-credential field port should not be modified: %v", masked["port"])
	}
}

func TestMaskConfigUnknownKindReturnsEmpty(t *testing.T) {
	// When the channel kind cannot be recognized, better to let the UI show an
	// empty configuration than to spit back raw content that may contain
	// credentials.
	got := MaskConfig("nope", map[string]any{"webhook": "https://x/y?token=LEAK"})
	if len(got) != 0 {
		t.Fatalf("an unknown channel kind should return an empty configuration, got %v", got)
	}
}

func TestMaskConfigDoesNotMutateInput(t *testing.T) {
	// Masking is a display-layer behavior; it must not turn around and modify the
	// real values in the database.
	cfg := map[string]any{"webhook": "https://example.com/hook", "secret": "SECtest123456"}
	_ = MaskConfig(KindDingTalk, cfg)
	if IsMasked(cfg["secret"].(string)) {
		t.Fatal("MaskConfig mutated its input, which would cause the real credential to be overwritten by the masked value")
	}
}

func TestMergeConfigKeepsStoredOnMaskedIncoming(t *testing.T) {
	stored := map[string]any{"webhook": "https://real/hook", "secret": "REALSECRET", "method": "POST"}
	// The user only changed method; the browser submits masked values + the new
	// method.
	incoming := map[string]any{
		"webhook": MaskedValue("https://real/hook"),
		"secret":  MaskedValue("REALSECRET"),
		"method":  "PUT",
	}
	got := MergeConfig(stored, incoming)
	if got["webhook"] != "https://real/hook" || got["secret"] != "REALSECRET" {
		t.Fatalf("masked fields should keep the stored values, got %v", got)
	}
	if got["method"] != "PUT" {
		t.Fatalf("the modified field should take effect, got %v", got["method"])
	}
}

func TestMergeConfigEmptyStringClears(t *testing.T) {
	stored := map[string]any{"webhook": "https://real/hook", "secret": "REALSECRET"}
	got := MergeConfig(stored, map[string]any{"secret": ""})
	if _, ok := got["secret"]; ok {
		t.Fatalf("an empty string should clear the field, got %v", got)
	}
	// Unmentioned fields are kept (partial update semantics).
	if got["webhook"] != "https://real/hook" {
		t.Fatalf("unmentioned fields should be kept, got %v", got)
	}
}

func TestMergeConfigKeepsUnmentionedStoredKeys(t *testing.T) {
	stored := map[string]any{"host": "smtp.example.com", "port": float64(587), "password": "pw"}
	got := MergeConfig(stored, map[string]any{"port": float64(465)})
	if got["host"] != "smtp.example.com" || got["password"] != "pw" {
		t.Fatalf("unmentioned fields should be kept, got %v", got)
	}
	if got["port"] != float64(465) {
		t.Fatalf("mentioned fields should be updated, got %v", got["port"])
	}
}

// TestPrepareConfigUpdateBlocksDestinationSwap is the most important security
// invariant of this package: **changing the destination address must not carry
// the old credentials along**.
//
// These cases use inputs in the exact shape of the attack (change only the
// address, say nothing about the credentials) rather than "valid inputs to the
// defense logic" — testing only the latter would stay green even if the defense
// did nothing.
func TestPrepareConfigUpdateBlocksDestinationSwap(t *testing.T) {
	cases := []struct {
		name     string
		kind     string
		stored   map[string]any
		incoming map[string]any
		// wantMissing is the credential key expected to be named.
		wantMissing string
	}{
		{
			name: "generic webhook changing URL while trying to keep the Authorization header",
			kind: KindWebhook,
			stored: map[string]any{
				"url":     "https://legit.example.com/hook",
				"headers": map[string]any{"Authorization": "Bearer REAL-TOKEN"},
			},
			incoming:    map[string]any{"url": "https://attacker.tld/c"},
			wantMissing: "headers",
		},
		{
			name:        "Telegram changing base_url to send the Bot Token to its own endpoint",
			kind:        KindTelegram,
			stored:      map[string]any{"bot_token": "123456:REAL", "chat_id": "1", "base_url": "https://api.telegram.org"},
			incoming:    map[string]any{"base_url": "https://attacker.tld"},
			wantMissing: "bot_token",
		},
		{
			name:        "email changing the SMTP host to hand over the password",
			kind:        KindEmail,
			stored:      map[string]any{"host": "smtp.corp.com", "port": 587, "password": "REALPW", "from": "a@b.c", "to": []any{"d@e.f"}},
			incoming:    map[string]any{"host": "smtp.attacker.tld"},
			wantMissing: "password",
		},
		{
			name:        "email toggling TLS must also re-declare the password",
			kind:        KindEmail,
			stored:      map[string]any{"host": "smtp.corp.com", "port": 587, "tls": false, "password": "REALPW", "from": "a@b.c", "to": []any{"d@e.f"}},
			incoming:    map[string]any{"tls": true},
			wantMissing: "password",
		},
		{
			// Masked value = "keep the old credential", which must also be rejected
			// in the context of an address change.
			name:        "passing back masked credentials + new address",
			kind:        KindTelegram,
			stored:      map[string]any{"bot_token": "123456:REAL", "chat_id": "1", "base_url": "https://api.telegram.org"},
			incoming:    map[string]any{"base_url": "https://attacker.tld", "bot_token": MaskedValue("123456:REAL")},
			wantMissing: "bot_token",
		},
		{
			name:        "DingTalk changing the webhook while trying to keep the signing secret",
			kind:        KindDingTalk,
			stored:      map[string]any{"webhook": "https://oapi.dingtalk.com/robot/send?access_token=OLD", "secret": "REALSEC"},
			incoming:    map[string]any{"webhook": "https://attacker.tld/hook"},
			wantMissing: "secret",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			merged, err := PrepareConfigUpdate(tc.kind, tc.stored, tc.incoming)
			if err == nil {
				t.Fatalf("changing the address without re-declaring credentials should be rejected; got config %v", merged)
			}
			var target *ErrDestinationChangedWithoutCredentials
			if !errors.As(err, &target) {
				t.Fatalf("a dedicated error type should be returned so the API can give actionable guidance, got %T: %v", err, err)
			}
			found := false
			for _, m := range target.Missing {
				if m == tc.wantMissing {
					found = true
				}
			}
			if !found {
				t.Fatalf("the missing credential key %q should be named, got %v", tc.wantMissing, target.Missing)
			}
			// The error message must be able to guide the operator on how to fix it.
			if !strings.Contains(err.Error(), tc.wantMissing) {
				t.Errorf("error message should mention %q: %v", tc.wantMissing, err)
			}
		})
	}
}

// TestPrepareConfigUpdateAllowsLegitimateEdits is the counterpart: legitimate
// edits must not be blocked by mistake, otherwise this protection would get
// bypassed or deleted for being "too annoying".
func TestPrepareConfigUpdateAllowsLegitimateEdits(t *testing.T) {
	cases := []struct {
		name     string
		kind     string
		stored   map[string]any
		incoming map[string]any
	}{
		{
			name:     "only renaming (config passed back as-is)",
			kind:     KindWebhook,
			stored:   map[string]any{"url": "https://legit.example.com/hook", "headers": map[string]any{"Authorization": "Bearer REAL"}},
			incoming: map[string]any{"url": MaskedValue("https://legit.example.com/hook")},
		},
		{
			name:     "only changing the request method, address and credentials untouched",
			kind:     KindWebhook,
			stored:   map[string]any{"url": "https://legit.example.com/hook", "method": "POST"},
			incoming: map[string]any{"method": "PUT"},
		},
		{
			name:     "changing the address **and** providing new credentials",
			kind:     KindWebhook,
			stored:   map[string]any{"url": "https://old.example.com/hook", "headers": map[string]any{"Authorization": "Bearer OLD"}},
			incoming: map[string]any{"url": "https://new.example.com/hook", "headers": map[string]any{"Authorization": "Bearer NEW"}},
		},
		{
			name:     "changing the address and explicitly declaring the credential is no longer needed",
			kind:     KindWebhook,
			stored:   map[string]any{"url": "https://old.example.com/hook", "headers": map[string]any{"Authorization": "Bearer OLD"}},
			incoming: map[string]any{"url": "https://new.example.com/hook", "headers": ""},
		},
		{
			name:     "Telegram changing chat_id (not a destination)",
			kind:     KindTelegram,
			stored:   map[string]any{"bot_token": "t", "chat_id": "1", "base_url": "https://api.telegram.org"},
			incoming: map[string]any{"chat_id": "-100200"},
		},
		{
			name:     "email changing recipients (not a destination)",
			kind:     KindEmail,
			stored:   map[string]any{"host": "smtp.corp.com", "port": 587, "password": "PW", "from": "a@b.c", "to": []any{"x@y.z"}},
			incoming: map[string]any{"to": []any{"new@y.z"}},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			merged, err := PrepareConfigUpdate(tc.kind, tc.stored, tc.incoming)
			if err != nil {
				t.Fatalf("legitimate edit was blocked by mistake: %v", err)
			}
			if merged == nil {
				t.Fatal("should return a merged result")
			}
		})
	}
}

// TestPrepareConfigUpdatePortTypeTolerance covers a detail that is easy to
// misjudge: the frontend submits the port as a JSON number (float64) and the
// database reads it back as float64 too, but the two values can have different
// types (e.g. int vs float64). Comparing with == would judge "unchanged" as
// "changed", popping "please re-fill the password" at a user who only renamed
// the channel — false alarms teach people to stop trusting this protection.
func TestPrepareConfigUpdatePortTypeTolerance(t *testing.T) {
	stored := map[string]any{"host": "smtp.corp.com", "port": float64(587), "password": "PW"}
	// The same port, submitted as an int.
	if _, err := PrepareConfigUpdate(KindEmail, stored, map[string]any{"port": 587}); err != nil {
		t.Fatalf("an identical port value (type aside) should not be judged as an address change: %v", err)
	}
	// Really changing the port must be blocked.
	if _, err := PrepareConfigUpdate(KindEmail, stored, map[string]any{"port": 25}); err == nil {
		t.Fatal("a port change should be blocked")
	}
}

// TestPrepareConfigUpdateSurvivesRepeatedSaveWithBlankDestination covers the
// path of "a destination field that may be left blank": Telegram's base_url left
// empty means use the official API address.
//
// This once made the channel fail to save permanently starting from the second
// save:
//
//	at creation, base_url:"" is stored (the creation path stores the frontend-submitted
//	config directly, without going through MergeConfig)
//	→ first save: MergeConfig treats the empty string as an explicit clear and deletes the key
//	→ second save: incoming is still "" while stored no longer has the key, judged as "address changed"
//	→ bot_token is the masked echo value → 400 "destination address has changed, please re-fill the credential fields"
//
// The user changed nothing, yet could never save again unless they re-pasted the
// Bot Token.
func TestPrepareConfigUpdateSurvivesRepeatedSaveWithBlankDestination(t *testing.T) {
	stored := map[string]any{"bot_token": "123:ABC", "chat_id": "-100", "base_url": ""}

	// The frontend buildConfig() submits a value for every field definition of
	// this channel: credentials are back-filled with the masked value, and empty
	// text boxes submit empty strings. Reproduce its output in full here, rather
	// than submitting only "the changed keys".
	submit := func() map[string]any {
		return map[string]any{
			"bot_token": MaskedValue("123:ABC"),
			"chat_id":   "-100",
			"base_url":  "",
		}
	}

	// First save: only the channel name changed; config is passed back as-is.
	merged, err := PrepareConfigUpdate(KindTelegram, stored, submit())
	if err != nil {
		t.Fatalf("first save was blocked by mistake: %v", err)
	}
	if _, ok := merged["base_url"]; ok {
		t.Fatal("precondition changed: the empty string should have been deleted by MergeConfig — what this case covers is exactly the step 'after the key disappears'")
	}

	// Second save: the submission is identical to last time; the user changed
	// nothing.
	merged2, err := PrepareConfigUpdate(KindTelegram, merged, submit())
	if err != nil {
		t.Fatalf("second save was blocked by mistake (user changed nothing): %v", err)
	}
	// Third time, to confirm saving works stably rather than failing only once.
	if _, err := PrepareConfigUpdate(KindTelegram, merged2, submit()); err != nil {
		t.Fatalf("third save was blocked by mistake: %v", err)
	}
	// The credential must survive all the way through, not cleared by the
	// empty-string logic.
	if got := merged2["bot_token"]; got != "123:ABC" {
		t.Fatalf("Bot Token should keep the original value, got %v", got)
	}
}

// TestPrepareConfigUpdateStillGuardsBlankDestinationChanges is the paired
// assertion of the previous case: treating an empty string and "key absent" as
// equivalent must **not** also let real address changes through. Both directions
// are real credential exfiltration paths — Telegram's Bot Token travels in the
// URL path, so changing base_url means handing the Token to the new address.
func TestPrepareConfigUpdateStillGuardsBlankDestinationChanges(t *testing.T) {
	// Direction one: from "empty" (the official address) to a self-hosted one.
	official := map[string]any{"bot_token": "123:ABC", "chat_id": "-100"}
	if _, err := PrepareConfigUpdate(KindTelegram, official, map[string]any{
		"bot_token": MaskedValue("123:ABC"),
		"base_url":  "https://tg-proxy.attacker.tld",
	}); err == nil {
		t.Fatal("switching from the official address to a self-hosted one must require re-entering the Token")
	}

	// Direction two: clearing a self-hosted address (= switching back to the
	// official API) is likewise an address change.
	proxied := map[string]any{"bot_token": "123:ABC", "base_url": "https://proxy.internal/bot"}
	if _, err := PrepareConfigUpdate(KindTelegram, proxied, map[string]any{
		"bot_token": MaskedValue("123:ABC"),
		"base_url":  "",
	}); err == nil {
		t.Fatal("clearing a self-hosted address (switching back to the official API) is likewise an address change and must require re-entering the Token")
	}
}

func TestDestinationKeysDeclaredForEveryKind(t *testing.T) {
	// Same as SecretKeys: if a channel forgets to declare its destination keys,
	// PrepareConfigUpdate cannot protect it.
	for kind, ch := range registry {
		if len(ch.DestinationKeys()) == 0 {
			t.Errorf("channel %s declares no destination keys; the protection against address changes carrying credentials is ineffective for it", kind)
		}
		if len(ch.SecretKeys()) == 0 {
			t.Errorf("channel %s declares no credential keys", kind)
		}
	}
}

func TestSecretKeysDeclaredForEveryKind(t *testing.T) {
	// The compiler already forces every channel to implement SecretKeys; this
	// double-checks that "no channel turns in a blank sheet on masking" — a
	// channel returning an empty slice means its credentials would be echoed to
	// the browser in plaintext.
	expect := map[string]bool{
		KindDingTalk: true, KindFeishu: true, KindWeCom: true,
		KindWebhook: true, KindTelegram: true, KindEmail: true,
	}
	for kind, ch := range registry {
		if !expect[kind] {
			t.Errorf("channel %s is not registered with a masking expectation in the test", kind)
			continue
		}
		if len(ch.SecretKeys()) == 0 {
			t.Errorf("channel %s declares no credential fields; its configuration would be echoed in plaintext", kind)
		}
	}
}

// TestPrepareConfigUpdateRejectsMaskedInContainer covers a gap pointed out in
// review: when the masking sentinel is stuffed into a **non-string** structure
// (e.g. webhook.headers is an object), MergeConfig only recognizes "a string with
// the prefix" as masked, so the literal "__masked__" would be stored as a real
// header value — authentication silently fails afterwards, with no error
// anywhere.
func TestPrepareConfigUpdateRejectsMaskedInContainer(t *testing.T) {
	stored := map[string]any{
		"url":     "https://legit.example.com/hook",
		"headers": map[string]any{"Authorization": "Bearer REAL"},
	}
	// Masking sentinel embedded inside an object.
	incoming := map[string]any{
		"headers": map[string]any{"Authorization": MaskedPrefix},
	}
	if _, err := PrepareConfigUpdate(KindWebhook, stored, incoming); err == nil {
		t.Fatal("a masking sentinel embedded inside a structure should be rejected (otherwise the literal gets stored)")
	}
	// Submitting the object as a whole (a real new value) is accepted as usual.
	ok := map[string]any{"headers": map[string]any{"Authorization": "Bearer NEW"}}
	if _, err := PrepareConfigUpdate(KindWebhook, stored, ok); err != nil {
		t.Fatalf("submitting new request headers normally should not be blocked: %v", err)
	}
}
