package db

import (
	"database/sql"
	"errors"
	"slices"
	"testing"
)

// skillRowState reports whether an (agent, skill) row exists and whether it is
// enabled. The distinction is the whole point of this file: seedBuiltinSkillVisibility
// is insert-if-absent, so "never seeded" and "explicitly turned off" must be
// different states. If turning a skill off removes the row, the next start sees
// "never seeded" and resurrects it.
func skillRowState(t *testing.T, d *DB, agentID int64, skill string) (exists, enabled bool) {
	t.Helper()
	err := d.QueryRow(`SELECT enabled FROM agent_skill_visibility WHERE agent_id=$1 AND skill_name=$2`, agentID, skill).Scan(&enabled)
	if errors.Is(err, sql.ErrNoRows) {
		return false, false
	}
	if err != nil {
		t.Fatalf("read skill visibility row (%d, %s): %v", agentID, skill, err)
	}
	return true, enabled
}

// TestSkillVisibilityOffIsNotResurrectedBySeed pins the behaviour the seed policy
// comment already claims: a toggle-off survives the next startup.
//
// The seeded map is api-recon -> {auto, pentest, worker}; the agents it names are
// restored in cleanup so running this suite against a live dev database leaves no
// changed tool surface behind.
func TestSkillVisibilityOffIsNotResurrectedBySeed(t *testing.T) {
	const skill = "api-recon"
	d, err := Open(testDSN(t))
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}

	// Every agent the seed touches is restored on the way out, because the skill
	// delete-path subtest below clears rows for all of them at once. The restores and
	// the Close are ONE cleanup, in that order: t.Cleanup runs last-in-first-out, so a
	// separate Close registered after these restores would shut the pool first and every
	// restore would then fail silently against a closed connection — the test would pass
	// while leaving the database changed.
	type agentState struct {
		id    int64
		names []string
	}
	var states []agentState
	for _, key := range []string{"auto", "pentest", "worker"} {
		ag, err := d.GetAgentByKey(key)
		if err != nil || ag == nil {
			t.Fatalf("agent %q missing: %v", key, err)
		}
		orig, err := d.AgentSkillNames(ag.ID)
		if err != nil {
			t.Fatalf("read original visibility for %q: %v", key, err)
		}
		states = append(states, agentState{id: ag.ID, names: orig})
	}
	t.Cleanup(func() {
		for _, st := range states {
			if err := d.SetAgentSkillVisibility(st.id, st.names); err != nil {
				t.Errorf("restore skill visibility for agent %d: %v", st.id, err)
			}
		}
		d.Close()
	})

	worker, err := d.GetAgentByKey("worker")
	if err != nil || worker == nil {
		t.Fatalf("worker agent missing: %v", err)
	}

	// Baseline: the skill is visible, and seeding again is a no-op (control).
	if err := d.ToggleSkillVisibility(worker.ID, skill, true); err != nil {
		t.Fatal(err)
	}
	if err := d.seedBuiltinSkillVisibility(); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if names, _ := d.AgentSkillNames(worker.ID); !slices.Contains(names, skill) {
		t.Fatalf("baseline: %s should be visible to worker after seeding, got %v", skill, names)
	}

	// Toggle-off must leave a disabled row behind...
	if err := d.ToggleSkillVisibility(worker.ID, skill, false); err != nil {
		t.Fatal(err)
	}
	if names, _ := d.AgentSkillNames(worker.ID); slices.Contains(names, skill) {
		t.Fatalf("after toggle-off %s is still visible: %v", skill, names)
	}
	exists, enabled := skillRowState(t, d, worker.ID, skill)
	if !exists {
		t.Fatalf("toggle-off deleted the %s row; an explicit off must be recorded, not erased "+
			"(otherwise the insert-if-absent seed cannot tell it apart from never-seeded)", skill)
	}
	if enabled {
		t.Fatalf("toggle-off left %s enabled=true", skill)
	}

	// ...and the next startup must respect it.
	if err := d.seedBuiltinSkillVisibility(); err != nil {
		t.Fatalf("seed after toggle-off: %v", err)
	}
	if names, _ := d.AgentSkillNames(worker.ID); slices.Contains(names, skill) {
		t.Fatalf("seed resurrected %s for worker after an explicit toggle-off: %v", skill, names)
	}

	// Same for the bulk setter: "this agent sees no skills" is an explicit choice,
	// so clearing must survive the next seed as well.
	if err := d.ToggleSkillVisibility(worker.ID, skill, true); err != nil {
		t.Fatal(err)
	}
	if err := d.SetAgentSkillVisibility(worker.ID, nil); err != nil {
		t.Fatal(err)
	}
	if err := d.seedBuiltinSkillVisibility(); err != nil {
		t.Fatalf("seed after clear: %v", err)
	}
	if names, _ := d.AgentSkillNames(worker.ID); len(names) != 0 {
		t.Fatalf("seed resurrected skills after SetAgentSkillVisibility(nil): %v", names)
	}

	// The skill-delete path is different on purpose: the skill is gone from disk, so
	// its rows go with it and a later re-install may seed it again as visible.
	if err := d.ToggleSkillVisibility(worker.ID, skill, true); err != nil {
		t.Fatal(err)
	}
	if err := d.DeleteSkillVisibility(skill); err != nil {
		t.Fatal(err)
	}
	if exists, _ := skillRowState(t, d, worker.ID, skill); exists {
		t.Fatalf("DeleteSkillVisibility left a %s row behind", skill)
	}
	if err := d.seedBuiltinSkillVisibility(); err != nil {
		t.Fatalf("seed after skill delete: %v", err)
	}
	if names, _ := d.AgentSkillNames(worker.ID); !slices.Contains(names, skill) {
		t.Fatalf("a deleted-then-seeded %s should be visible again, got %v", skill, names)
	}
}
