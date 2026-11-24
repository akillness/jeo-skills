package db

import (
	"strings"
	"testing"
)

func TestParseDSLRejectsDeepNesting(t *testing.T) {
	deep := strings.Repeat("(", dslMaxDepth+1) + "a" + strings.Repeat(")", dslMaxDepth+1)
	if _, err := ParseDSL(deep); err == nil {
		t.Fatal("deep nesting accepted")
	}
	ok := strings.Repeat("(", dslMaxDepth) + "a" + strings.Repeat(")", dslMaxDepth)
	if _, err := ParseDSL(ok); err != nil {
		t.Fatalf("depth %d refused: %v", dslMaxDepth, err)
	}
}

func TestParseDSLRejectsOversize(t *testing.T) {
	if _, err := ParseDSL(strings.Repeat("a", dslMaxLen+1)); err == nil {
		t.Fatal("oversize query accepted")
	}
}
