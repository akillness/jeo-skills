package db

import (
	"strings"
)

// prefixedNodeCols mirrors nodeCols with an alias, for queries that join
// exploration_nodes with another table carrying an `id` of its own.
const prefixedNodeCols = `n.id, n.kind, n.payload, n.priority, n.state, ` +
	`COALESCE(n.origin,''), COALESCE(n.owner,''), COALESCE(n.blocked_reason,''), ` +
	`COALESCE(n.delete_reason,''), n.created_at`

// FindingsSharingAssets returns finding nodes from OTHER tasks that are anchored to
// at least one of assetIDs.
//
// ListByKindWithSources covers the task's own findings plus its directly related
// tasks (task_relations). Two tasks run independently against the same target are
// NOT related, so a defect registered in one and re-registered in the other is
// invisible to a dedup check built only on that pool — measured live: three such
// duplicates across two tasks, all answered "distinct" because the question never
// offered them. Assets are the join that catches them.
//
// Returned nodes carry Inherited=true and SourceTaskID so callers can mark them as
// belonging to another task (read-only for extension).
func (s *ExplorationStore) FindingsSharingAssets(assetIDs []int64, excludeTask int64, limit int) ([]*Node, error) {
	if len(assetIDs) == 0 {
		return nil, nil
	}
	if limit <= 0 {
		// 50: самый широкий наблюдённый пул по ассету — 31 находка на ассете [1]
		// (53 находки в графе, 2026-11-22), запас 1.6x; вызывающий всё равно отбирает
		// из результата не больше triageMaxExisting, так что 50 — верхняя граница запроса.
		// при превышении: хвост по f.id DESC отбрасывается, вопрос всё равно ограничен.
		limit = 50
	}
	// One containment per asset, OR-joined: asset_ids is a jsonb array and the GIN
	// index (jsonb_path_ops) serves @>, not a list-membership operator.
	ors := make([]string, 0, len(assetIDs))
	args := []any{excludeTask}
	for _, id := range assetIDs {
		args = append(args, "["+itoa(id)+"]")
		ors = append(ors, "f.asset_ids @> $"+itoa(int64(len(args)))+"::jsonb")
	}
	args = append(args, limit)
	q := `SELECT ` + prefixedNodeCols + `, f.id, f.task_id
	      FROM findings f
	      JOIN exploration_nodes n ON n.id = f.node_id
	      WHERE f.task_id <> $1 AND (` + strings.Join(ors, " OR ") + `)
	      ORDER BY f.id DESC LIMIT $` + itoa(int64(len(args)))
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Node
	for rows.Next() {
		var n Node
		var payload []byte
		var findingID, taskID int64
		if err := rows.Scan(&n.ID, &n.Kind, &payload, &n.Priority, &n.State, &n.Origin, &n.Owner,
			&n.BlockedReason, &n.DeleteReason, &n.CreatedAt, &findingID, &taskID); err != nil {
			return nil, err
		}
		n.Payload = payload
		n.FindingID = findingID
		n.SourceTaskID = taskID
		n.Inherited = true
		out = append(out, &n)
	}
	return out, rows.Err()
}
