package llmrec

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"iter"
	"os"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
	"github.com/Autumn-27/norma/transcript"
)

type syntheticTelemetryProvider struct {
	usage      llm.Usage
	streamErr  error
	completeEr error
}

func (p syntheticTelemetryProvider) Stream(context.Context, llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	return func(yield func(llm.StreamEvent, error) bool) {
		if !yield(llm.StreamEvent{Type: llm.SEMessageStart, Usage: llm.Usage{
			InputTokens:      p.usage.InputTokens,
			CacheReadTokens:  p.usage.CacheReadTokens,
			CacheWriteTokens: p.usage.CacheWriteTokens,
		}}, nil) {
			return
		}
		if p.streamErr != nil {
			yield(llm.StreamEvent{}, p.streamErr)
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SETextDelta, Text: "ok"}, nil) {
			return
		}
		yield(llm.StreamEvent{
			Type:       llm.SEMessageDelta,
			StopReason: "end_turn",
			Usage:      llm.Usage{OutputTokens: p.usage.OutputTokens},
		}, nil)
	}
}

func (p syntheticTelemetryProvider) Complete(context.Context, llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	if p.completeEr != nil {
		return llm.Message{}, "", p.usage, p.completeEr
	}
	return llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{llm.TextBlock("done")}}, "end_turn", p.usage, nil
}

func TestMeasureContextExactSizesAndBoundaryModes(t *testing.T) {
	tools := []llm.ToolSchema{
		{
			Name:        "Bash",
			Description: "Run shell command",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"command": map[string]any{"type": "string"},
				},
			},
		},
		{
			Name:        "record_fact",
			Description: "Store a verified fact",
			InputSchema: map[string]any{"type": "object"},
		},
	}
	wantToolsBytes, err := json.Marshal(tools)
	if err != nil {
		t.Fatal(err)
	}

	msgUser1 := llm.UserText("first user prompt")
	msgAsst := llm.Message{
		Role: llm.RoleAssistant,
		Content: []llm.ContentBlock{
			{Type: llm.BlockToolUse, ID: "call_1", Name: "Bash", Input: json.RawMessage(`{"command":"id"}`)},
		},
	}
	toolResBlock := llm.ToolResultText("call_1", "uid=0(root) gid=0(root)", false)
	msgUser2 := llm.Message{
		Role:    llm.RoleUser,
		Content: []llm.ContentBlock{toolResBlock},
	}
	msgOther := llm.Message{
		Role:    llm.Role("tool"),
		Content: []llm.ContentBlock{llm.TextBlock("other role text")},
	}

	mustLen := func(v any) int64 {
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		return int64(len(b))
	}

	// Case 1: DynamicBoundary == 0 -> all system segments as single static block (joined with "\n\n").
	reqNoSplit := llm.CompletionRequest{
		System:          []string{"STATIC_ONE", "STATIC_TWO"},
		DynamicBoundary: 0,
		Tools:           tools,
		Messages:        []llm.Message{msgUser1, msgAsst, msgUser2, msgOther},
	}
	got1 := MeasureContext(reqNoSplit)
	if got1.SystemStaticBytes != int64(len("STATIC_ONE\n\nSTATIC_TWO")) || got1.SystemDynamicBytes != 0 {
		t.Fatalf("DynamicBoundary=0 system = (%d, %d), want (%d, 0)", got1.SystemStaticBytes, got1.SystemDynamicBytes, len("STATIC_ONE\n\nSTATIC_TWO"))
	}
	if got1.ToolCount != 2 || got1.ToolsBytes != int64(len(wantToolsBytes)) {
		t.Fatalf("tools = (count=%d, bytes=%d), want (2, %d)", got1.ToolCount, got1.ToolsBytes, len(wantToolsBytes))
	}
	wantUser := mustLen(msgUser1) + mustLen(msgUser2)
	wantAsst := mustLen(msgAsst)
	wantOther := mustLen(msgOther)
	wantToolRes := mustLen(toolResBlock)
	if got1.MessageCount != 4 ||
		got1.MessagesUserBytes != wantUser ||
		got1.MessagesAssistantBytes != wantAsst ||
		got1.MessagesOtherBytes != wantOther ||
		got1.ToolResultBytes != wantToolRes ||
		got1.LastMessageBytes != wantOther {
		t.Fatalf("messages = %+v, want count=4 user=%d asst=%d other=%d toolRes=%d last=%d",
			got1, wantUser, wantAsst, wantOther, wantToolRes, wantOther)
	}

	// Case 2: 0 < DynamicBoundary < len(System) -> split at boundary.
	reqSplit := llm.CompletionRequest{
		System:          []string{"AAA", "BBBB", "CCCCC", "DD"},
		DynamicBoundary: 2,
	}
	got2 := MeasureContext(reqSplit)
	if got2.SystemStaticBytes != int64(len("AAA\n\nBBBB")) || got2.SystemDynamicBytes != int64(len("CCCCC\n\nDD")) {
		t.Fatalf("DynamicBoundary=2 system = (%d, %d), want (%d, %d)",
			got2.SystemStaticBytes, got2.SystemDynamicBytes, len("AAA\n\nBBBB"), len("CCCCC\n\nDD"))
	}

	// Case 3: DynamicBoundary >= len(System) -> whole prompt static, dynamic == 0.
	reqAllStatic := llm.CompletionRequest{
		System:          []string{"AAA", "BBBB"},
		DynamicBoundary: 5,
	}
	got3 := MeasureContext(reqAllStatic)
	if got3.SystemStaticBytes != int64(len("AAA\n\nBBBB")) || got3.SystemDynamicBytes != 0 {
		t.Fatalf("DynamicBoundary=5 system = (%d, %d), want (%d, 0)",
			got3.SystemStaticBytes, got3.SystemDynamicBytes, len("AAA\n\nBBBB"))
	}

	// Case 4: whitespace-padded and empty segments match norma's llm.joinSystem
	// (strings.TrimSpace per segment, drop empty, join remaining with "\n\n").
	for _, tc := range []struct {
		name     string
		segs     []string
		boundary int
		wantStat int64
		wantDyn  int64
	}{
		{
			name:     "padded and empty unsplit",
			segs:     []string{"  STATIC  ", "", "\n", "TAIL\n\n"},
			boundary: 0,
			wantStat: int64(len("STATIC\n\nTAIL")),
			wantDyn:  0,
		},
		{
			name:     "padded split at boundary 2",
			segs:     []string{" A ", " B ", " C "},
			boundary: 2,
			wantStat: int64(len("A\n\nB")),
			wantDyn:  int64(len("C")),
		},
		{
			name:     "only empty and whitespace",
			segs:     []string{"", "   "},
			boundary: 1,
			wantStat: 0,
			wantDyn:  0,
		},
		{
			name:     "empty segments around boundary",
			segs:     []string{"  ", "HEAD ", "", "\t\n", " TAIL"},
			boundary: 2,
			wantStat: int64(len("HEAD")),
			wantDyn:  int64(len("TAIL")),
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := MeasureContext(llm.CompletionRequest{System: tc.segs, DynamicBoundary: tc.boundary})
			if got.SystemStaticBytes != tc.wantStat || got.SystemDynamicBytes != tc.wantDyn {
				t.Fatalf("MeasureContext(%q, b=%d) = (%d, %d), want (%d, %d)",
					tc.segs, tc.boundary, got.SystemStaticBytes, got.SystemDynamicBytes, tc.wantStat, tc.wantDyn)
			}
		})
	}
}

func TestContextTelemetryFlagOffAndOnPostgres(t *testing.T) {
	dsn := os.Getenv("ARTEX_PG_DSN")
	if dsn == "" {
		t.Skip("ARTEX_PG_DSN not set")
	}
	pg, err := db.Open(dsn)
	if err != nil {
		db.SkipPGUnavailable(t, err)
	}
	defer pg.Close()

	stamp := time.Now().UnixNano()
	taskOff := fmt.Sprintf("ctx-off-%d", stamp)
	taskOn := fmt.Sprintf("ctx-on-%d", stamp)
	t.Cleanup(func() {
		_, _ = pg.Exec(`DELETE FROM llm_context WHERE task_id IN ($1,$2)`, taskOff, taskOn)
		_, _ = pg.Exec(`DELETE FROM llm_usage WHERE task_id IN ($1,$2)`, taskOff, taskOn)
		_, _ = pg.Exec(`DELETE FROM llm_records WHERE task_id IN ($1,$2)`, taskOff, taskOn)
	})

	sentinelPrompt := "SECRET_PROMPT_SENTINEL_NEVER_STORE"
	sentinelMsg := "SECRET_USER_MSG_SENTINEL_NEVER_STORE"
	req := llm.CompletionRequest{
		System:          []string{sentinelPrompt, "DYNAMIC_TAIL"},
		DynamicBoundary: 1,
		Tools: []llm.ToolSchema{
			{Name: "Bash", Description: "SECRET_TOOL_DESC", InputSchema: map[string]any{"type": "object"}},
		},
		Messages: []llm.Message{
			llm.UserText(sentinelMsg),
		},
	}
	wantMetrics := MeasureContext(req)
	wantUsage := llm.Usage{InputTokens: 1200, OutputTokens: 150, CacheReadTokens: 800, CacheWriteTokens: 100}

	// 0. Default is ON: unset means enabled, only an explicit falsy value disables.
	t.Setenv(ContextTelemetryEnv, "")
	if !ContextTelemetryEnabled() {
		t.Fatal("expected telemetry enabled by default when env unset")
	}
	t.Setenv(ContextTelemetryEnv, "off")
	if ContextTelemetryEnabled() {
		t.Fatal("expected telemetry disabled when ARTEX_CONTEXT_TELEMETRY=off")
	}

	// 1. Flag OFF explicitly: zero rows in llm_context on both Stream and Complete,
	// identical behavior regardless of recordBodies.
	t.Setenv(ContextTelemetryEnv, "0")
	if ContextTelemetryEnabled() {
		t.Fatal("expected telemetry disabled when ARTEX_CONTEXT_TELEMETRY=0")
	}
	recOff := Wrap(syntheticTelemetryProvider{usage: wantUsage}, pg, "claude-test", "prof-a", "", "", func() bool { return false })
	ctxOff := transcript.WithSessionID(WithTaskID(context.Background(), taskOff), "exp1-worker-i1")
	var streamText string
	for ev, err := range recOff.Stream(ctxOff, req) {
		if err != nil {
			t.Fatal(err)
		}
		if ev.Type == llm.SETextDelta {
			streamText += ev.Text
		}
	}
	if streamText != "ok" {
		t.Fatalf("flag-off stream text = %q, want ok", streamText)
	}
	msgOff, stopOff, usageOff, err := recOff.Complete(ctxOff, req)
	if err != nil || msgOff.Text() != "done" || stopOff != "end_turn" || usageOff != wantUsage {
		t.Fatalf("flag-off Complete = (%q, %q, %+v, %v)", msgOff.Text(), stopOff, usageOff, err)
	}
	var offCount int
	if err := pg.QueryRow(`SELECT COUNT(*) FROM llm_context WHERE task_id=$1`, taskOff).Scan(&offCount); err != nil {
		t.Fatal(err)
	}
	if offCount != 0 {
		t.Fatalf("flag-off wrote %d rows to llm_context, want 0", offCount)
	}

	// 2. Flag ON with recordBodies=FALSE: rows ARE written on Stream (ok + error)
	// and Complete, with exact byte sizes and zero llm_records rows.
	t.Setenv(ContextTelemetryEnv, "1")
	if !ContextTelemetryEnabled() {
		t.Fatal("expected telemetry enabled when ARTEX_CONTEXT_TELEMETRY=1")
	}
	recOn := Wrap(syntheticTelemetryProvider{usage: wantUsage}, pg, "claude-test", "prof-a", "", "", func() bool { return false })
	ctxOn := transcript.WithSessionID(WithTaskID(context.Background(), taskOn), "exp2-planner")
	for _, err := range recOn.Stream(ctxOn, req) {
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, _, _, err := recOn.Complete(ctxOn, req); err != nil {
		t.Fatal(err)
	}
	// Error path also records status='error'.
	recErr := Wrap(syntheticTelemetryProvider{usage: llm.Usage{InputTokens: 400}, streamErr: errors.New("upstream 500")}, pg, "claude-test", "prof-a", "", "", func() bool { return false })
	for _, err := range recErr.Stream(ctxOn, req) {
		if err != nil {
			break
		}
	}

	var recBodiesCount int
	if err := pg.QueryRow(`SELECT COUNT(*) FROM llm_records WHERE task_id=$1`, taskOn).Scan(&recBodiesCount); err != nil {
		t.Fatal(err)
	}
	if recBodiesCount != 0 {
		t.Fatalf("llm_records count = %d with recordBodies=false, want 0", recBodiesCount)
	}

	rows, err := pg.Query(`
SELECT worker, model, profile, tool_count, message_count,
       system_static_bytes, system_dynamic_bytes, tools_bytes,
       messages_user_bytes, messages_assistant_bytes, messages_other_bytes,
       tool_result_bytes, last_message_bytes,
       input_tokens, output_tokens, cache_read, cache_write, status
FROM llm_context WHERE task_id=$1 ORDER BY id`, taskOn)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var got []db.LLMContext
	for rows.Next() {
		var c db.LLMContext
		if err := rows.Scan(
			&c.Worker, &c.Model, &c.Profile, &c.ToolCount, &c.MessageCount,
			&c.SystemStaticBytes, &c.SystemDynamicBytes, &c.ToolsBytes,
			&c.MessagesUserBytes, &c.MessagesAssistantBytes, &c.MessagesOtherBytes,
			&c.ToolResultBytes, &c.LastMessageBytes,
			&c.InputTokens, &c.OutputTokens, &c.CacheRead, &c.CacheWrite, &c.Status,
		); err != nil {
			t.Fatal(err)
		}
		got = append(got, c)
	}
	if len(got) != 3 {
		t.Fatalf("llm_context rows = %d, want 3 (stream ok, complete ok, stream error)", len(got))
	}
	for i, c := range got {
		if c.Worker != "planner" || c.Model != "claude-test" || c.Profile != "prof-a" ||
			c.ToolCount != wantMetrics.ToolCount || c.MessageCount != wantMetrics.MessageCount ||
			c.SystemStaticBytes != wantMetrics.SystemStaticBytes ||
			c.SystemDynamicBytes != wantMetrics.SystemDynamicBytes ||
			c.ToolsBytes != wantMetrics.ToolsBytes ||
			c.MessagesUserBytes != wantMetrics.MessagesUserBytes ||
			c.MessagesAssistantBytes != wantMetrics.MessagesAssistantBytes ||
			c.MessagesOtherBytes != wantMetrics.MessagesOtherBytes ||
			c.ToolResultBytes != wantMetrics.ToolResultBytes ||
			c.LastMessageBytes != wantMetrics.LastMessageBytes {
			t.Fatalf("row %d metrics = %+v, want %+v", i, c, wantMetrics)
		}
	}
	if got[0].Status != "ok" || got[0].InputTokens != 1200 || got[0].CacheRead != 800 || got[0].CacheWrite != 100 ||
		got[1].Status != "ok" || got[1].OutputTokens != 150 ||
		got[2].Status != "error" || got[2].InputTokens != 400 {
		t.Fatalf("unexpected usage/status rows: %+v", got)
	}

	// Verify schema contains zero content columns and stored rows hold none of the sentinels.
	var textCols int
	if err := pg.QueryRow(`SELECT COUNT(*) FROM information_schema.columns WHERE table_name='llm_context' AND column_name ~ '(body|content|prompt|text|raw|message$)'`).Scan(&textCols); err != nil || textCols != 0 {
		t.Fatalf("unexpected content-like columns in llm_context: count=%d err=%v", textCols, err)
	}
	var serializedRows string
	if err := pg.QueryRow(`SELECT COALESCE(string_agg(row_to_json(t)::text, ''), '') FROM llm_context t WHERE task_id=$1`, taskOn).Scan(&serializedRows); err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{sentinelPrompt, sentinelMsg, "SECRET_TOOL_DESC", "DYNAMIC_TAIL"} {
		if containsSubstr(serializedRows, secret) {
			t.Fatalf("llm_context leaked request content %q", secret)
		}
	}
}

func containsSubstr(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
