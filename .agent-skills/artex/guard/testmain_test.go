package guard

import (
	"os"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestMain(m *testing.M) {
	// Own database per package (#80), as in db, agent, server, evidence and intercept.
	db.SuffixTestDatabase("guard")
	os.Exit(m.Run())
}
