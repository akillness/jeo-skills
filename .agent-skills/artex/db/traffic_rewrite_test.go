package db

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
)

const (
	rewriteMatchersPlain = `{"host":"api.example","headers":[{"name":"X-Env","value_regex":"rw-matcher-plain"}]}`
	rewriteActionsPlain  = `[{"type":"set_header","name":"Authorization","value":"Bearer rw-action-plain","sensitive":true}]`
)

var rewritePlainSecrets = []string{"rw-matcher-plain", "rw-action-plain"}

// openRewriteRules opens the test database and removes the rules of this file
// before and after the test. It skips when the table holds other rules: the
// limit tests count rows.
func openRewriteRules(t *testing.T) *DB {
	t.Helper()
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	clean := func() { d.Exec(`DELETE FROM traffic_rewrite_rules WHERE name LIKE 't-rw-%'`) }
	clean()
	t.Cleanup(func() { clean(); d.Close() })
	var others int
	if err := d.QueryRow(`SELECT count(*) FROM traffic_rewrite_rules`).Scan(&others); err != nil {
		t.Fatal(err)
	}
	if others > 0 {
		t.Skipf("traffic_rewrite_rules holds %d rule(s) that are not test fixtures — skipping", others)
	}
	return d
}

func rewriteRule(name string, enabled bool) TrafficRewriteRule {
	return TrafficRewriteRule{Name: name, Enabled: enabled, Phase: "request", Matchers: json.RawMessage(`{}`),
		Actions: json.RawMessage(`[{"type":"delete_header","name":"X-A"}]`)}
}

func rawRewriteRule(t *testing.T, d *DB, id int64) (matchers, actions string) {
	t.Helper()
	if err := d.QueryRow(`SELECT matchers::text, actions::text FROM traffic_rewrite_rules WHERE id=$1`, id).Scan(&matchers, &actions); err != nil {
		t.Fatal(err)
	}
	return matchers, actions
}

// assertRewriteRuleSealed checks both columns are sealed at rest and read back
// in clear by every getter.
func assertRewriteRuleSealed(t *testing.T, d *DB, id int64) {
	t.Helper()
	matchers, actions := rawRewriteRule(t, d, id)
	if !isSealed(colRewriteMatchers, matchers) || !isSealed(colRewriteActions, actions) {
		t.Fatalf("rule %d not sealed at rest: %s %s", id, matchers, actions)
	}
	for _, p := range rewritePlainSecrets {
		if strings.Contains(matchers+actions, p) {
			t.Fatalf("plaintext %q found at rest", p)
		}
	}
	got, err := d.GetTrafficRewriteRule(id)
	if err != nil {
		t.Fatal(err)
	}
	list, err := d.ListTrafficRewriteRules()
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range append(list, got) {
		if r.ID == id && (!jsonEqual(t, string(r.Matchers), rewriteMatchersPlain) || !jsonEqual(t, string(r.Actions), rewriteActionsPlain)) {
			t.Fatalf("rule %d read back as %s %s", id, r.Matchers, r.Actions)
		}
	}
}

func TestTrafficRewriteRuleCRUDSealed(t *testing.T) {
	d := openRewriteRules(t)
	in := TrafficRewriteRule{Name: "t-rw-crud", Phase: "response", Priority: 7, Note: "n",
		Matchers: json.RawMessage(rewriteMatchersPlain), Actions: json.RawMessage(rewriteActionsPlain)}
	r, err := d.CreateTrafficRewriteRule(in)
	if err != nil {
		t.Fatal(err)
	}
	if r.ID == 0 || r.Enabled || r.Name != in.Name || r.Phase != "response" || r.Priority != 7 || r.Note != "n" || r.CreatedAt.IsZero() {
		t.Fatalf("created rule = %+v", r)
	}
	assertRewriteRuleSealed(t, d, r.ID)
	firstMatchers, firstActions := rawRewriteRule(t, d, r.ID)

	// An empty matcher object has nothing to hide and stays in clear.
	empty, err := d.CreateTrafficRewriteRule(rewriteRule("t-rw-empty", false))
	if err != nil {
		t.Fatal(err)
	}
	if m, a := rawRewriteRule(t, d, empty.ID); m != "{}" || !isSealed(colRewriteActions, a) {
		t.Fatalf("empty matchers stored as %s, actions %s", m, a)
	}

	// Update: edit sees the stored rule in clear and can keep its values.
	updated, err := d.UpdateTrafficRewriteRule(r.ID, func(stored TrafficRewriteRule) (TrafficRewriteRule, error) {
		if !jsonEqual(t, string(stored.Actions), rewriteActionsPlain) {
			t.Errorf("edit got actions %s", stored.Actions)
		}
		stored.Name, stored.Priority, stored.Note, stored.Enabled = "t-rw-crud2", -1, "", true
		return stored, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != "t-rw-crud2" || updated.Priority != -1 || updated.Note != "" || !updated.Enabled || !updated.UpdatedAt.After(r.UpdatedAt) {
		t.Fatalf("updated rule = %+v", updated)
	}
	assertRewriteRuleSealed(t, d, r.ID)
	if m, a := rawRewriteRule(t, d, r.ID); m == firstMatchers || a == firstActions {
		t.Fatal("the same content must seal under a fresh nonce")
	}

	// A failing edit changes nothing and its error comes back as is.
	errEdit := errors.New("refused")
	if _, err := d.UpdateTrafficRewriteRule(r.ID, func(s TrafficRewriteRule) (TrafficRewriteRule, error) {
		s.Name = "t-rw-never"
		return s, errEdit
	}); err != errEdit {
		t.Fatalf("edit error = %v", err)
	}
	if got, _ := d.GetTrafficRewriteRule(r.ID); got.Name != "t-rw-crud2" {
		t.Fatalf("a refused update renamed the rule to %q", got.Name)
	}

	// Execution order: priority, then id.
	list, err := d.ListTrafficRewriteRules()
	if err != nil || len(list) != 2 || list[0].ID != r.ID || list[1].ID != empty.ID {
		t.Fatalf("list = %+v (%v)", list, err)
	}

	if err := d.ToggleTrafficRewriteRule(r.ID, false); err != nil {
		t.Fatal(err)
	}
	if got, _ := d.GetTrafficRewriteRule(r.ID); got.Enabled {
		t.Fatal("toggle off did not stick")
	}
	assertRewriteRuleSealed(t, d, r.ID)

	// A value sealed under another key fails the read (fail closed).
	other, _ := newSecretBox([]byte("ffffffffffffffffffffffffffffffff"))
	foreign, _ := other.seal(colRewriteActions, rewriteActionsPlain)
	if _, err := d.Exec(`UPDATE traffic_rewrite_rules SET actions=$1::jsonb WHERE id=$2`, foreign, empty.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := d.GetTrafficRewriteRule(empty.ID); err == nil || !strings.Contains(err.Error(), "traffic_rewrite_rules.actions") {
		t.Fatalf("a foreign ciphertext must fail the read, got %v", err)
	}
	if _, err := d.ListTrafficRewriteRules(); err == nil {
		t.Fatal("ListTrafficRewriteRules must fail on a foreign ciphertext")
	}

	for _, id := range []int64{r.ID, empty.ID} {
		if err := d.DeleteTrafficRewriteRule(id); err != nil {
			t.Fatal(err)
		}
	}
	// A missing rule is sql.ErrNoRows on every path.
	_, getErr := d.GetTrafficRewriteRule(r.ID)
	_, updErr := d.UpdateTrafficRewriteRule(r.ID, func(s TrafficRewriteRule) (TrafficRewriteRule, error) { return s, nil })
	for name, err := range map[string]error{"get": getErr, "update": updErr,
		"toggle": d.ToggleTrafficRewriteRule(r.ID, true), "delete": d.DeleteTrafficRewriteRule(r.ID)} {
		if !errors.Is(err, sql.ErrNoRows) {
			t.Errorf("%s of a missing rule: %v, want sql.ErrNoRows", name, err)
		}
	}
	if _, err := d.CreateTrafficRewriteRule(TrafficRewriteRule{Name: "t-rw-bad", Phase: "both", Matchers: json.RawMessage(`{}`), Actions: json.RawMessage(`[]`)}); err == nil {
		t.Fatal("the phase check constraint must refuse an unknown phase")
	}
}

// 100 rules at most, 50 of them enabled, on every write path.
func TestTrafficRewriteRuleLimits(t *testing.T) {
	d := openRewriteRules(t)
	var enabled, disabled []int64
	for i := 0; i < MaxTrafficRewriteRules; i++ {
		on := i < MaxEnabledTrafficRewriteRules
		r, err := d.CreateTrafficRewriteRule(rewriteRule(fmt.Sprintf("t-rw-limit-%03d", i), on))
		if err != nil {
			t.Fatalf("rule %d: %v", i, err)
		}
		if on {
			enabled = append(enabled, r.ID)
		} else {
			disabled = append(disabled, r.ID)
		}
	}
	enable := func(s TrafficRewriteRule) (TrafficRewriteRule, error) { s.Enabled = true; return s, nil }

	if _, err := d.CreateTrafficRewriteRule(rewriteRule("t-rw-limit-over", false)); err != ErrTrafficRewriteRuleLimit {
		t.Fatalf("101st rule: %v", err)
	}
	if err := d.ToggleTrafficRewriteRule(disabled[0], true); err != ErrTrafficRewriteEnabledLimit {
		t.Fatalf("51st enabled rule by toggle: %v", err)
	}
	if _, err := d.UpdateTrafficRewriteRule(disabled[0], enable); err != ErrTrafficRewriteEnabledLimit {
		t.Fatalf("51st enabled rule by update: %v", err)
	}
	// At the limit an enabled rule can still be saved, and toggled on again.
	if _, err := d.UpdateTrafficRewriteRule(enabled[0], enable); err != nil {
		t.Fatalf("update of an enabled rule at the limit: %v", err)
	}
	if err := d.ToggleTrafficRewriteRule(enabled[0], true); err != nil {
		t.Fatalf("toggle of an enabled rule at the limit: %v", err)
	}
	// Room for one rule, none for an enabled one.
	if err := d.DeleteTrafficRewriteRule(disabled[1]); err != nil {
		t.Fatal(err)
	}
	if _, err := d.CreateTrafficRewriteRule(rewriteRule("t-rw-limit-on", true)); err != ErrTrafficRewriteEnabledLimit {
		t.Fatalf("51st enabled rule by create: %v", err)
	}
	// Disabling one frees a slot.
	if err := d.ToggleTrafficRewriteRule(enabled[1], false); err != nil {
		t.Fatal(err)
	}
	if err := d.ToggleTrafficRewriteRule(disabled[0], true); err != nil {
		t.Fatalf("enable after a slot was freed: %v", err)
	}
	var total, on int
	if err := d.QueryRow(`SELECT count(*), count(*) FILTER (WHERE enabled) FROM traffic_rewrite_rules`).Scan(&total, &on); err != nil {
		t.Fatal(err)
	}
	if total != MaxTrafficRewriteRules-1 || on != MaxEnabledTrafficRewriteRules {
		t.Fatalf("table holds %d rules, %d enabled", total, on)
	}
}

// A database that holds plaintext rules is sealed at startup, and a key other
// than the one that sealed the rules is refused at startup.
func TestTrafficRewriteRuleBackfillAndKeyChecks(t *testing.T) {
	d := openRewriteRules(t)
	var legacy, clear int64
	ins := `INSERT INTO traffic_rewrite_rules(name, phase, matchers, actions) VALUES ($1, 'request', $2::jsonb, $3::jsonb) RETURNING id`
	if err := d.QueryRow(ins, "t-rw-legacy", rewriteMatchersPlain, rewriteActionsPlain).Scan(&legacy); err != nil {
		t.Fatal(err)
	}
	if err := d.QueryRow(ins, "t-rw-legacy-empty", `{}`, rewriteActionsPlain).Scan(&clear); err != nil {
		t.Fatal(err)
	}
	t.Setenv(secretKeyEnv, base64.StdEncoding.EncodeToString(testSecretKey))
	if err := d.InitSecrets(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	assertRewriteRuleSealed(t, d, legacy)
	if m, a := rawRewriteRule(t, d, clear); m != "{}" || !isSealed(colRewriteActions, a) {
		t.Fatalf("empty matchers must stay {}, got %s; actions %s", m, a)
	}
	firstMatchers, firstActions := rawRewriteRule(t, d, legacy)
	if err := d.InitSecrets(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	if m, a := rawRewriteRule(t, d, legacy); m != firstMatchers || a != firstActions {
		t.Fatal("second backfill must leave the ciphertexts untouched")
	}

	// The trace sub-key is derived from the secret key, per domain.
	sub := TrafficTraceKey()
	if len(sub) != 32 || bytes.Equal(sub, testSecretKey) || !bytes.Equal(sub, deriveSubKey(testSecretKey, trafficTraceDomain)) ||
		bytes.Equal(sub, deriveSubKey(testSecretKey, "another-domain")) {
		t.Fatalf("trace sub-key = %x", sub)
	}

	// Missing key: the sealed rule columns count in the refusal.
	t.Setenv(secretKeyEnv, "")
	dir := t.TempDir()
	withRules := encryptedCount(t, d, dir)
	if err := d.DeleteTrafficRewriteRule(clear); err != nil {
		t.Fatal(err)
	}
	if n := encryptedCount(t, d, dir); withRules-n != 1 {
		t.Fatalf("no-key refusal counted %d then %d encrypted values; the rule columns must count", withRules, n)
	}

	// Wrong key at startup: refused, and the active key is unchanged.
	t.Setenv(secretKeyEnv, hex.EncodeToString([]byte("ffffffffffffffffffffffffffffffff")))
	if err := d.InitSecrets(dir); err == nil || !strings.Contains(err.Error(), "secret key check") {
		t.Fatalf("want wrong-key refusal, got %v", err)
	}
	assertRewriteRuleSealed(t, d, legacy)

	// A column sealed under another key fails the startup check and names the
	// column. The check samples one sealed row per column: this is the only one.
	other, _ := newSecretBox([]byte("ffffffffffffffffffffffffffffffff"))
	t.Setenv(secretKeyEnv, base64.StdEncoding.EncodeToString(testSecretKey))
	for _, c := range []struct {
		col   secretColumn
		plain string
		keep  string
	}{{colRewriteMatchers, rewriteMatchersPlain, firstMatchers}, {colRewriteActions, rewriteActionsPlain, firstActions}} {
		foreign, _ := other.seal(c.col, c.plain)
		if _, err := d.Exec(`UPDATE traffic_rewrite_rules SET `+c.col.col+`=$1::jsonb WHERE id=$2`, foreign, legacy); err != nil {
			t.Fatal(err)
		}
		if err := d.InitSecrets(t.TempDir()); err == nil || !strings.Contains(err.Error(), "secret key check") || !strings.Contains(err.Error(), c.col.aad()) {
			t.Fatalf("want a key-check failure naming %s, got %v", c.col.aad(), err)
		}
		if _, err := d.Exec(`UPDATE traffic_rewrite_rules SET `+c.col.col+`=$1::jsonb WHERE id=$2`, c.keep, legacy); err != nil {
			t.Fatal(err)
		}
	}
	if err := d.InitSecrets(t.TempDir()); err != nil {
		t.Fatal(err)
	}
}
