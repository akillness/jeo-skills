package agent

import (
	"fmt"
	"strings"
	"testing"
)

func TestSkillIndexBlock_ListsNamesAndRule(t *testing.T) {
	block := SkillIndexBlock([]string{"web-authz-testing", "api-recon", "pentest-injection-classes"})
	for _, want := range []string{"api-recon", "pentest-injection-classes", "web-authz-testing"} {
		if !strings.Contains(block, want) {
			t.Fatalf("index misses %q:\n%s", want, block)
		}
	}
	// The names alone are not the point: the rule is what makes the agent open one.
	if !strings.Contains(block, "Skill tool") || !strings.Contains(block, `"<skill>"`) {
		t.Fatalf("index misses the invoke rule:\n%s", block)
	}
	if strings.Index(block, "api-recon") > strings.Index(block, "web-authz-testing") {
		t.Fatalf("names are not sorted:\n%s", block)
	}
}

func TestSkillIndexBlock_Empty(t *testing.T) {
	if got := SkillIndexBlock(nil); got != "" {
		t.Fatalf("no skills must render nothing, got %q", got)
	}
	// An agent without skills keeps its previous prompt byte-for-byte.
	sys, boundary := deferredSystem("SYS", DeferredInfo{})
	if len(sys) != 1 || sys[0] != "SYS" || boundary != 0 {
		t.Fatalf("expected [SYS],0 — got %v,%d", sys, boundary)
	}
}

func TestSkillIndexBlock_Caps(t *testing.T) {
	var names []string
	for i := 0; i < 200; i++ {
		names = append(names, fmt.Sprintf("skill-with-a-long-name-%03d", i))
	}
	block := SkillIndexBlock(names)
	if !strings.Contains(block, "more, all listed in the Skill tool") {
		t.Fatalf("cap must announce the hidden names:\n%s", block)
	}
	if got := len(block); got > skillIndexMax+400 {
		t.Fatalf("block not bounded: %d bytes", got)
	}
	// The cap must cut on a name boundary, never mid-name.
	lines := strings.Split(strings.TrimSpace(block), "\n")
	if len(lines) != 2 {
		t.Fatalf("index must be rule + one names line, got %d lines:\n%s", len(lines), block)
	}
	parts := strings.Split(strings.Split(lines[1], " (+")[0], ", ")
	for _, part := range parts {
		if !strings.HasPrefix(part, "skill-with-a-long-name-") {
			t.Fatalf("cut mid-name: %q", part)
		}
	}
}

func TestDeferredSystem_IncludesSkillIndex(t *testing.T) {
	def := DeferredInfo{SkillIndex: SkillIndexBlock([]string{"api-recon"})}
	sys, _ := deferredSystem("SYS", def)
	if !strings.Contains(sys[0], "api-recon") {
		t.Fatalf("skill index must reach the system prompt:\n%s", sys[0])
	}
}

// The cached-prefix path assembles the same text in two segments; the split must
// stay byte-identical to the unsplit prompt, index included, or sibling workers
// lose the shared prefix they are supposed to share.
func TestAssembleWorkerSystem_SkillIndexKeepsSplitIdentical(t *testing.T) {
	def := DeferredInfo{
		FindingGuidance: "\n\nGUIDANCE",
		SkillIndex:      SkillIndexBlock([]string{"api-recon", "web-authz-testing"}),
		GlobalNames:     []string{"mcp__browser__navigate"},
	}
	unsplit, _ := deferredSystem("STATIC"+"\n\nDYN", def)
	split, boundary := assembleWorkerSystem("STATIC", "\n\nDYN", def, true)
	if boundary != 1 {
		t.Fatalf("boundary=%d want 1", boundary)
	}
	if got, want := strings.Join(split, "\n\n"), strings.Join(unsplit, "\n\n"); got != want {
		t.Fatalf("split prompt differs from unsplit:\n--- split\n%s\n--- unsplit\n%s", got, want)
	}
	if !strings.Contains(split[1], "api-recon") {
		t.Fatalf("index must land in the dynamic segment:\n%s", split[1])
	}
}
