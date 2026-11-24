package db

import "fmt"

// seedPersistenceApprovalRules inserts the built-in approval rules for the platform
// tools that store something the agents load or run later (custom tools, MCP
// servers, skill files). Each call of those tools is an ask: the operator approves it
// in the console. Seeded once, behind its own settings flag, like the other built-in
// seeds, so a later disable by the operator is never undone on restart. No agent tool
// reads or edits intercept rules, so an agent cannot lower them.
func (d *DB) seedPersistenceApprovalRules() error {
	if v, _, _ := d.GetSetting("intercept_persistence_rules_v1"); v == "done" {
		return nil
	}
	rules := []struct {
		name    string
		pattern string
		message string
	}{
		{
			name:    "[built-in] Persistent change: custom tool",
			pattern: `^(?:create_custom_tool|update_custom_tool)$`,
			message: "Approval needed: the agent asks to create or change a custom tool. It is stored on the platform and its code runs on this server in later calls. Approve only code you have read.",
		},
		{
			name:    "[built-in] Persistent change: MCP server",
			pattern: `^(?:create_mcp|update_mcp)$`,
			message: "Approval needed: the agent asks to add or change an MCP server. A stdio entry starts its command on this server; an HTTP or SSE entry sends its headers to its URL.",
		},
		{
			name:    "[built-in] Persistent change: skill",
			pattern: `^(?:create_skill|update_skill_file)$`,
			message: "Approval needed: the agent asks to create or change a skill file. Every agent that sees the skill loads its content as instructions.",
		},
	}
	// intercept_rules.name has no unique index, so ON CONFLICT cannot apply: the insert
	// is conditional on the name instead. A start that stopped between these inserts
	// and SetSetting re-runs them without duplicating a rule.
	for _, r := range rules {
		if _, err := d.Exec(`
INSERT INTO intercept_rules(name, enabled, priority, match_target, match_type, pattern, action, message, timeout_enabled, timeout_seconds, timeout_action)
SELECT $1, true, 95, 'tool_name', 'regex', $2, 'ask', $3, false, 60, 'deny'
WHERE NOT EXISTS (SELECT 1 FROM intercept_rules WHERE name = $1)`,
			r.name, r.pattern, r.message,
		); err != nil {
			return fmt.Errorf("rule %q: %w", r.name, err)
		}
	}
	return d.SetSetting("intercept_persistence_rules_v1", "done")
}
