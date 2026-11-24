package agent

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/Autumn-27/norma/llm"
	actool "github.com/Autumn-27/norma/tool"
)

// deferredSystem builds an agent's system-prompt segments and cache boundary from
// its DeferredInfo. When globally-available MCP tools are present, their names + a
// "prefer core tools" instruction render into a <available-deferred-tools> block
// placed as the LAST system-prompt segment, with DynamicBoundary set so the whole
// (session-fixed) system prompt — including the block — is cached (design doc
// §2.1 / C1). Skill-gated MCP names are NOT in this block; they surface when their
// skill loads. Returns a single plain segment + boundary 0 when there is no global
// block to add.
func deferredSystem(sysText string, def DeferredInfo) (system []string, boundary int) {
	sysText += def.FindingGuidance + def.SkillIndex
	block := actool.RenderDeferredToolsBlock(def.GlobalNames)
	if block == "" {
		return []string{sysText}, 0
	}
	system = []string{sysText, block}
	boundary = len(system) // b >= len → whole system prompt cached (SDK guard)
	return system, boundary
}

// skillIndexMax bounds the names-only skill index. Skills are meant to be few and
// short-named; the bound only exists so an agent with a hundred skills cannot push
// its own instructions out of the prompt.
const skillIndexMax = 1200

// SkillIndexBlock renders the agent's skills as a system-prompt block.
//
// The Skill tool's own description already carries the listing, but a description is
// only read once the model decides to open the tool: on a live run with 36 skills
// assigned, the agent called Skill zero times across 485 trace records while the
// listing sat unread in one tool description — a system prompt is what every turn
// looks at. Names-only keeps it to a few hundred bytes instead of duplicating the
// descriptions. Returns "" for an agent without skills, so its prompt is unchanged.
func SkillIndexBlock(names []string) string {
	if len(names) == 0 {
		return ""
	}
	sorted := append([]string(nil), names...)
	sort.Strings(sorted)
	var b strings.Builder
	shown := 0
	for _, n := range sorted {
		sep := 0
		if shown > 0 {
			sep = 2 // ", "
		}
		if b.Len()+sep+len(n) > skillIndexMax {
			break
		}
		if shown > 0 {
			b.WriteString(", ")
		}
		b.WriteString(n)
		shown++
	}
	tail := ""
	if hidden := len(sorted) - shown; hidden > 0 {
		tail = fmt.Sprintf(" (+%d more, all listed in the Skill tool)", hidden)
	}
	return "\n\n**Skills available to you** — before hunting a class of weakness, invoke the matching skill with the Skill tool (`Skill {\"name\": \"<skill>\"}`) and follow its phases; where the skill and your own plan disagree, the skill wins.\n" +
		b.String() + tail
}

// seedUnlockFromHistory replays prior Skill() invocations in the conversation so
// their skill-gated MCPs are re-unlocked on a resumed session (design doc C2). The
// main agent builds a fresh session each turn; its in-memory unlock set would
// otherwise reset, leaving the model able to see a skill-revealed tool name yet
// unable to call it. No-op when unlockSkill is nil (no deferred tools).
func seedUnlockFromHistory(msgs []llm.Message, unlockSkill func(string)) {
	if unlockSkill == nil {
		return
	}
	for _, m := range msgs {
		for _, b := range m.ToolUses() {
			if b.Name != "Skill" {
				continue
			}
			var in struct {
				Name string `json:"name"`
			}
			if json.Unmarshal(b.Input, &in) == nil && in.Name != "" {
				unlockSkill(in.Name)
			}
		}
	}
}
