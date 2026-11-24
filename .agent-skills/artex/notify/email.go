package notify

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

// emailDialTimeout / emailSessionTimeout bound connection setup and the whole
// SMTP session respectively. net/smtp has no timeout mechanism of its own;
// without these two, a stuck peer would hang the delivery goroutine forever —
// and since the dispatcher is a single goroutine processing serially, that
// stalls the entire notification system.
const (
	emailDialTimeout    = 10 * time.Second
	emailSessionTimeout = 45 * time.Second
)

// emailChannel implements SMTP email delivery.
type emailChannel struct{}

func (emailChannel) Kind() string { return KindEmail }

// Email has no platform rate limit, but it should not be used to spam; give a
// lenient default.
func (emailChannel) DefaultRatePerMin() int { return 60 }

// Only the password is masked. SMTP host, account, and recipients are not
// secrets; masking them would only make editing harder.
func (emailChannel) SecretKeys() []string { return []string{"password"} }

// host/port decide which server the password is handed to; tls decides whether
// the transport is encrypted. Any change to the three requires re-affirming the
// password — which also makes "turn off TLS" a step that must explicitly carry
// the credential rather than a casual edit.
func (emailChannel) DestinationKeys() []string { return []string{"host", "port", "tls"} }

func (emailChannel) Validate(cfg map[string]any) error {
	if cfgString(cfg, "host") == "" {
		return errors.New("missing SMTP server address")
	}
	port := cfgInt(cfg, "port")
	if port <= 0 || port > 65535 {
		return errors.New("invalid SMTP port (should be 1-65535)")
	}
	if cfgString(cfg, "from") == "" {
		return errors.New("missing sender address")
	}
	if len(cfgStrings(cfg, "to")) == 0 {
		return errors.New("at least one recipient address is required")
	}
	for _, rcpt := range cfgStrings(cfg, "to") {
		if hasLineBreak(rcpt) {
			return errors.New("recipient address must not contain line breaks")
		}
	}
	if _, err := senderAddress(cfgString(cfg, "from")); err != nil {
		return err
	}
	return nil
}

func (c emailChannel) Send(ctx context.Context, cfg map[string]any, m Message) (int, error) {
	if err := c.Validate(cfg); err != nil {
		return 0, Permanent(err)
	}
	host := cfgString(cfg, "host")
	port := cfgInt(cfg, "port")
	from := cfgString(cfg, "from")
	to := cfgStrings(cfg, "to")
	username := cfgString(cfg, "username")
	password := cfgString(cfg, "password")
	implicitTLS := cfgBool(cfg, "tls")

	sender, err := senderAddress(from)
	if err != nil {
		return 0, Permanent(err)
	}
	msg, err := buildEmailMessage(from, to, m)
	if err != nil {
		return 0, Permanent(err)
	}

	addr := net.JoinHostPort(host, strconv.Itoa(port))
	client, err := emailDial(ctx, addr, host, implicitTLS)
	if err != nil {
		return 0, err
	}
	defer client.Close()

	// STARTTLS: upgrade when the peer supports it. Credentials must not be sent
	// on a plaintext session (see the auth note below).
	if !implicitTLS {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
				return 0, fmt.Errorf("STARTTLS failed: %w", err)
			}
		}
	}
	if username != "" {
		if err := client.Auth(smtp.PlainAuth("", username, password, host)); err != nil {
			// smtp.PlainAuth refuses to send credentials over an unencrypted
			// connection (unless the target is localhost). That is **correct**
			// security behavior and must not be bypassed, but the reason needs to
			// be spelled out — otherwise the user just sees "unencrypted
			// connection" with no idea what to do.
			if strings.Contains(err.Error(), "unencrypted connection") {
				return 0, Permanent(fmt.Errorf("refusing to send credentials: the connection is not encrypted. Enable TLS, or use port 465 (implicit TLS), or tick the \"Enable TLS\" checkbox (%w)", err))
			}
			return 0, Permanent(fmt.Errorf("SMTP authentication failed: %w", err))
		}
	}
	// The envelope sender is the bare address; the display name stays in the header.
	if err := client.Mail(sender.Address); err != nil {
		return 0, smtpStageError(fmt.Sprintf("sender %s rejected", sender.Address), err)
	}
	for _, rcpt := range to {
		if err := client.Rcpt(rcpt); err != nil {
			return 0, smtpStageError(fmt.Sprintf("recipient %s rejected", rcpt), err)
		}
	}
	w, err := client.Data()
	if err != nil {
		return 0, fmt.Errorf("SMTP DATA failed: %w", err)
	}
	if _, err := w.Write([]byte(msg)); err != nil {
		return 0, fmt.Errorf("failed to write the email body: %w", err)
	}
	if err := w.Close(); err != nil {
		return 0, fmt.Errorf("failed to submit the email: %w", err)
	}
	// A Quit failure does not change the fact that "the server has accepted the
	// email", so its error is ignored.
	_ = client.Quit()
	// Email has no length truncation (the full HTML body is sent); the whole
	// batch counts as delivered.
	return len(m.Items), nil
}

// emailDial establishes the SMTP connection.
//
// implicitTLS=true uses the port-465 style "TLS on connect"; false uses 25/587
// plaintext connect followed by STARTTLS. The two must not be mixed: sending a
// plaintext greeting to port 465 gets disconnected immediately.
//
// The session deadline is set **at connect time** (not patched on afterwards),
// because net/smtp's Client hides the underlying connection in unexported
// fields that callers cannot reach; once handed over, the preset deadline is
// the only fallback. This also covers blocking during the handshake.
// Control hooks blockInternalDial, sharing the same guard as the HTTP channels.
// Without it SMTP would be the gap in the whole SSRF defense: host set to
// 169.254.169.254 or 127.0.0.1 would connect directly, and when the
// smtp.NewClient handshake fails it wraps the peer's reply line into the error,
// which is echoed via last_error by the delivery-history API — a semi-blind
// read primitive; the timing difference between "connection refused vs timeout"
// can also be used to probe ports. The dial phase is the final enforcement
// point and also covers DNS rebinding.
func emailDial(ctx context.Context, addr, host string, implicitTLS bool) (*smtp.Client, error) {
	d := &net.Dialer{Timeout: emailDialTimeout, Control: blockInternalDial}
	var conn net.Conn
	var err error
	if implicitTLS {
		conn, err = tls.DialWithDialer(d, "tcp", addr, &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12})
	} else {
		conn, err = d.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to connect to the SMTP server: %w", err)
	}
	_ = conn.SetDeadline(time.Now().Add(emailSessionTimeout))
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("SMTP handshake failed: %w", err)
	}
	return client, nil
}

// smtpStageError classifies a stage's failure as "retryable" or "permanent" by
// the SMTP reply code.
//
// Why the distinction matters: SMTP 4xx and 5xx have completely different
// semantics —
//   - 4xx (450 greylisting, 451 local error, 452 insufficient storage) is a
//     **temporary** refusal; the proper practice is to retry later. Greylisting
//     in particular hits almost every first delivery attempt.
//   - 5xx (550 user does not exist, 553 invalid address) is a permanent
//     refusal; retrying is pointless.
//
// If everything were judged permanent, a greylisting mail server would drop
// **every** push into failed after the first attempt — exactly the scenario
// where automatic retry should shine.
// The reply code is the first three digits of the error text; when no code can
// be extracted it is treated as retryable (better one extra try than condemning
// a possibly transient failure just because it cannot be parsed).
func smtpStageError(what string, err error) error {
	code := smtpReplyCode(err.Error())
	if code >= 500 && code < 600 {
		return Permanent(fmt.Errorf("%s: %w", what, err))
	}
	return fmt.Errorf("%s: %w", what, err)
}

// smtpReplyCode extracts the leading three-digit reply code from SMTP error
// text, returning 0 when there is none. net/smtp does not export the error code
// field, so it can only be read from the text; the format is "450 4.7.1 ...".
func smtpReplyCode(text string) int {
	if len(text) < 3 {
		return 0
	}
	n, err := strconv.Atoi(text[:3])
	if err != nil {
		return 0
	}
	return n
}

// buildEmailMessage assembles the complete RFC 5322 email.
//
// The body is base64-encoded for two reasons: first, SMTP limits a single line
// to 1000 bytes, and HTML bodies (especially digest emails) easily produce
// over-long lines; second, base64 never produces a line starting with ".",
// avoiding SMTP dot-stuffing entirely.
func buildEmailMessage(from string, to []string, m Message) (string, error) {
	// From and To go into header lines: a CR or LF would start a new header.
	if hasLineBreak(from) {
		return "", errors.New("sender address must not contain line breaks")
	}
	for _, rcpt := range to {
		if hasLineBreak(rcpt) {
			return "", errors.New("recipient address must not contain line breaks")
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", strings.Join(to, ", "))
	// RFC 5322 requires Date and recommends Message-ID. Not every submission
	// server adds them, and spam filters penalize mail without them.
	fmt.Fprintf(&b, "Date: %s\r\n", time.Now().Format(time.RFC1123Z))
	fmt.Fprintf(&b, "Message-ID: <%s@%s>\r\n", rand.Text(), messageIDDomain(from))
	// A non-ASCII subject must be RFC 2047 encoded, otherwise clients display it
	// as mojibake.
	fmt.Fprintf(&b, "Subject: %s\r\n", mime.QEncoding.Encode("utf-8", htmlTitle(m)))
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n")
	// Email has no hard length limit, so the body is not truncated.
	b.WriteString("\r\n")
	encoded := base64.StdEncoding.EncodeToString([]byte(htmlBody(m, 0)))
	// base64 is wrapped at 76 characters per RFC 2045.
	for len(encoded) > 76 {
		b.WriteString(encoded[:76] + "\r\n")
		encoded = encoded[76:]
	}
	b.WriteString(encoded + "\r\n")
	return b.String(), nil
}

// senderAddress parses the configured sender with net/mail, so a display name and
// comments are accepted and the bare address is what gets used. A line break is
// refused before parsing: the value lands in header lines.
func senderAddress(from string) (*mail.Address, error) {
	if hasLineBreak(from) {
		return nil, errors.New("sender address must not contain line breaks")
	}
	addr, err := mail.ParseAddress(from)
	if err != nil {
		return nil, fmt.Errorf("invalid sender address: %w", err)
	}
	return addr, nil
}

// hasLineBreak reports whether s contains CR or LF.
func hasLineBreak(s string) bool {
	return strings.ContainsAny(s, "\r\n")
}

// messageIDDomain is the right-hand side of a Message-ID: the domain of the parsed
// sender address, or "localhost" when there is none (or the sender does not parse).
func messageIDDomain(from string) string {
	addr, err := senderAddress(from)
	if err != nil {
		return "localhost"
	}
	if i := strings.LastIndex(addr.Address, "@"); i >= 0 && i+1 < len(addr.Address) {
		return addr.Address[i+1:]
	}
	return "localhost"
}
