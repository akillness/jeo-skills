package notify

import (
	"strings"
	"testing"
)

func TestMessageIDDomainFromCommentedAddress(t *testing.T) {
	if got := messageIDDomain("Name <a@example.com> (comment)"); got != "example.com" {
		t.Fatalf("domain = %q, want example.com", got)
	}
	if got := messageIDDomain("ops@example.org"); got != "example.org" {
		t.Fatalf("domain = %q, want example.org", got)
	}
}

func TestMessageIDDomainFallsBackToLocalhost(t *testing.T) {
	for _, from := range []string{"no-at-sign", "a@", "Name <a@>", ""} {
		if got := messageIDDomain(from); got != "localhost" {
			t.Fatalf("messageIDDomain(%q) = %q, want localhost", from, got)
		}
	}
}

func TestBuildEmailMessageRefusesLineBreaksInHeaders(t *testing.T) {
	cases := []struct {
		name string
		from string
		to   []string
	}{
		{"CRLF in sender", "a@example.com\r\nBcc: victim@example.net", []string{"b@example.org"}},
		{"LF in sender", "a@example.com\nBcc: victim@example.net", []string{"b@example.org"}},
		{"CRLF in recipient", "a@example.com", []string{"b@example.org\r\nBcc: victim@example.net"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			msg, err := buildEmailMessage(c.from, c.to, Message{})
			if err == nil {
				t.Fatalf("expected an error, got message:\n%s", msg)
			}
			if strings.Contains(msg, "Bcc:") {
				t.Fatal("no header may be produced from an injected value")
			}
		})
	}
}

func TestSenderAddressValidation(t *testing.T) {
	if _, err := senderAddress("a@example.com\r\nX: y"); err == nil {
		t.Fatal("CRLF sender must be refused")
	}
	if _, err := senderAddress("not an address"); err == nil {
		t.Fatal("unparseable sender must be refused")
	}
	addr, err := senderAddress("Name <a@example.com> (comment)")
	if err != nil {
		t.Fatalf("commented sender refused: %v", err)
	}
	if addr.Address != "a@example.com" {
		t.Fatalf("envelope address = %q, want a@example.com", addr.Address)
	}
}

func TestEmailValidateRejectsBadSenderAndRecipients(t *testing.T) {
	base := map[string]any{"host": "smtp.example.com", "port": 587, "to": []any{"b@example.org"}}
	ok := map[string]any{"host": "smtp.example.com", "port": 587, "from": "a@example.com", "to": []any{"b@example.org"}}
	if err := (emailChannel{}).Validate(ok); err != nil {
		t.Fatalf("valid config refused: %v", err)
	}
	if err := (emailChannel{}).Validate(base); err == nil {
		t.Fatal("empty sender must be refused")
	}
	bad := map[string]any{"host": "smtp.example.com", "port": 587, "from": "not an address", "to": []any{"b@example.org"}}
	if err := (emailChannel{}).Validate(bad); err == nil {
		t.Fatal("invalid sender must be refused")
	}
	crlf := map[string]any{"host": "smtp.example.com", "port": 587, "from": "a@example.com", "to": []any{"b@example.org\r\nX: y"}}
	if err := (emailChannel{}).Validate(crlf); err == nil {
		t.Fatal("CRLF recipient must be refused")
	}
}
