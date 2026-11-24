package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const (
	browserMCPName             = "browser"
	browserMCPCommand          = "playwright-mcp"
	browserMCPDirectBinSetting = "browser_mcp_direct_bin_v1"
)

// browserMCPSeedArgs is the JSON args array for a fresh browser MCP row.
// --headless: the image has no display.
// --browser chromium: Playwright MCP defaults to the "chrome" channel at
// /opt/google/chrome, which the image does not ship.
const browserMCPSeedArgs = `["--headless","--browser","chromium"]`

// npxMetaFlags are npx switches that do not take a value and that still leave
// the following argument as the package spec. `-y` is the form the UI mock
// used; `--` is a common separator. Flags that take a value (`-p`, `--package`)
// are treated as a custom invocation and left alone.
var npxMetaFlags = map[string]bool{
	"-y":      true,
	"--yes":   true,
	"--":      true,
	"-q":      true,
	"--quiet": true,
}

func playwrightMCPPackageIndex(args []string) (int, bool) {
	for i := 0; i < len(args); i++ {
		a := args[i]
		if npxMetaFlags[a] {
			continue
		}
		if a == "@playwright/mcp" || strings.HasPrefix(a, "@playwright/mcp@") {
			return i, true
		}
		return 0, false
	}
	return 0, false
}

// rewriteStockNpxBrowserMCP converts `npx [@meta...] @playwright/mcp [...]` to
// the image's global playwright-mcp binary. ok is false when the row is not
// that invocation (the operator changed the command or the package).
func rewriteStockNpxBrowserMCP(command string, args []string) (string, []string, bool) {
	if command != "npx" {
		return command, args, false
	}
	idx, ok := playwrightMCPPackageIndex(args)
	if !ok {
		return command, args, false
	}
	rest := append([]string{}, args[idx+1:]...)
	if !hasCLIFlag(rest, "--headless") {
		rest = append(rest, "--headless")
	}
	if !hasCLIFlag(rest, "--browser") {
		rest = append(rest, "--browser", "chromium")
	}
	return browserMCPCommand, rest, true
}

// rewriteBrowserMCPRow is the one-time row rewrite: stock npx @playwright/mcp
// becomes playwright-mcp, and a playwright-mcp row that still has no --browser
// (the MCP defaults to a Chrome channel the image does not ship) gets
// --browser chromium. Any other command or package is left alone.
func rewriteBrowserMCPRow(command string, args []string) (string, []string, bool) {
	cmd, out, ok := rewriteStockNpxBrowserMCP(command, args)
	if !ok {
		cmd, out = command, append([]string{}, args...)
	}
	if cmd == browserMCPCommand && !hasCLIFlag(out, "--browser") {
		out = append(out, "--browser", "chromium")
		ok = true
	}
	return cmd, out, ok
}

func hasCLIFlag(args []string, flag string) bool {
	eq := flag + "="
	for _, a := range args {
		if a == flag || strings.HasPrefix(a, eq) {
			return true
		}
	}
	return false
}

// migrateStockBrowserMCP rewrites a leftover stock `npx @playwright/mcp` browser
// MCP row once, and adds `--browser chromium` to a playwright-mcp row that
// still has none. Gated by a settings flag so an operator who later puts npx
// back is not rewritten on the next start. Any other command or package is
// left as-is.
func (d *DB) migrateStockBrowserMCP() error {
	if v, _, _ := d.GetSetting(browserMCPDirectBinSetting); v == "done" {
		return nil
	}
	var command string
	var argsRaw []byte
	err := d.QueryRow(`SELECT COALESCE(command,''), args FROM mcp_servers WHERE name=$1`, browserMCPName).Scan(&command, &argsRaw)
	if errors.Is(err, sql.ErrNoRows) {
		return d.SetSetting(browserMCPDirectBinSetting, "done")
	}
	if err != nil {
		return fmt.Errorf("read browser mcp: %w", err)
	}
	var args []string
	if len(argsRaw) > 0 {
		if err := json.Unmarshal(argsRaw, &args); err != nil {
			return d.SetSetting(browserMCPDirectBinSetting, "done")
		}
	}
	newCommand, newArgs, ok := rewriteBrowserMCPRow(command, args)
	if ok {
		raw, err := json.Marshal(newArgs)
		if err != nil {
			return fmt.Errorf("encode browser mcp args: %w", err)
		}
		if _, err := d.Exec(`UPDATE mcp_servers SET command=$1, args=$2 WHERE name=$3`, newCommand, string(raw), browserMCPName); err != nil {
			return fmt.Errorf("update browser mcp: %w", err)
		}
	}
	return d.SetSetting(browserMCPDirectBinSetting, "done")
}
