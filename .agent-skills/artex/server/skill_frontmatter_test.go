package server

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Autumn-27/norma/skill"
)

func TestYamlScalar(t *testing.T) {
	cases := []struct{ in, want string }{
		{"rea", "rea"},
		{"api-recon", "api-recon"},
		{"plain value with spaces", "plain value with spaces"},
		{"target: embedded", "'target: embedded'"},
		{"it's quoted", "'it''s quoted'"},
		{"ends #now", "'ends #now'"},
		{"comma, separated", "'comma, separated'"},
		{" leading", "' leading'"},
		{"", "''"},
	}
	for _, c := range cases {
		if got := yamlScalar(c.in); got != c.want {
			t.Errorf("yamlScalar(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// A SKILL.md written the way fsCreateSkill now writes it (yamlScalar values)
// must round-trip through the real parser with name and mcps intact, even with
// a colon+space and quotes in the description. The pre-fix format (raw
// interpolation) fails exactly there and falls back to the directory name.
func TestSkillFrontmatterRoundTrip(t *testing.T) {
	dir := t.TempDir()
	skillDir := filepath.Join(dir, "colon-skill")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	desc := "Analyze target: embedded secrets, it's binary"
	content := fmt.Sprintf("---\nname: %s\ndescription: %s\nmcps: %s\n---\nbody instructions\n",
		yamlScalar("colon-skill"), yamlScalar(desc), yamlScalar("rea"))

	skillMD := filepath.Join(skillDir, "SKILL.md")
	if err := os.WriteFile(skillMD, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := verifySkillFile(skillDir, "colon-skill", []string{"rea"}); err != nil {
		t.Fatalf("safe format failed verification: %v", err)
	}
	reg, err := skill.LoadDir(skillDir)
	if err != nil || len(reg.List()) != 1 {
		t.Fatalf("LoadDir: %v (%d skills)", err, len(reg.List()))
	}
	s := reg.List()[0]
	if s.Name != "colon-skill" || s.Description != desc || len(s.MCPs) != 1 || s.MCPs[0] != "rea" {
		t.Fatalf("round-trip mismatch: name=%q desc=%q mcps=%v", s.Name, s.Description, s.MCPs)
	}

	// the old, unsafe emission: unquoted colon+space breaks the whole frontmatter
	unsafe := fmt.Sprintf("---\nname: %s\ndescription: %s\nmcps: rea\n---\nbody\n", "colon-skill", desc)
	if err := os.WriteFile(skillMD, []byte(unsafe), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := verifySkillFile(skillDir, "colon-skill", []string{"rea"}); err == nil {
		t.Fatal("unsafe format unexpectedly verified")
	} else if !strings.Contains(err.Error(), "fell back") {
		t.Fatalf("unexpected error: %v", err)
	}
}
