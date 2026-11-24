package db

import (
	"encoding/json"
	"slices"
	"testing"
)

func TestRewriteStockNpxBrowserMCP(t *testing.T) {
	cases := []struct {
		name        string
		command     string
		args        []string
		wantOK      bool
		wantCommand string
		wantArgs    []string
	}{
		{
			name:        "stock seed",
			command:     "npx",
			args:        []string{"@playwright/mcp", "--headless"},
			wantOK:      true,
			wantCommand: "playwright-mcp",
			wantArgs:    []string{"--headless", "--browser", "chromium"},
		},
		{
			name:        "package only",
			command:     "npx",
			args:        []string{"@playwright/mcp"},
			wantOK:      true,
			wantCommand: "playwright-mcp",
			wantArgs:    []string{"--headless", "--browser", "chromium"},
		},
		{
			name:        "pinned package version",
			command:     "npx",
			args:        []string{"@playwright/mcp@0.0.83", "--headless"},
			wantOK:      true,
			wantCommand: "playwright-mcp",
			wantArgs:    []string{"--headless", "--browser", "chromium"},
		},
		{
			name:        "capture proxy args kept",
			command:     "npx",
			args:        []string{"@playwright/mcp", "--headless", "--proxy-server", "http://127.0.0.1:8788"},
			wantOK:      true,
			wantCommand: "playwright-mcp",
			wantArgs:    []string{"--headless", "--proxy-server", "http://127.0.0.1:8788", "--browser", "chromium"},
		},
		{
			name:        "existing --browser kept",
			command:     "npx",
			args:        []string{"@playwright/mcp", "--headless", "--browser", "firefox"},
			wantOK:      true,
			wantCommand: "playwright-mcp",
			wantArgs:    []string{"--headless", "--browser", "firefox"},
		},
		{
			name:        "equals-form --browser kept",
			command:     "npx",
			args:        []string{"@playwright/mcp", "--browser=chrome"},
			wantOK:      true,
			wantCommand: "playwright-mcp",
			wantArgs:    []string{"--browser=chrome", "--headless"},
		},
		{
			name:        "npx -y",
			command:     "npx",
			args:        []string{"-y", "@playwright/mcp", "--headless"},
			wantOK:      true,
			wantCommand: "playwright-mcp",
			wantArgs:    []string{"--headless", "--browser", "chromium"},
		},
		{
			name:        "npx --yes -- separator",
			command:     "npx",
			args:        []string{"--yes", "--", "@playwright/mcp"},
			wantOK:      true,
			wantCommand: "playwright-mcp",
			wantArgs:    []string{"--headless", "--browser", "chromium"},
		},
		{
			name:    "already playwright-mcp",
			command: "playwright-mcp",
			args:    []string{"--headless"},
		},
		{
			name:    "npx -p is a custom invocation",
			command: "npx",
			args:    []string{"-p", "@playwright/mcp", "playwright-mcp", "--headless"},
		},
		{
			name:    "different package",
			command: "npx",
			args:    []string{"@modelcontextprotocol/server-github"},
		},
		{
			name:    "empty args",
			command: "npx",
		},
		{
			name: "empty command",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotCommand, gotArgs, ok := rewriteStockNpxBrowserMCP(tc.command, tc.args)
			if ok != tc.wantOK {
				t.Fatalf("ok=%v, want %v", ok, tc.wantOK)
			}
			if !tc.wantOK {
				if gotCommand != tc.command || !slices.Equal(gotArgs, tc.args) {
					t.Fatalf("unchanged: got %q %q", gotCommand, gotArgs)
				}
				return
			}
			if gotCommand != tc.wantCommand {
				t.Fatalf("command=%q, want %q", gotCommand, tc.wantCommand)
			}
			if !slices.Equal(gotArgs, tc.wantArgs) {
				t.Fatalf("args=%q, want %q", gotArgs, tc.wantArgs)
			}
		})
	}
}

func TestRewriteBrowserMCPRow(t *testing.T) {
	cmd, args, ok := rewriteBrowserMCPRow("playwright-mcp", []string{"--headless"})
	if !ok || cmd != browserMCPCommand || !slices.Equal(args, []string{"--headless", "--browser", "chromium"}) {
		t.Fatalf("missing --browser: ok=%v %q %q", ok, cmd, args)
	}

	cmd, args, ok = rewriteBrowserMCPRow("playwright-mcp", []string{"--headless", "--browser", "firefox"})
	if ok {
		t.Fatalf("existing --browser rewritten: %q %q", cmd, args)
	}

	cmd, args, ok = rewriteBrowserMCPRow("npx", []string{"-y", "@playwright/mcp", "--headless"})
	if !ok || cmd != browserMCPCommand || !slices.Equal(args, []string{"--headless", "--browser", "chromium"}) {
		t.Fatalf("npx -y: ok=%v %q %q", ok, cmd, args)
	}

	in := []string{"--headless"}
	orig := slices.Clone(in)
	_, out, ok := rewriteBrowserMCPRow("playwright-mcp", in)
	if !ok {
		t.Fatal("expected rewrite")
	}
	out[0] = "mutated"
	if !slices.Equal(in, orig) {
		t.Fatalf("input mutated: %q", in)
	}
}

func TestRewriteStockNpxBrowserMCPDoesNotAliasInput(t *testing.T) {
	in := []string{"@playwright/mcp", "--headless"}
	orig := slices.Clone(in)
	_, out, ok := rewriteStockNpxBrowserMCP("npx", in)
	if !ok {
		t.Fatal("expected rewrite")
	}
	out[0] = "mutated"
	if !slices.Equal(in, orig) {
		t.Fatalf("input mutated: %q", in)
	}
}

func TestSeedAndMigrateBrowserMCP(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}

	origCmd, _, origRaw := readBrowserMCP(t, d)
	origSetting, origHad, err := d.GetSetting(browserMCPDirectBinSetting)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, err := d.Exec(`UPDATE mcp_servers SET command=$1, args=$2 WHERE name=$3`, origCmd, origRaw, browserMCPName)
		cleanupErr(t, "restore browser mcp", err)
		if origHad {
			cleanupErr(t, "restore setting", d.SetSetting(browserMCPDirectBinSetting, origSetting))
		} else {
			cleanupExec(t, d, `DELETE FROM settings WHERE key=$1`, browserMCPDirectBinSetting)
		}
		d.Close()
	})

	t.Run("stock npx rewritten once", func(t *testing.T) {
		putBrowserMCP(t, d, "npx", []string{"@playwright/mcp", "--headless"})
		cleanupExec(t, d, `DELETE FROM settings WHERE key=$1`, browserMCPDirectBinSetting)
		if err := d.seedBuiltins(); err != nil {
			t.Fatal(err)
		}
		cmd, args, _ := readBrowserMCP(t, d)
		if cmd != browserMCPCommand || !slices.Equal(args, []string{"--headless", "--browser", "chromium"}) {
			t.Fatalf("got %q %q", cmd, args)
		}
		putBrowserMCP(t, d, "npx", []string{"@playwright/mcp", "--headless"})
		if err := d.seedBuiltins(); err != nil {
			t.Fatal(err)
		}
		cmd, args, _ = readBrowserMCP(t, d)
		if cmd != "npx" || !slices.Equal(args, []string{"@playwright/mcp", "--headless"}) {
			t.Fatalf("second pass clobbered: %q %q", cmd, args)
		}
	})

	t.Run("npx -y rewritten", func(t *testing.T) {
		putBrowserMCP(t, d, "npx", []string{"-y", "@playwright/mcp", "--headless"})
		cleanupExec(t, d, `DELETE FROM settings WHERE key=$1`, browserMCPDirectBinSetting)
		if err := d.seedBuiltins(); err != nil {
			t.Fatal(err)
		}
		cmd, args, _ := readBrowserMCP(t, d)
		if cmd != browserMCPCommand || !slices.Equal(args, []string{"--headless", "--browser", "chromium"}) {
			t.Fatalf("got %q %q", cmd, args)
		}
	})

	t.Run("playwright-mcp missing --browser", func(t *testing.T) {
		putBrowserMCP(t, d, "playwright-mcp", []string{"--headless"})
		cleanupExec(t, d, `DELETE FROM settings WHERE key=$1`, browserMCPDirectBinSetting)
		if err := d.seedBuiltins(); err != nil {
			t.Fatal(err)
		}
		cmd, args, _ := readBrowserMCP(t, d)
		if cmd != browserMCPCommand || !slices.Equal(args, []string{"--headless", "--browser", "chromium"}) {
			t.Fatalf("got %q %q", cmd, args)
		}
	})

	t.Run("custom package left alone", func(t *testing.T) {
		custom := []string{"@modelcontextprotocol/server-github"}
		putBrowserMCP(t, d, "npx", custom)
		cleanupExec(t, d, `DELETE FROM settings WHERE key=$1`, browserMCPDirectBinSetting)
		if err := d.seedBuiltins(); err != nil {
			t.Fatal(err)
		}
		cmd, args, _ := readBrowserMCP(t, d)
		if cmd != "npx" || !slices.Equal(args, custom) {
			t.Fatalf("custom row rewritten: %q %q", cmd, args)
		}
	})

	t.Run("proxy args preserved", func(t *testing.T) {
		putBrowserMCP(t, d, "npx", []string{"@playwright/mcp", "--headless", "--proxy-server", "http://127.0.0.1:8788"})
		cleanupExec(t, d, `DELETE FROM settings WHERE key=$1`, browserMCPDirectBinSetting)
		if err := d.seedBuiltins(); err != nil {
			t.Fatal(err)
		}
		cmd, args, _ := readBrowserMCP(t, d)
		want := []string{"--headless", "--proxy-server", "http://127.0.0.1:8788", "--browser", "chromium"}
		if cmd != browserMCPCommand || !slices.Equal(args, want) {
			t.Fatalf("got %q %q", cmd, args)
		}
	})
}

func putBrowserMCP(t *testing.T, d *DB, command string, args []string) {
	t.Helper()
	raw, err := json.Marshal(args)
	if err != nil {
		t.Fatal(err)
	}
	res, err := d.Exec(`UPDATE mcp_servers SET command=$1, args=$2 WHERE name=$3`, command, string(raw), browserMCPName)
	if err != nil {
		t.Fatal(err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("update browser mcp: %d rows", n)
	}
}

func readBrowserMCP(t *testing.T, d *DB) (command string, args []string, raw []byte) {
	t.Helper()
	err := d.QueryRow(`SELECT COALESCE(command,''), args FROM mcp_servers WHERE name=$1`, browserMCPName).Scan(&command, &raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &args); err != nil {
			t.Fatal(err)
		}
	}
	return
}
