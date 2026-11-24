package enrich

import (
	"os"
	"testing"

	"github.com/Autumn-27/artex/db"
)

func TestMain(m *testing.M) {
	db.SuffixTestDatabase("enrich")
	os.Exit(m.Run())
}
