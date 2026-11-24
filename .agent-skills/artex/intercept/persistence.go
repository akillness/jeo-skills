package intercept

import (
	"encoding/json"
	"strings"
)

// PersistenceTools are the platform tools that store something the agents load or
// run later: a custom tool (its code runs on the host in later calls), an MCP server
// (a stdio entry starts its command), a skill file (agents load it as instructions).
// A prompt-injected page can make an agent call them, so each call needs operator
// approval. The approval comes from the built-in ask rules seeded in db
// ("[built-in] Persistent change: ..."). Nothing an agent can call edits those rules;
// only the console can disable them.
var PersistenceTools = []string{
	"create_custom_tool", "update_custom_tool",
	"create_mcp", "update_mcp",
	"create_skill", "update_skill_file",
}

// IsPersistenceTool reports whether name is one of PersistenceTools.
func IsPersistenceTool(name string) bool {
	for _, t := range PersistenceTools {
		if t == name {
			return true
		}
	}
	return false
}

// MatchPersistence decides a call of a persistence tool from the loaded rules. Any
// enabled deny rule that matches wins. Otherwise the first matching built-in ask rule
// answers, so the approval needs no other rule. User allow rules are not consulted:
// an allow rule cannot skip the approval.
func (i *Interceptor) MatchPersistence(toolName string, input []byte) (Decision, bool) {
	if !IsPersistenceTool(toolName) {
		return Decision{}, false
	}
	rules, err := i.rules()
	if err != nil {
		return storeUnreadableDecision(), true
	}
	var ask *compiledRule
	for idx := range rules {
		r := rules[idx]
		if !ruleMatches(r, toolName, input) {
			continue
		}
		if r.Action == "deny" {
			return persistenceDecision(r), true
		}
		if ask == nil && r.Action == "ask" && strings.HasPrefix(r.Name, builtinRulePrefix) {
			ask = &rules[idx]
		}
	}
	if ask == nil {
		return Decision{}, false
	}
	return persistenceDecision(*ask), true
}

func persistenceDecision(r compiledRule) Decision {
	msg := r.Message
	if msg == "" {
		msg = defaultMessage(r.Action, r.Name)
	}
	configJSON, _ := json.Marshal(r.InterceptRule)
	return Decision{
		RuleName: r.Name, ConfigDigest: digestInput(configJSON),
		Action:         r.Action,
		Message:        msg,
		RuleID:         r.ID,
		TimeoutEnabled: r.TimeoutEnabled,
		TimeoutSeconds: r.TimeoutSeconds,
		TimeoutAction:  r.TimeoutAction,
	}
}
