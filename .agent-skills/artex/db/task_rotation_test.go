package db

import (
	"fmt"
	"testing"
	"time"
)

func TestTaskRotationPersistenceAndFailover(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	defer d.Close()
	ids := []int64{}
	for i := 0; i < 2; i++ {
		id, err := d.SaveProfile(&LLMProfile{Name: fmt.Sprintf("rotation-%d-%d", time.Now().UnixNano(), i), Format: "openai", Model: "test", APIKey: "test-key"})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
		defer cleanupProfile(t, d, id)
	}
	on := true
	task, err := d.CreateTaskWithOptions("rotation", "test", TaskCreateOptions{LLMProfileIDs: ids, LLMRotate: &on})
	if err != nil {
		t.Fatal(err)
	}
	defer d.DeleteTask(task.ID)
	if !task.LLMRotate {
		t.Fatal("create response lost rotation")
	}
	// Starting at the last profile still permits an earlier healthy provider in rotation mode.
	if err := d.ReplaceTaskLLMProfiles(task.ID, ids, ids[1]); err != nil {
		t.Fatal(err)
	}
	got, err := d.GetTask(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.LLMRotate {
		t.Fatal("legacy update lost persisted rotation")
	}
	tr, err := d.MarkTaskLLMProfileQuotaExhausted(task.ID, ids[1], "insufficient_quota")
	if err != nil {
		t.Fatal(err)
	}
	if tr.NextProfileID == nil || *tr.NextProfileID != ids[0] || tr.ChainExhausted {
		t.Fatalf("healthy earlier provider skipped: %+v", tr)
	}
	got, err = d.GetTask(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.ReadyLLMProfileIDs) != 1 || got.ReadyLLMProfileIDs[0] != ids[0] {
		t.Fatalf("ready profiles: %v", got.ReadyLLMProfileIDs)
	}
	off := false
	reordered := []int64{ids[1], ids[0]}
	if err := d.ReplaceTaskLLMProfiles(task.ID, reordered, 0, &off); err != nil {
		t.Fatal(err)
	}
	got, err = d.GetTask(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.LLMRotate || fmt.Sprint(got.LLMProfileIDs) != fmt.Sprint(reordered) || len(got.ReadyLLMProfileIDs) != 2 {
		t.Fatalf("update/reload lost settings: %+v", got)
	}
}
