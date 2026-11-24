package config

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadTaskUserAgents(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	t.Setenv("ARTEX_CONFIG", path)
	cfg, err := Load()
	if err != nil || len(cfg.TaskUserAgents) != 0 {
		t.Fatalf("missing file: config = %+v, error = %v", cfg, err)
	}

	const maxReference = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz._"
	body := `{"task_user_agents":{
		"42":{"reference":"FS-17","origins":["https://SHOP.example.test:443/","http://[2001:db8::1]:8080"]},
		"43":{"reference":"","origins":["https://shop.example.test"]},
		"44":{"reference":"` + maxReference + `","origins":["https://shop.example.test"]},
		"45":{"origins":["https://shop.example.test"]}
	}}`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err = Load()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ taskID, want string }{
		{"42", "ARTEX-Assessment/1.0 (engagement=FS-17)"},
		{"43", "ARTEX-Assessment/1.0"},
		{"44", "ARTEX-Assessment/1.0 (engagement=" + maxReference + ")"},
		{"45", "ARTEX-Assessment/1.0"},
		{"46", ""},
		{"", ""},
	} {
		identity := cfg.TaskUserAgents[tc.taskID]
		if got := identity.UserAgent(); got != tc.want {
			t.Errorf("task %q: User-Agent = %q, want %q", tc.taskID, got, tc.want)
		}
	}
	identity := cfg.TaskUserAgents["42"]
	for _, tc := range []struct {
		rawURL string
		want   bool
	}{
		{"https://shop.example.test/order?status=ok", true},
		{"http://[2001:0db8::1]:8080/order", true},
		{"http://shop.example.test/order", false},
		{"https://shop.example.test:8443/order", false},
		{"https://shop.example.test.evil.test/order", false},
		{"https://SHOP.example.test./order", false},
	} {
		u, err := url.Parse(tc.rawURL)
		if err != nil {
			t.Fatal(err)
		}
		if got := identity.AllowsOrigin(u); got != tc.want {
			t.Errorf("allows %q = %v, want %v", tc.rawURL, got, tc.want)
		}
	}
}

func TestLoadRejectsInvalidTaskUserAgents(t *testing.T) {
	for _, tc := range []struct {
		name, entries string
	}{
		{"empty task ID", `{"":{"origins":["https://test.example"]}}`},
		{"noncanonical task ID", `{"042":{"origins":["https://test.example"]}}`},
		{"zero task ID", `{"0":{"origins":["https://test.example"]}}`},
		{"non-task key", `{"*":{"origins":["https://test.example"]}}`},
		{"invalid shape", `["FS-17"]`},
		{"shorthand without origin", `{"42":"FS-17"}`},
		{"null identity", `{"42":null}`},
		{"null reference", `{"42":{"reference":null,"origins":["https://test.example"]}}`},
		{"embedded line breaks", `{"42":{"reference":"FS-17\r\nX-Other: value","origins":["https://test.example"]}}`},
		{"comment delimiters", `{"42":{"reference":"FS-(17)","origins":["https://test.example"]}}`},
		{"non-ASCII label", `{"42":{"reference":"équipe","origins":["https://test.example"]}}`},
		{"oversize label", `{"42":{"reference":"` + strings.Repeat("A", 65) + `","origins":["https://test.example"]}}`},
		{"missing origins", `{"42":{"reference":"FS-17"}}`},
		{"empty origins", `{"42":{"origins":[]}}`},
		{"null origin", `{"42":{"origins":[null]}}`},
		{"origin credentials", `{"42":{"origins":["https://user:testpass@test.example"]}}`},
		{"origin path", `{"42":{"origins":["https://test.example/path"]}}`},
		{"origin query", `{"42":{"origins":["https://test.example?"]}}`},
		{"origin fragment", `{"42":{"origins":["https://test.example#part"]}}`},
		{"Unicode origin", `{"42":{"origins":["https://K.example.test"]}}`},
		{"origin with ambiguous port", `{"42":{"origins":["https://test.example:0443"]}}`},
		{"invalid entry alongside valid entry", `{"42":{"origins":["https://test.example"]},"43":{"origins":["ftp://test.example"]}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "config.json")
			if err := os.WriteFile(path, []byte(`{"task_user_agents":`+tc.entries+`}`), 0o600); err != nil {
				t.Fatal(err)
			}
			t.Setenv("ARTEX_CONFIG", path)
			if _, err := Load(); err == nil || !strings.Contains(err.Error(), "task_user_agents") {
				t.Fatalf("Load() error = %v, want task_user_agents validation error", err)
			}
		})
	}
}

func TestLoadRejectsOldTaskUserAgentsKey(t *testing.T) {
	for _, body := range []string{
		`{"assessment_identification":{"42":{"origins":["https://test.example"]}}}`,
		`{"assessment_identification":null}`,
		`{"assessment_identification":{},"task_user_agents":{"42":{"origins":["https://test.example"]}}}`,
	} {
		path := filepath.Join(t.TempDir(), "config.json")
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		t.Setenv("ARTEX_CONFIG", path)
		if _, err := Load(); err == nil || !strings.Contains(err.Error(), "assessment_identification was replaced by task_user_agents") {
			t.Fatalf("Load() error = %v, want task_user_agents migration hint", err)
		}
	}
}
