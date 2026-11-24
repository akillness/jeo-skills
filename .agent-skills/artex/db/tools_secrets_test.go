package db

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

// toolExecPlain is a custom http tool's exec carrying a secret in every field
// the phase 3 encryption covers.
const toolExecPlain = `{"method":"GET","url":"https://api.example/x","headers":{"Authorization":"Bearer tool-hdr-plain"},` +
	`"body":"tool-body-plain","proxy":"http://u:tool-proxy-plain@p.example:3128"}`

var toolPlainSecrets = []string{"tool-hdr-plain", "tool-body-plain", "tool-proxy-plain", "tool-cmd-plain"}

func rawToolExec(t *testing.T, d *DB, key string) string {
	t.Helper()
	var v string
	if err := d.QueryRow(`SELECT exec::text FROM tools WHERE key=$1`, key).Scan(&v); err != nil {
		t.Fatal(err)
	}
	return v
}

// assertToolExecSealed checks a custom tool's exec is sealed at rest and read
// back in clear, equal to want, by every db getter.
func assertToolExecSealed(t *testing.T, d *DB, key, want string) {
	t.Helper()
	raw := rawToolExec(t, d, key)
	if !isSealed(colToolExec, raw) {
		t.Fatalf("tools.exec of %s not sealed at rest: %s", key, raw)
	}
	for _, p := range toolPlainSecrets {
		if strings.Contains(raw, p) {
			t.Fatalf("plaintext %q found at rest", p)
		}
	}
	var got []json.RawMessage
	if tl, err := d.GetTool(key); err != nil || tl == nil {
		t.Fatalf("GetTool: %v", err)
	} else {
		got = append(got, tl.Exec)
	}
	for _, list := range []func() ([]*Tool, error){d.ListTools, d.ListCustomTools} {
		ts, err := list()
		if err != nil {
			t.Fatal(err)
		}
		for _, tl := range ts {
			if tl.Key == key {
				got = append(got, tl.Exec)
			}
		}
	}
	if len(got) != 3 {
		t.Fatalf("tool %s read by %d getters, want 3", key, len(got))
	}
	for _, g := range got {
		if !jsonEqual(t, string(g), want) {
			t.Fatalf("exec read back as %s, want %s", g, want)
		}
	}
}

func jsonEqual(t *testing.T, a, b string) bool {
	t.Helper()
	var x, y any
	if json.Unmarshal([]byte(a), &x) != nil || json.Unmarshal([]byte(b), &y) != nil {
		return false
	}
	ca, _ := json.Marshal(x)
	cb, _ := json.Marshal(y)
	return string(ca) == string(cb)
}

func TestToolExecSealedAtRest(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() {
		d.Exec(`DELETE FROM tools WHERE key LIKE 't_secexec%'`)
		d.Close()
	})
	if err := d.CreateCustomTool(&Tool{Key: "t_secexec", Kind: "http", Exec: json.RawMessage(toolExecPlain), Enabled: true}); err != nil {
		t.Fatal(err)
	}
	assertToolExecSealed(t, d, "t_secexec", toolExecPlain)
	first := rawToolExec(t, d, "t_secexec")

	cmd := `{"command":"curl -H 'X-Key: tool-cmd-plain' {args}","timeout_ms":5000}`
	if err := d.UpdateCustomTool(&Tool{Key: "t_secexec", Kind: "command", Exec: json.RawMessage(cmd), Enabled: true}); err != nil {
		t.Fatal(err)
	}
	assertToolExecSealed(t, d, "t_secexec", cmd)
	if err := d.UpdateCustomTool(&Tool{Key: "t_secexec", Kind: "http", Exec: json.RawMessage(toolExecPlain), Enabled: true}); err != nil {
		t.Fatal(err)
	}
	if rawToolExec(t, d, "t_secexec") == first {
		t.Fatal("the same exec must seal under a fresh nonce")
	}

	// A shell tool has no exec: {} stays {}.
	if err := d.CreateCustomTool(&Tool{Key: "t_secexec_shell", Kind: "shell", Enabled: true}); err != nil {
		t.Fatal(err)
	}
	if raw := rawToolExec(t, d, "t_secexec_shell"); raw != "{}" {
		t.Fatalf("empty exec stored as %s, want {}", raw)
	}
	if err := d.CreateCustomTool(&Tool{Key: "t_secexec_resv", Kind: "command", Exec: json.RawMessage(`{"__artex_enc":"x"}`)}); err == nil {
		t.Fatal("reserved key must be refused on write")
	}

	// A value sealed under another key fails the read (fail closed).
	other, _ := newSecretBox([]byte("ffffffffffffffffffffffffffffffff"))
	foreign, _ := other.seal(colToolExec, toolExecPlain)
	if _, err := d.Exec(`UPDATE tools SET exec=$1::jsonb WHERE key='t_secexec'`, foreign); err != nil {
		t.Fatal(err)
	}
	if _, err := d.GetTool("t_secexec"); err == nil || !strings.Contains(err.Error(), "tools.exec") {
		t.Fatalf("a foreign ciphertext must fail the read, got %v", err)
	}
	if _, err := d.ListCustomTools(); err == nil {
		t.Fatal("ListCustomTools must fail on a foreign ciphertext")
	}
}

func TestToolExecBackfillAndKeyChecks(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() {
		d.Exec(`DELETE FROM tools WHERE key LIKE 't_secexec%'`)
		d.Close()
	})
	sysExec := `{"command":"echo system-plain"}`
	for _, q := range []struct {
		key, exec string
		system    bool
	}{{"t_secexec_legacy", toolExecPlain, false}, {"t_secexec_sys", sysExec, true}, {"t_secexec_empty", `{}`, false}} {
		if _, err := d.Exec(`INSERT INTO tools(key, system, kind, exec) VALUES ($1, $2, 'http', $3::jsonb)`, q.key, q.system, q.exec); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv(secretKeyEnv, base64.StdEncoding.EncodeToString(testSecretKey))
	if err := d.InitSecrets(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	assertToolExecSealed(t, d, "t_secexec_legacy", toolExecPlain)
	first := rawToolExec(t, d, "t_secexec_legacy")
	if raw := rawToolExec(t, d, "t_secexec_sys"); !jsonEqual(t, raw, sysExec) {
		t.Fatalf("a system tool's exec must stay in clear, got %s", raw)
	}
	if raw := rawToolExec(t, d, "t_secexec_empty"); raw != "{}" {
		t.Fatalf("an empty exec must stay {}, got %s", raw)
	}
	if err := d.InitSecrets(t.TempDir()); err != nil || rawToolExec(t, d, "t_secexec_legacy") != first {
		t.Fatalf("second backfill must leave the ciphertext untouched (%v)", err)
	}

	// Missing key: the sealed exec counts in the refusal.
	t.Setenv(secretKeyEnv, "")
	dir := t.TempDir()
	withTool := encryptedCount(t, d, dir)
	if _, err := d.Exec(`UPDATE tools SET exec='{}'::jsonb WHERE key='t_secexec_legacy'`); err != nil {
		t.Fatal(err)
	}
	if n := encryptedCount(t, d, dir); withTool-n != 1 {
		t.Fatalf("no-key refusal counted %d then %d encrypted values; tools.exec must count", withTool, n)
	}

	// Wrong key: an exec sealed under another key fails the startup key check.
	other, _ := newSecretBox([]byte("ffffffffffffffffffffffffffffffff"))
	foreign, _ := other.seal(colToolExec, toolExecPlain)
	if _, err := d.Exec(`UPDATE tools SET exec=$1::jsonb WHERE key='t_secexec_legacy'`, foreign); err != nil {
		t.Fatal(err)
	}
	t.Setenv(secretKeyEnv, base64.StdEncoding.EncodeToString(testSecretKey))
	if err := d.InitSecrets(t.TempDir()); err == nil || !strings.Contains(err.Error(), "tools.exec") {
		t.Fatalf("want a key-check failure on tools.exec, got %v", err)
	}
}
