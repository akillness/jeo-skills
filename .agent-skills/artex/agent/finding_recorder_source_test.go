package agent

import (
	"go/ast"
	"go/parser"
	"go/token"
	"testing"
)

func TestFindingRecorderHasNoLegacyTrafficGuidance(t *testing.T) {
	// Check the declaration directly: an unused constant cannot affect prompt output.
	f, err := parser.ParseFile(token.NewFileSet(), "finding_recorder.go", nil, parser.SkipObjectResolution)
	if err != nil {
		t.Fatal(err)
	}
	ast.Inspect(f, func(n ast.Node) bool {
		if spec, ok := n.(*ast.ValueSpec); ok {
			for _, name := range spec.Names {
				if name.Name == "findingTrafficGuidance" {
					t.Fatal("finding_recorder.go declares the obsolete findingTrafficGuidance constant")
				}
			}
		}
		return true
	})
}
