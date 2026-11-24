package db

import (
	"fmt"
	"testing"
	"time"
)

func TestConversationPinOrderingAndPatch(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	// Registered FIRST so it runs LAST, after the row cleanup below.
	t.Cleanup(func() { d.Close() })

	suffix := time.Now().UnixNano()
	first, err := d.CreateConversation("mainagent", fmt.Sprintf("pin-first-%d", suffix), nil)
	if err != nil {
		t.Fatal(err)
	}
	second, err := d.CreateConversation("mainagent", fmt.Sprintf("pin-second-%d", suffix), nil)
	if err != nil {
		_ = d.DeleteConversation(first.ID)
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupErr(t, "first conversation", d.DeleteConversation(first.ID))
		cleanupErr(t, "second conversation", d.DeleteConversation(second.ID))
	})

	pinned := true
	first, err = d.UpdateConversation(first.ID, ConversationPatch{Pinned: &pinned})
	if err != nil || first == nil || !first.Pinned || first.PinnedAt == nil {
		t.Fatalf("pin first = %+v, %v", first, err)
	}
	firstPinnedAt := *first.PinnedAt
	time.Sleep(5 * time.Millisecond)
	second, err = d.UpdateConversation(second.ID, ConversationPatch{Pinned: &pinned})
	if err != nil || second == nil || !second.Pinned {
		t.Fatalf("pin second = %+v, %v", second, err)
	}

	newTitle := "renamed while pinned"
	first, err = d.UpdateConversation(first.ID, ConversationPatch{Title: &newTitle, Pinned: &pinned})
	if err != nil || first == nil {
		t.Fatal(err)
	}
	if first.Title != newTitle || first.PinnedAt == nil || !first.PinnedAt.Equal(firstPinnedAt) {
		t.Fatalf("repeat pin should preserve pin time: %+v (want %v)", first, firstPinnedAt)
	}

	conversations, err := d.ListConversations()
	if err != nil {
		t.Fatal(err)
	}
	positions := map[int64]int{}
	for index, conversation := range conversations {
		positions[conversation.ID] = index
	}
	if positions[second.ID] >= positions[first.ID] {
		t.Fatalf("newer pin must sort first: second=%d first=%d", positions[second.ID], positions[first.ID])
	}

	pinned = false
	first, err = d.UpdateConversation(first.ID, ConversationPatch{Pinned: &pinned})
	if err != nil || first == nil || first.Pinned || first.PinnedAt != nil {
		t.Fatalf("unpin first = %+v, %v", first, err)
	}
}
