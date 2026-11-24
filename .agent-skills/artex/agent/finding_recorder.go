package agent

import (
	"context"

	"github.com/Autumn-27/artex/db"
)

// FindingRecorder is injected by the host; agents never synthesize or copy
// evidence bodies themselves. Its implementation owns the atomic write.
type FindingRecorder interface {
	Record(context.Context, db.RecordFindingInput, []db.TrafficRef) (*db.RecordedFinding, error)
}

// TrafficCaptureChecker is implemented by a FindingRecorder that owns the live
// traffic capture (the host's evidence store). Plan() hands it to prove_goal so
// a finding's bound traffic_ref must still exist in that capture. Without it,
// finding proofs are refused (#124, P4.3).
type TrafficCaptureChecker interface {
	TrafficExists(ctx context.Context, trafficID string) (bool, error)
}

func (t *ToolSet) SetFindingRecorder(r FindingRecorder)   { t.findingRecorder = r }
func (w *Worker) SetFindingRecorder(r FindingRecorder)    { w.findingRecorder = r }
func (p *Planner) SetFindingRecorder(r FindingRecorder)   { p.findingRecorder = r }
func (m *MainAgent) SetFindingRecorder(r FindingRecorder) { m.findingRecorder = r }
