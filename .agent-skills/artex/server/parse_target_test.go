package server

import "testing"

func TestParseTargetURLFollowedByPunctuation(t *testing.T) {
	cases := []struct {
		text   string
		scheme string
		host   string
		port   int
	}{
		{"Assess http://juiceshop:3000, then report.", "http", "juiceshop", 3000},
		{"Assess http://juiceshop:3000.", "http", "juiceshop", 3000},
		{"Scope: http://juiceshop:3000; nothing else", "http", "juiceshop", 3000},
		{"The lab (http://juiceshop:3000) is ours", "http", "juiceshop", 3000},
		{"Test https://app.example.com:8080, only the API", "https", "app.example.com", 8080},
		{"Target is https://example.com.", "https", "example.com", 443},
		{"Start at https://example.com/login?next=/a, then pivot", "https", "example.com", 443},
		{"http://juiceshop:3000", "http", "juiceshop", 3000},
		{"Assess http://juiceshop.", "http", "juiceshop", 80},
		{"Assess http://10.0.0.5.", "http", "10.0.0.5", 80},
		{"Assess http://juiceshop:3000。", "http", "juiceshop", 3000},
		{"Assess “http://juiceshop:3000”", "http", "juiceshop", 3000},
		{"See https://en.wikipedia.org/wiki/Foo_(bar).", "https", "en.wikipedia.org", 443},
		{"(https://en.wikipedia.org/wiki/Foo_(bar))", "https", "en.wikipedia.org", 443},
		{"http://[::1]", "http", "::1", 80},
		{"http://[::1]:8080", "http", "::1", 8080},
		{"Assess http://[fd00::10].", "http", "fd00::10", 80},
		{"[http://[::1]:8080]", "http", "::1", 8080},
	}
	for _, c := range cases {
		scheme, host, port, ok := parseTarget(c.text)
		if !ok || scheme != c.scheme || host != c.host || port != c.port {
			t.Errorf("parseTarget(%q) = %q, %q, %d, %v; want %q, %q, %d, true",
				c.text, scheme, host, port, ok, c.scheme, c.host, c.port)
		}
	}
}
