package agent

import (
	"log"

	"github.com/Autumn-27/artex/db"
)

// coverageOn reports whether asset-coverage tools stay available for this task.
// A nil store is the historical default (enabled). A database error is logged and
// treated as enabled so a transient read failure does not drop the tools mid-run.
func coverageOn(as *db.AssetStore, taskID int64) bool {
	if as == nil {
		return true
	}
	enabled, err := as.CoverageEnabled(taskID)
	if err != nil {
		log.Printf("[coverage] task %d: reading the coverage flag failed; leaving coverage on: %v", taskID, err)
		return true
	}
	return enabled
}
