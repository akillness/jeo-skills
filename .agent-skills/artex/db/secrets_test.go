package db

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var testSecretKey = []byte("0123456789abcdef0123456789abcdef")

func TestSecretBoxCrypto(t *testing.T) {
	b, _ := newSecretBox(testSecretKey)
	c1, err := b.encrypt("t.c", "hunter2")
	if err != nil {
		t.Fatal(err)
	}
	c2, _ := b.encrypt("t.c", "hunter2")
	if !isEncrypted(c1) || isEncrypted("hunter2") || c1 == c2 || strings.Contains(c1, "hunter2") {
		t.Fatalf("want distinct enc:v1: ciphertexts, got %q %q", c1, c2)
	}
	if p, err := b.decrypt("t.c", c1); err != nil || p != "hunter2" {
		t.Fatalf("round trip: %q %v", p, err)
	}
	if _, err := b.decrypt("t.other", c1); err == nil {
		t.Fatal("wrong AAD must fail")
	}
	raw, _ := base64.StdEncoding.DecodeString(strings.TrimPrefix(c1, secretPrefix))
	raw[len(raw)-1] ^= 1
	if _, err := b.decrypt("t.c", secretPrefix+base64.StdEncoding.EncodeToString(raw)); err == nil {
		t.Fatal("tampered ciphertext must fail")
	}
	if v, _ := b.encrypt("t.c", ""); v != "" {
		t.Fatal("empty must stay empty")
	}
	sealed, err := b.seal(colMCPEnv, `{"b":1, "a":"tok"}`)
	if err != nil || !isSealed(colMCPEnv, sealed) || strings.Contains(sealed, "tok") {
		t.Fatalf("not sealed: %s %v", sealed, err)
	}
	if p, err := b.open(colMCPEnv, sealed); err != nil || p != `{"a":"tok","b":1}` {
		t.Fatalf("canonical JSON round trip: %q %v", p, err)
	}
	if _, err := b.seal(colMCPEnv, `{"__artex_enc":"x"}`); err == nil {
		t.Fatal("reserved key must be refused")
	}
	if out, _ := b.seal(colMCPEnv, `{}`); out != `{}` {
		t.Fatalf("empty object must stay empty, got %s", out)
	}
}

type secretRows struct{ llm, mcp, cred, ch, task int64 }

var plainSecrets = []string{"sk-plain-llm", "mcp-plain-tok", "plain-pass", "hook-plain-secret", "llmproxy-plain-pass",
	"brave-plain", "tavily-plain", "keenable-plain", "wsproxy-plain-pass", "gproxy-plain-pass"}

// secretSettingValues are the five secret settings written by the fixture.
var secretSettingValues = map[string]string{
	"brave_search_api_key":    "brave-plain",
	"tavily_search_api_key":   "tavily-plain",
	"keenable_search_api_key": "keenable-plain",
	"web_search_proxy":        "socks5://u:wsproxy-plain-pass@ws.example:1080",
	"global_proxy":            "http://u:gproxy-plain-pass@gp.example:3128",
}

const llmProxyPlain = "http://u:llmproxy-plain-pass@llm-proxy.example:3128"

const deleteSecretSettings = `DELETE FROM settings WHERE key IN ('brave_search_api_key','tavily_search_api_key','keenable_search_api_key','web_search_proxy','global_proxy')`

// secretFixture writes one secret to each location, through the db API or, for
// a legacy database, as raw plaintext SQL.
func secretFixture(t *testing.T, d *DB, legacy bool) (r secretRows) {
	t.Helper()
	task, err := d.CreateTask("secrets at rest", "goal", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	r.task = task.ID
	t.Cleanup(func() {
		_ = d.DeleteTask(r.task)
		d.Exec(`DELETE FROM llm_profiles WHERE id=$1`, r.llm)
		d.Exec(`DELETE FROM mcp_servers WHERE id=$1`, r.mcp)
		d.Exec(`DELETE FROM notification_channels WHERE id=$1`, r.ch)
		d.Exec(deleteSecretSettings)
	})
	env, cfg := `{"Authorization":"mcp-plain-tok"}`, `{"url":"https://h.example","headers":{"X":"hook-plain-secret"}}`
	if legacy {
		ins := func(id *int64, q string, args ...any) {
			if err := d.QueryRow(q, args...).Scan(id); err != nil {
				t.Fatal(err)
			}
		}
		ins(&r.llm, `INSERT INTO llm_profiles(name,format,model,api_key,proxy) VALUES ('t-sec','openai','m','sk-plain-llm',$1) RETURNING id`, llmProxyPlain)
		for k, v := range secretSettingValues {
			if _, err := d.Exec(`INSERT INTO settings(key,value) VALUES ($1,$2)`, k, v); err != nil {
				t.Fatal(err)
			}
		}
		ins(&r.mcp, `INSERT INTO mcp_servers(name,transport,env) VALUES ('t-sec','http',$1) RETURNING id`, env)
		ins(&r.cred, `INSERT INTO task_credentials(task_id,domain,username,password) VALUES ($1,'x.example','u','plain-pass') RETURNING id`, r.task)
		ins(&r.ch, `INSERT INTO notification_channels(name,kind,config) VALUES ('t-sec','webhook',$1) RETURNING id`, cfg)
		return r
	}
	r.llm, err = d.SaveProfile(&LLMProfile{Name: "t-sec", Format: "openai", Model: "m", APIKey: "sk-plain-llm", Proxy: llmProxyPlain})
	for k, v := range secretSettingValues {
		if err == nil {
			err = d.SetSetting(k, v)
		}
	}
	if err == nil {
		r.mcp, err = d.SaveMCP(&MCPServer{Name: "t-sec", Transport: "http", Env: json.RawMessage(env)})
	}
	if err == nil {
		var c TaskCredential
		c, err = d.UpsertTaskCredential(r.task, TaskCredentialInput{Domain: "x.example", Username: "u", Password: "plain-pass"})
		r.cred = c.ID
	}
	if err == nil {
		r.ch, err = d.SaveNotificationChannel(context.Background(), &NotificationChannel{Name: "t-sec", Kind: "webhook", Config: json.RawMessage(cfg)})
	}
	if err != nil {
		t.Fatal(err)
	}
	return r
}

// rawSecrets reads the secret columns and settings as stored in PostgreSQL.
func rawSecrets(t *testing.T, d *DB, r secretRows) string {
	t.Helper()
	var a, b, c, e, px string
	if err := d.QueryRow(`SELECT (SELECT api_key FROM llm_profiles WHERE id=$1), (SELECT env::text FROM mcp_servers WHERE id=$2),
(SELECT password FROM task_credentials WHERE id=$3), (SELECT config::text FROM notification_channels WHERE id=$4),
(SELECT proxy FROM llm_profiles WHERE id=$1)`,
		r.llm, r.mcp, r.cred, r.ch).Scan(&a, &b, &c, &e, &px); err != nil {
		t.Fatal(err)
	}
	if !isEncrypted(a) || !isSealed(colMCPEnv, b) || !isEncrypted(c) || !isSealed(colNotifConfig, e) || !isEncrypted(px) {
		t.Fatal("a stored secret is not encrypted")
	}
	vals := []string{a, b, c, e, px}
	for _, k := range secretSettingKeys {
		var v string
		if err := d.QueryRow(`SELECT value FROM settings WHERE key=$1`, k).Scan(&v); err != nil || !isEncrypted(v) {
			t.Fatalf("setting %s not encrypted at rest (%v)", k, err)
		}
		vals = append(vals, v)
	}
	all := strings.Join(vals, "|")
	for _, p := range plainSecrets {
		if strings.Contains(all, p) {
			t.Fatalf("plaintext %q found at rest", p)
		}
	}
	return all
}

// assertPlainReads checks that every db read path returns the decrypted secret.
func assertPlainReads(t *testing.T, d *DB, r secretRows) {
	t.Helper()
	got := ""
	if p, err := d.ProfileByID(r.llm); err == nil && p != nil {
		got += p.APIKey + p.Proxy
	}
	if ps, err := d.ListProfiles(); err == nil {
		for _, p := range ps {
			if p.ID == r.llm && p.Proxy != llmProxyPlain {
				t.Fatalf("ListProfiles proxy %q not decrypted", p.Proxy)
			}
		}
	}
	for k, want := range secretSettingValues {
		if v, ok, err := d.GetSetting(k); err != nil || !ok || v != want {
			t.Fatalf("GetSetting(%s) = %q %v %v", k, v, ok, err)
		}
		got += want
	}
	ms, _ := d.ListMCP()
	for _, m := range ms {
		if m.ID == r.mcp {
			got += string(m.Env)
		}
	}
	if creds, err := d.TaskCredentials(r.task); err == nil && len(creds) == 1 {
		got += creds[0].Password
	}
	if ch, err := d.NotificationChannelByID(context.Background(), r.ch); err == nil {
		got += string(ch.Config)
	}
	for _, p := range plainSecrets {
		if !strings.Contains(got, p) {
			t.Fatalf("%q not read back in clear", p)
		}
	}
}

func TestSecretsAtRestWriteRead(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() }) // after the fixture cleanup
	r := secretFixture(t, d, false)
	rawSecrets(t, d, r)
	assertPlainReads(t, d, r)
	if _, err := d.SaveMCP(&MCPServer{Name: "t-sec-reserved", Transport: "http", Env: json.RawMessage(`{"__artex_enc":"x"}`)}); err == nil {
		t.Fatal("reserved key must be refused on write")
	}
}

func TestSecretsBackfillLegacyAndKeyChecks(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() }) // after the fixture cleanup
	r := secretFixture(t, d, true)
	t.Setenv(secretKeyEnv, base64.StdEncoding.EncodeToString(testSecretKey))
	if err := d.InitSecrets(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	first := rawSecrets(t, d, r)
	assertPlainReads(t, d, r)
	if err := d.InitSecrets(t.TempDir()); err != nil || rawSecrets(t, d, r) != first {
		t.Fatalf("second backfill must leave ciphertexts untouched (%v)", err)
	}

	// Encrypted data, no env key, no key file: refuse, and write no new key.
	t.Setenv(secretKeyEnv, "")
	dir := t.TempDir()
	if err := d.InitSecrets(dir); err == nil || !strings.Contains(err.Error(), "no key is available") {
		t.Fatalf("want refusal without a key, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, secretKeyFile)); !os.IsNotExist(err) {
		t.Fatal("a new key was generated over encrypted data")
	}
	t.Setenv(secretKeyEnv, hex.EncodeToString([]byte("ffffffffffffffffffffffffffffffff")))
	if err := d.InitSecrets(dir); err == nil || !strings.Contains(err.Error(), "secret key check") {
		t.Fatalf("want wrong-key refusal, got %v", err)
	}
	assertPlainReads(t, d, r) // the active key is unchanged

	// The no-key refusal counts the four encrypted settings.
	t.Setenv(secretKeyEnv, "")
	withSettings := encryptedCount(t, d, dir)
	if _, err := d.Exec(deleteSecretSettings); err != nil {
		t.Fatal(err)
	}
	if n := encryptedCount(t, d, dir); withSettings-n != len(secretSettingKeys) {
		t.Fatalf("no-key refusal counted %d then %d encrypted values; the settings must count", withSettings, n)
	}

	// A setting sealed under another key fails the startup key check.
	other, _ := newSecretBox([]byte("ffffffffffffffffffffffffffffffff"))
	v, _ := other.encrypt("settings.global_proxy", "http://other.example:3128")
	if _, err := d.Exec(`INSERT INTO settings(key,value) VALUES ('global_proxy',$1)`, v); err != nil {
		t.Fatal(err)
	}
	t.Setenv(secretKeyEnv, base64.StdEncoding.EncodeToString(testSecretKey))
	if err := d.InitSecrets(t.TempDir()); err == nil || !strings.Contains(err.Error(), "settings.global_proxy") {
		t.Fatalf("want a key-check failure on settings.global_proxy, got %v", err)
	}
	if _, err := d.Exec(deleteSecretSettings); err != nil {
		t.Fatal(err)
	}
}

// encryptedCount reads the encrypted-value count from the no-key refusal.
func encryptedCount(t *testing.T, d *DB, dir string) int {
	t.Helper()
	err := d.InitSecrets(dir)
	var n int
	if err == nil {
		t.Fatal("want a no-key refusal")
	}
	if _, serr := fmt.Sscanf(err.Error(), "the database holds %d encrypted", &n); serr != nil {
		t.Fatalf("refusal %q: %v", err, serr)
	}
	return n
}

// Secret settings: empty stays empty, InsertSettingIfAbsent encrypts, other
// settings stay in clear; an empty LLM proxy stays empty.
func TestSecretSettingsEmptyAndClear(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() {
		d.Exec(deleteSecretSettings)
		d.Exec(`DELETE FROM settings WHERE key='t_sec_clear'`)
		d.Exec(`DELETE FROM llm_profiles WHERE name='t-sec-noproxy'`)
		d.Close()
	})
	raw := func(k string) string {
		var v string
		if err := d.QueryRow(`SELECT value FROM settings WHERE key=$1`, k).Scan(&v); err != nil {
			t.Fatal(err)
		}
		return v
	}
	if err := d.SetSetting("global_proxy", ""); err != nil || raw("global_proxy") != "" {
		t.Fatalf("empty secret setting must stay empty (%v)", err)
	}
	if ok, err := d.InsertSettingIfAbsent("tavily_search_api_key", "tavily-insert"); err != nil || !ok || !isEncrypted(raw("tavily_search_api_key")) {
		t.Fatalf("InsertSettingIfAbsent must encrypt a secret setting (%v %v)", ok, err)
	}
	if v, _, err := d.GetSetting("tavily_search_api_key"); err != nil || v != "tavily-insert" {
		t.Fatalf("read back %q %v", v, err)
	}
	if err := d.SetSetting("t_sec_clear", "visible"); err != nil || raw("t_sec_clear") != "visible" {
		t.Fatalf("a non-secret setting must stay in clear (%v)", err)
	}
	id, err := d.SaveProfile(&LLMProfile{Name: "t-sec-noproxy", Format: "openai", Model: "m", APIKey: "k"})
	if err != nil {
		t.Fatal(err)
	}
	var px *string
	if err := d.QueryRow(`SELECT proxy FROM llm_profiles WHERE id=$1`, id).Scan(&px); err != nil || px != nil {
		t.Fatalf("empty proxy stored as %v (%v), want NULL", px, err)
	}
	if p, err := d.ProfileByID(id); err != nil || p.Proxy != "" {
		t.Fatalf("empty proxy read back as %q (%v)", p.Proxy, err)
	}
}
