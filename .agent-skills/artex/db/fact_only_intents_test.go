package db

import "testing"

// "Proved but not registered", in measurable form: an intent that yielded facts and
// no finding. The test holds both cases at once, otherwise the gate is green on an
// empty set: intent A (fact, no finding) must be returned, intent B (fact + finding)
// must not.
func TestFactOnlyIntents(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	expID, err := d.CreateExploration("fact only intents", "fact only intents")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM explorations WHERE id=$1`, expID) })
	store := d.Exploration(expID)

	// A: fact present, no finding — "proved, not registered".
	intentA, err := store.AddIntent(map[string]any{"summary": "proved X, never registered"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	// Only finished intents count: the state filter keeps A (done) and drops open ones.
	if err := store.SetIntentState(intentA, "done"); err != nil {
		t.Fatal(err)
	}
	factA, err := store.AddNode(KindFact, map[string]any{"summary": "X is injectable"}, 1, "confirmed", "worker", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Link(intentA, RelYields, factA); err != nil {
		t.Fatal(err)
	}

	// B: fact and finding — must not be returned.
	intentB, err := store.AddIntent(map[string]any{"summary": "proved Y and registered"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	factB, err := store.AddNode(KindFact, map[string]any{"summary": "Y is injectable"}, 1, "confirmed", "worker", nil)
	if err != nil {
		t.Fatal(err)
	}
	findingB, err := store.AddNode(KindFinding, map[string]any{"summary": "Y finding"}, 1, "confirmed", "worker", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Link(intentB, RelYields, factB); err != nil {
		t.Fatal(err)
	}
	if err := store.Link(intentB, RelYields, findingB); err != nil {
		t.Fatal(err)
	}

	// C: intent with no facts at all — must not be returned either.
	intentC, err := store.AddIntent(map[string]any{"summary": "nothing yet"}, 1, nil, "planner")
	if err != nil {
		t.Fatal(err)
	}
	_ = intentC

	got, err := store.FactOnlyIntents(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("FactOnlyIntents returned %d intents, want 1 (only the fact-without-finding one): %+v", len(got), got)
	}
	if got[0].IntentID != intentA {
		t.Fatalf("FactOnlyIntents picked intent %d, want %d", got[0].IntentID, intentA)
	}
	if got[0].Facts != 1 {
		t.Fatalf("FactOnlyIntents facts = %d, want 1", got[0].Facts)
	}
	if got[0].Summary == "" {
		t.Fatal("FactOnlyIntents lost the intent summary — the planner cannot act on an id alone")
	}

	// Default cap: limit<=0 must not return nothing.
	if many, err := store.FactOnlyIntents(0); err != nil || len(many) != 1 {
		t.Fatalf("FactOnlyIntents(0) = (%d, %v), want 1 row via the default cap", len(many), err)
	}
}

// Only finished intents (done, blocked, exhausted, stopped) count. An intent that is
// still open or running with a fact and no finding must not be reported as finished.
func TestFactOnlyIntentsStates(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	t.Cleanup(func() { d.Close() })

	expID, err := d.CreateExploration("fact only states", "fact only states")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cleanupExec(t, d, `DELETE FROM explorations WHERE id=$1`, expID) })
	store := d.Exploration(expID)

	states := []string{"open", "running", "done", "blocked", "exhausted", "stopped"}
	want := map[int64]bool{}
	for _, st := range states {
		id, err := store.AddIntent(map[string]any{"summary": "state " + st}, 1, nil, "planner")
		if err != nil {
			t.Fatal(err)
		}
		if err := store.SetIntentState(id, st); err != nil {
			t.Fatal(err)
		}
		fact, err := store.AddNode(KindFact, map[string]any{"summary": "fact for " + st}, 1, "confirmed", "worker", nil)
		if err != nil {
			t.Fatal(err)
		}
		if err := store.Link(id, RelYields, fact); err != nil {
			t.Fatal(err)
		}
		if st == "done" || st == "blocked" || st == "exhausted" || st == "stopped" {
			want[id] = true
		}
	}

	got, err := store.FactOnlyIntents(0)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != len(want) {
		t.Fatalf("FactOnlyIntents returned %d intents, want %d (terminal states only): %+v", len(got), len(want), got)
	}
	for _, g := range got {
		if !want[g.IntentID] {
			t.Fatalf("FactOnlyIntents returned intent %d in a non-terminal state", g.IntentID)
		}
	}
}
