package llmrec

import (
	"os"
	"testing"

	"github.com/Autumn-27/artex/db"
)

// Run against this package's own database (db.SuffixTestDatabase, #80): the
// recorder tests require an isolated ARTEX_PG_DSN, and the suffix gives them
// one even inside a full parallel ./... run.
func TestMain(m *testing.M) {
	db.SuffixTestDatabase("llmrec")
	os.Exit(m.Run())
}
