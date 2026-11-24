package db

import "context"

// SkillGap is one skill the agent asked for but the platform did not provide,
// aggregated by skill, agent, and task category. A miss row is written when the
// model names a skill that does not exist (skill_usage.found=false), so this
// report is the evidence-backed capability backlog rather than a guess.
type SkillGap struct {
	Skill      string `json:"skill"`
	AgentKey   string `json:"agent_key"`
	CategoryID int64  `json:"category_id"`
	Misses     int    `json:"misses"`
	Hits       int    `json:"hits"`
	LastSeen   int64  `json:"last_seen"`
}

// SkillGaps returns the aggregated miss report, highest miss count first.
// Hits are the successful calls for the same key, so callers can compute a
// miss rate without a second query.
func (d *DB) SkillGaps(ctx context.Context, limit int) ([]SkillGap, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := d.QueryContext(ctx, `
		SELECT su.skill,
		       COALESCE(su.agent_key,''),
		       COALESCE(t.category_id,0),
		       COUNT(*) FILTER (WHERE NOT su.found) AS misses,
		       COUNT(*) FILTER (WHERE su.found)     AS hits,
		       EXTRACT(EPOCH FROM MAX(su.ts))::bigint
		FROM skill_usage su
		LEFT JOIN tasks t ON t.id=su.task_id
		GROUP BY 1,2,3
		HAVING COUNT(*) FILTER (WHERE NOT su.found) > 0
		ORDER BY misses DESC, 6 DESC, 1
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SkillGap{}
	for rows.Next() {
		var g SkillGap
		if err := rows.Scan(&g.Skill, &g.AgentKey, &g.CategoryID, &g.Misses, &g.Hits, &g.LastSeen); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}
