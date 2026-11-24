package server

import (
	"context"
	"errors"
	"iter"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
)

type failingProvider struct{ err error }

func (f *failingProvider) Stream(ctx context.Context, req llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return nil
}

func (f *failingProvider) Complete(ctx context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	return llm.Message{}, "", llm.Usage{}, f.err
}

func TestEscalationAdvancesAfterConsecutiveFailures(t *testing.T) {
	resetLLMFailStreaksForTest()
	prov := &failingProvider{err: errors.New("boom: upstream 500")}
	profile := int64(7)
	nextProfile := int64(8)
	exhaustCalls := 0
	hooks := taskLLMStreamHooks{
		current: func(ctx context.Context) (taskLLMSelection, error) {
			return taskLLMSelection{task: &Task{ID: "1"}, profileID: profile, revision: 1, provider: prov}, nil
		},
		exhaust: func(sel taskLLMSelection, cause error) (db.TaskLLMTransition, error) {
			exhaustCalls++
			if exhaustCalls == 1 {
				return db.TaskLLMTransition{Advanced: true, NextProfileID: &nextProfile}, nil
			}
			return db.TaskLLMTransition{ChainExhausted: true}, nil
		},
	}
	// first two failures: passthrough, chain untouched
	for i := 1; i <= 2; i++ {
		_, _, _, err := completeTaskLLM(context.Background(), "1", llm.CompletionRequest{}, hooks)
		if err == nil || errors.Is(err, err) == false {
			t.Fatalf("call %d: expected the raw failure", i)
		}
		if exhaustCalls != 0 {
			t.Fatalf("call %d: exhaust fired early (%d)", i, exhaustCalls)
		}
	}
	// third consecutive failure: escalates, advances to profile 8, which itself
	// fails (streak 1) and returns the raw error
	_, _, _, err := completeTaskLLM(context.Background(), "1", llm.CompletionRequest{}, hooks)
	if err == nil {
		t.Fatal("expected the follow-up failure from the next profile")
	}
	if exhaustCalls != 1 {
		t.Fatalf("exhaust calls=%d want 1", exhaustCalls)
	}
	// The escalation inside call 3 already replayed once on the same profile
	// (streak 1); the fake current() keeps reporting profile 7, so the streak
	// key is unchanged. One more failure reaches streak 2, and the NEXT one
	// fires the second escalation, which the fake exhaust answers with a fully
	// exhausted chain.
	_, _, _, err = completeTaskLLM(context.Background(), "1", llm.CompletionRequest{}, hooks)
	if err == nil {
		t.Fatal("expected raw failure at streak 2")
	}
	if exhaustCalls != 1 {
		t.Fatalf("exhaust calls=%d want 1 at streak 2", exhaustCalls)
	}
	_, _, _, err = completeTaskLLM(context.Background(), "1", llm.CompletionRequest{}, hooks)
	if !isTaskLLMChainExhausted(err) {
		t.Fatalf("expected chain-exhausted classification, got %v", err)
	}
	if exhaustCalls != 2 {
		t.Fatalf("exhaust calls=%d want 2", exhaustCalls)
	}
}
