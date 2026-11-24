package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"iter"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/transcript"
)

// sessionProbe is a provider that answers every call with one text turn and
// records the session id it saw on ctx plus the request messages.
type sessionProbe struct {
	mu   sync.Mutex
	ids  []string
	msgs [][]llm.Message
}

func (p *sessionProbe) Stream(ctx context.Context, req llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	p.mu.Lock()
	p.ids = append(p.ids, transcript.SessionIDFrom(ctx))
	p.msgs = append(p.msgs, req.Messages)
	p.mu.Unlock()
	return func(yield func(llm.StreamEvent, error) bool) {
		if yield(llm.StreamEvent{Type: llm.SETextDelta, Text: "done"}, nil) {
			yield(llm.StreamEvent{Type: llm.SEMessageDelta, StopReason: "end_turn"}, nil)
		}
	}
}

func (p *sessionProbe) Complete(ctx context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	acc := llm.NewAccumulator()
	for ev, err := range p.Stream(ctx, req) {
		if err != nil {
			return llm.Message{}, "", llm.Usage{}, err
		}
		acc.Add(ev)
	}
	return acc.Message(), acc.StopReason, acc.Usage, nil
}

func (p *sessionProbe) seen() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]string(nil), p.ids...)
}

// jsonlFiles lists every .jsonl file under dir.
func jsonlFiles(t *testing.T, dir string) []string {
	t.Helper()
	var out []string
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(path, ".jsonl") {
			out = append(out, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

// damageTranscript makes the main transcript of id corrupt (a non-JSON line) or
// unreadable (a directory). It returns the bytes a corrupt file must keep.
func damageTranscript(t *testing.T, store *transcript.Store, id string, unreadable bool) string {
	t.Helper()
	path := store.MainPath(id)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if unreadable {
		if err := os.Mkdir(path, 0o700); err != nil {
			t.Fatal(err)
		}
		return ""
	}
	const original = "{corrupt transcript\n"
	if err := os.WriteFile(path, []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}
	return original
}

// assertTranscriptUntouched checks that a damaged transcript was neither
// rewritten nor appended to.
func assertTranscriptUntouched(t *testing.T, store *transcript.Store, id, original string, unreadable bool) {
	t.Helper()
	path := store.MainPath(id)
	if unreadable {
		entries, err := os.ReadDir(path)
		if err != nil || len(entries) != 0 {
			t.Fatalf("unreadable transcript changed: entries=%v err=%v", entries, err)
		}
		return
	}
	b, err := os.ReadFile(path)
	if err != nil || string(b) != original {
		t.Fatalf("damaged transcript changed: %q err=%v", b, err)
	}
}

func assertRestoreError(t *testing.T, err error, calls int) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), "restore Norma session") || calls != 0 {
		t.Fatalf("err=%v provider calls=%d", err, calls)
	}
}

var damageCases = []struct {
	name       string
	unreadable bool
}{{"corrupt", false}, {"unreadable-directory", true}}

func TestChatSessionIdentityWithoutTranscript(t *testing.T) {
	p := &sessionProbe{}
	workDir := t.TempDir()
	c := NewChatAgent(p, "test-model", workDir, nil, 100000)
	for range 2 {
		if _, err := c.Chat(t.Context(), "assistant", "conv-stable", "hello", 1, 0, false, nil); err != nil {
			t.Fatal(err)
		}
	}
	if ids := p.seen(); len(ids) != 2 || ids[0] != "conv-stable" || ids[1] != "conv-stable" {
		t.Fatalf("provider session ids: %v", ids)
	}
	if files := jsonlFiles(t, workDir); len(files) != 0 {
		t.Fatalf("transcript written without persistence: %v", files)
	}
}

func TestChatMissingTranscriptStartsFresh(t *testing.T) {
	store := transcript.NewStore(t.TempDir())
	p := &sessionProbe{}
	c := NewChatAgent(p, "test-model", t.TempDir(), store, 100000)
	if _, err := c.Chat(t.Context(), "assistant", "conv-new", "hello", 1, 0, false, nil); err != nil {
		t.Fatal(err)
	}
	if ids := p.seen(); len(ids) != 1 || ids[0] != "conv-new" {
		t.Fatalf("provider session ids: %v", ids)
	}
	recs, err := store.Load(store.MainPath("conv-new"))
	if err != nil || len(recs) == 0 {
		t.Fatalf("fresh transcript not written: %d records, err=%v", len(recs), err)
	}
}

func TestChatRefusesDamagedTranscript(t *testing.T) {
	for _, tc := range damageCases {
		t.Run(tc.name, func(t *testing.T) {
			store := transcript.NewStore(t.TempDir())
			original := damageTranscript(t, store, "conv-broken", tc.unreadable)
			p := &sessionProbe{}
			c := NewChatAgent(p, "test-model", t.TempDir(), store, 100000)
			_, err := c.Chat(t.Context(), "assistant", "conv-broken", "hello", 1, 0, false, nil)
			assertRestoreError(t, err, len(p.seen()))
			assertTranscriptUntouched(t, store, "conv-broken", original, tc.unreadable)
		})
	}
}

func TestChatResumesSignedThinkingHistory(t *testing.T) {
	store := transcript.NewStore(t.TempDir())
	w := store.NewWriter("conv-signed", "")
	w.RecordMessage(llm.UserText("earlier question"), llm.Usage{})
	w.RecordMessage(llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{
		{Type: llm.BlockThinking, Thinking: "reasoning", Signature: "signed"},
		{Type: llm.BlockRedactedThinking, Data: "opaque"},
		{Type: llm.BlockText, Text: "earlier answer"},
	}}, llm.Usage{})
	if err := w.Err(); err != nil {
		t.Fatal(err)
	}
	p := &sessionProbe{}
	c := NewChatAgent(p, "test-model", t.TempDir(), store, 100000)
	if _, err := c.Chat(t.Context(), "assistant", "conv-signed", "next question", 1, 0, false, nil); err != nil {
		t.Fatal(err)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.msgs) != 1 {
		t.Fatalf("provider calls: %d", len(p.msgs))
	}
	var thinking, redacted bool
	for _, m := range p.msgs[0] {
		for _, b := range m.Content {
			thinking = thinking || (b.Type == llm.BlockThinking && b.Thinking == "reasoning" && b.Signature == "signed")
			redacted = redacted || (b.Type == llm.BlockRedactedThinking && b.Data == "opaque")
		}
	}
	if !thinking || !redacted {
		t.Fatalf("resumed history lost signed thinking=%v redacted=%v: %+v", thinking, redacted, p.msgs[0])
	}
}

// sessionFixture is one exploration with one intent on the test database.
type sessionFixture struct {
	expID    int64
	intentID int64
	ts       *db.ExplorationStore
	intent   *db.Node
}

func newSessionFixture(t *testing.T) sessionFixture {
	t.Helper()
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })
	expID, err := d.CreateExploration("session identity probe", "keep the session id stable")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM explorations WHERE id=$1`, expID) })
	ts := d.Exploration(expID)
	payload := map[string]any{"summary": "session probe"}
	intentID, err := ts.AddNode("intent", payload, 0, "running", "planner", nil)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(payload)
	return sessionFixture{expID: expID, intentID: intentID, ts: ts, intent: &db.Node{ID: intentID, Payload: raw}}
}

// run drives one agent kind once and returns the session id it should use.
func (f sessionFixture) run(t *testing.T, kind string, p *sessionProbe, tx *transcript.Store) (string, error) {
	t.Helper()
	workDir := t.TempDir()
	switch kind {
	case "worker":
		_, _, err := NewWorker(p, "test-model", workDir, tx, 0, 3).Execute(t.Context(), "work#1", f.expID, nil, f.ts, f.intent, passHooks{}, nil, nil, nil)
		return WorkerSessionID(f.expID, f.intentID), err
	case "planner":
		_, _, err := NewPlanner(p, "test-model", workDir, tx, 0, 3).Plan(t.Context(), f.expID, nil, f.ts, "probe goal", nil, passHooks{}, nil)
		return fmt.Sprintf("exp%d-planner", f.expID), err
	case "mainagent":
		_, err := NewMainAgent(p, "test-model", workDir, tx, 0, 3).Chat(t.Context(), f.expID, 0, nil, f.ts, "probe goal", "status?", passHooks{}, nil, nil, nil, nil, nil)
		return fmt.Sprintf("exp%d-main", f.expID), err
	case "mainagent-seg":
		_, err := NewMainAgent(p, "test-model", workDir, tx, 0, 3).Chat(t.Context(), f.expID, 2, nil, f.ts, "probe goal", "status?", passHooks{}, nil, nil, nil, nil, nil)
		return fmt.Sprintf("exp%d-main-s2", f.expID), err
	}
	t.Fatalf("unknown agent kind %q", kind)
	return "", nil
}

func TestAgentSessionIdentityWithAndWithoutTranscript(t *testing.T) {
	f := newSessionFixture(t)
	for _, kind := range []string{"worker", "planner", "mainagent", "mainagent-seg"} {
		t.Run(kind, func(t *testing.T) {
			bare := &sessionProbe{}
			want, err := f.run(t, kind, bare, nil)
			if err != nil {
				t.Fatal(err)
			}
			store := transcript.NewStore(t.TempDir())
			persisted := &sessionProbe{}
			if _, err := f.run(t, kind, persisted, store); err != nil {
				t.Fatal(err)
			}
			for _, ids := range [][]string{bare.seen(), persisted.seen()} {
				if len(ids) == 0 {
					t.Fatal("provider never called")
				}
				for _, id := range ids {
					if id != want {
						t.Fatalf("provider session ids %v, want %q", ids, want)
					}
				}
			}
			if recs, err := store.Load(store.MainPath(want)); err != nil || len(recs) == 0 {
				t.Fatalf("transcript %q not written under the session id: %d records, err=%v", want, len(recs), err)
			}
		})
	}
}

func TestAgentRefusesDamagedTranscript(t *testing.T) {
	f := newSessionFixture(t)
	for _, kind := range []string{"worker", "mainagent"} {
		for _, tc := range damageCases {
			t.Run(kind+"/"+tc.name, func(t *testing.T) {
				store := transcript.NewStore(t.TempDir())
				id := WorkerSessionID(f.expID, f.intentID)
				if kind == "mainagent" {
					id = fmt.Sprintf("exp%d-main", f.expID)
				}
				original := damageTranscript(t, store, id, tc.unreadable)
				p := &sessionProbe{}
				_, err := f.run(t, kind, p, store)
				assertRestoreError(t, err, len(p.seen()))
				assertTranscriptUntouched(t, store, id, original, tc.unreadable)
			})
		}
	}
}
