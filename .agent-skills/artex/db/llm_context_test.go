package db

import (
	"fmt"
	"io/fs"
	"math"
	"testing"
	"testing/fstest"
	"time"
)

func TestComputeLLMContextSharesDeterministic(t *testing.T) {
	// Call 1: 1000 bytes (400 sys_static, 100 sys_dyn, 200 tools, 200 user [150 tool_result], 100 asst), 1000 input tokens.
	// Call 2: 2000 bytes (200 sys_static, 0 sys_dyn, 200 tools, 1400 user [1200 tool_result], 200 asst), 3000 input tokens.
	// Call 3: zero tokens / zero bytes -> ignored safely (no NaN).
	rows := []LLMContext{
		{
			SystemStaticBytes: 400, SystemDynamicBytes: 100, ToolsBytes: 200,
			MessagesUserBytes: 200, MessagesAssistantBytes: 100, ToolResultBytes: 150,
			InputTokens: 1000,
		},
		{
			SystemStaticBytes: 200, SystemDynamicBytes: 0, ToolsBytes: 200,
			MessagesUserBytes: 1400, MessagesAssistantBytes: 200, ToolResultBytes: 1200,
			InputTokens: 3000,
		},
		{InputTokens: 0, SystemStaticBytes: 0},
	}

	got := ComputeLLMContextShares(rows)
	// Exact hand-computed attributed tokens (total = 4000):
	// sys_static:  400 + 300  = 700  -> 0.175
	// sys_dynamic: 100 + 0    = 100  -> 0.025
	// tools:       200 + 300  = 500  -> 0.125
	// msg_user:    200 + 2100 = 2300 -> 0.575
	// msg_asst:    100 + 300  = 400  -> 0.100
	// msg_other:   0          = 0    -> 0.000
	// tool_result: 150 + 1800 = 1950 -> 0.4875
	assertNear := func(name string, v, want float64) {
		t.Helper()
		if math.IsNaN(v) || math.IsInf(v, 0) || math.Abs(v-want) > 1e-9 {
			t.Errorf("%s = %.12f, want %.12f", name, v, want)
		}
	}
	assertNear("SystemStatic", got.SystemStatic, 0.175)
	assertNear("SystemDynamic", got.SystemDynamic, 0.025)
	assertNear("Tools", got.Tools, 0.125)
	assertNear("MessagesUser", got.MessagesUser, 0.575)
	assertNear("MessagesAsst", got.MessagesAsst, 0.100)
	assertNear("MessagesOther", got.MessagesOther, 0.0)
	assertNear("ToolResultSubset", got.ToolResultSubset, 0.4875)

	sum := got.SystemStatic + got.SystemDynamic + got.Tools + got.MessagesUser + got.MessagesAsst + got.MessagesOther
	assertNear("partition sum", sum, 1.0)

	// Empty input produces zero struct without NaN.
	zero := ComputeLLMContextShares(nil)
	if zero != (LLMContextSectionShares{}) {
		t.Fatalf("empty shares = %+v, want zero", zero)
	}
}

func TestLLMContextMigration0009AndSummaryAggregation(t *testing.T) {
	dsn := scratchDSN(t, "ctx_mig_0009")

	// 1. Open database with migrations 0001..0008 only (pre-0009 database).
	pre0009 := fstest.MapFS{}
	entries, err := fs.ReadDir(migrationsFS(), ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.IsDir() || e.Name() >= "0009_" {
			continue
		}
		data, err := fs.ReadFile(migrationsFS(), e.Name())
		if err != nil {
			t.Fatal(err)
		}
		pre0009[e.Name()] = &fstest.MapFile{Data: data}
	}
	d0, err := openWithMigrations(dsn, pre0009)
	if err != nil {
		t.Fatalf("open pre-0009: %v", err)
	}
	var existsBefore bool
	if err := d0.QueryRow(`SELECT to_regclass('llm_context') IS NOT NULL`).Scan(&existsBefore); err != nil || existsBefore {
		d0.Close()
		t.Fatalf("llm_context should not exist before 0009: exists=%v err=%v", existsBefore, err)
	}
	d0.Close()

	// 2. Re-open with full embedded migrations: 0009 must apply cleanly.
	d, err := Open(dsn)
	if err != nil {
		t.Fatalf("Open with 0009: %v", err)
	}
	defer d.Close()

	// 3. Seed deterministic rows across two workers and two tasks.
	seed := []LLMContext{
		{
			TaskID: "t-heavy", Worker: "worker", Model: "claude-sonnet", Profile: "main",
			ToolCount: 15, MessageCount: 4,
			SystemStaticBytes: 400, SystemDynamicBytes: 100, ToolsBytes: 200,
			MessagesUserBytes: 200, MessagesAssistantBytes: 100, ToolResultBytes: 150,
			LastMessageBytes: 120,
			InputTokens:      1000, OutputTokens: 200, CacheRead: 600, CacheWrite: 100, Status: "ok",
		},
		{
			TaskID: "t-heavy", Worker: "worker", Model: "claude-sonnet", Profile: "main",
			ToolCount: 15, MessageCount: 12,
			SystemStaticBytes: 200, SystemDynamicBytes: 0, ToolsBytes: 200,
			MessagesUserBytes: 1400, MessagesAssistantBytes: 200, ToolResultBytes: 1200,
			LastMessageBytes: 800,
			InputTokens:      3000, OutputTokens: 300, CacheRead: 1800, CacheWrite: 200, Status: "ok",
		},
		{
			TaskID: "t-light", Worker: "planner", Model: "claude-sonnet", Profile: "main",
			ToolCount: 10, MessageCount: 2,
			SystemStaticBytes: 600, SystemDynamicBytes: 0, ToolsBytes: 200,
			MessagesUserBytes: 200, MessagesAssistantBytes: 0, ToolResultBytes: 0,
			LastMessageBytes: 200,
			InputTokens:      500, OutputTokens: 100, CacheRead: 250, CacheWrite: 50, Status: "ok",
		},
	}
	for i := range seed {
		if err := d.InsertLLMContext(&seed[i]); err != nil {
			t.Fatalf("InsertLLMContext[%d]: %v", i, err)
		}
	}

	summary, err := d.LLMContextSummary(LLMContextQuery{Days: 7, TopTasks: 10})
	if err != nil {
		t.Fatalf("LLMContextSummary: %v", err)
	}
	if len(summary.ByWorkerModel) != 2 {
		t.Fatalf("ByWorkerModel = %d, want 2: %+v", len(summary.ByWorkerModel), summary.ByWorkerModel)
	}

	// First group is worker/claude-sonnet (total input = 4000).
	w := summary.ByWorkerModel[0]
	wantShares := ComputeLLMContextShares(seed[:2])
	near := func(name string, got, want float64) {
		t.Helper()
		if math.Abs(got-want) > 1e-9 {
			t.Errorf("%s = %.12f, want %.12f", name, got, want)
		}
	}
	if w.Worker != "worker" || w.Model != "claude-sonnet" || w.Calls != 2 ||
		w.InputTokensTotal != 4000 || w.OutputTokensTotal != 500 ||
		w.CacheReadTotal != 2400 || w.CacheWriteTotal != 300 || w.InputMax != 3000 {
		t.Fatalf("worker group = %+v", w)
	}
	near("CacheReadRatio", w.CacheReadRatio, 2400.0/4000.0)
	near("InputP50", w.InputP50, 2000.0)
	near("InputP90", w.InputP90, 2800.0)
	near("InputP99", w.InputP99, 2980.0)
	near("Shares.SystemStatic", w.Shares.SystemStatic, wantShares.SystemStatic)
	near("Shares.SystemDynamic", w.Shares.SystemDynamic, wantShares.SystemDynamic)
	near("Shares.Tools", w.Shares.Tools, wantShares.Tools)
	near("Shares.MessagesUser", w.Shares.MessagesUser, wantShares.MessagesUser)
	near("Shares.MessagesAsst", w.Shares.MessagesAsst, wantShares.MessagesAsst)
	near("Shares.ToolResultSubset", w.Shares.ToolResultSubset, wantShares.ToolResultSubset)

	// TopTasks ordered by InputTokensTotal DESC: t-heavy (4000) then t-light (500).
	if len(summary.TopTasks) != 2 || summary.TopTasks[0].TaskID != "t-heavy" || summary.TopTasks[1].TaskID != "t-light" {
		t.Fatalf("TopTasks = %+v", summary.TopTasks)
	}

	// Task filter narrows to t-light only.
	filtered, err := d.LLMContextSummary(LLMContextQuery{Days: 7, TaskID: "t-light", TopTasks: 5})
	if err != nil {
		t.Fatal(err)
	}
	if len(filtered.ByWorkerModel) != 1 || filtered.ByWorkerModel[0].Worker != "planner" || len(filtered.TopTasks) != 1 {
		t.Fatalf("filtered summary = %+v", filtered)
	}
}

// TestLLMContextRepresentativeFixtureReport runs a realistic multi-turn ARTEX
// task fixture (planner rounds + deep worker intent execution + main-agent
// follow-up) through InsertLLMContext and LLMContextSummary, verifying the
// aggregation pipeline end-to-end and logging reproducible Phase A numbers.
func TestLLMContextRepresentativeFixtureReport(t *testing.T) {
	d, err := Open(testDSN(t))
	if err != nil {
		SkipPGUnavailable(t, err)
	}
	defer d.Close()

	taskID := fmt.Sprintf("fixture-p35a-%d", time.Now().UnixNano())
	t.Cleanup(func() { _, _ = d.Exec(`DELETE FROM llm_context WHERE task_id=$1`, taskID) })

	// Representative byte sizes modeled from ARTEX's actual plannerSystem (~12 KiB),
	// workerSystem (~11 KiB), tool schemas (~8-10 KiB for 12-16 tools), and real
	// multi-turn exploration trajectories (token estimate ~3.8 bytes/token).
	var fixture []LLMContext

	// 5 planner rounds: ~12.5 KiB static system (includes {{.Now}} so cross-round cache misses
	// on first turn of each round), ~9.2 KiB tools (14 tools), situational graph overview growing
	// from 4 KiB to 14 KiB across rounds, 2 turns per round.
	for round := range 5 {
		overviewBytes := int64(4000 + round*2500)
		// Turn 1 of round: fresh session, cache miss (cache_write ~system+tools, cache_read 0)
		sysBytes := int64(12500)
		toolsBytes := int64(9200)
		in1 := int((sysBytes + toolsBytes + overviewBytes) / 4)
		fixture = append(fixture, LLMContext{
			TaskID: taskID, Worker: "planner", Model: "claude-sonnet-4", Profile: "fixture",
			ToolCount: 14, MessageCount: 1,
			SystemStaticBytes: sysBytes, ToolsBytes: toolsBytes,
			MessagesUserBytes: overviewBytes, LastMessageBytes: overviewBytes,
			InputTokens: in1, OutputTokens: 450, CacheRead: 0, CacheWrite: int((sysBytes + toolsBytes) / 4), Status: "ok",
		})
		// Turn 2 of round: after add_intent tool_result, prefix hits cache
		asstBytes := int64(1400)
		toolResBytes := int64(450)
		in2 := int((sysBytes + toolsBytes + overviewBytes + asstBytes + toolResBytes) / 4)
		fixture = append(fixture, LLMContext{
			TaskID: taskID, Worker: "planner", Model: "claude-sonnet-4", Profile: "fixture",
			ToolCount: 14, MessageCount: 3,
			SystemStaticBytes: sysBytes, ToolsBytes: toolsBytes,
			MessagesUserBytes: overviewBytes + toolResBytes, MessagesAssistantBytes: asstBytes,
			ToolResultBytes: toolResBytes, LastMessageBytes: toolResBytes,
			InputTokens: in2, OutputTokens: 320, CacheRead: in1, CacheWrite: 0, Status: "ok",
		})
	}

	// 2 worker intents x 10 turns each: ~11 KiB system (embeds per-intent runDir + {{.Now}}),
	// ~10.5 KiB tools (16 tools), growing Bash/WebFetch tool_result outputs (avg ~5 KiB/turn).
	for range 2 {
		sysBytes := int64(11000)
		toolsBytes := int64(10500)
		userBytes := int64(6500) // launch overview + claimed intent
		asstBytes := int64(0)
		toolResTotal := int64(0)
		prevInput := 0
		for turn := range 10 {
			lastBytes := int64(6500)
			if turn > 0 {
				trChunk := int64(3500 + (turn%3)*2500) // realistic nmap/curl/ffuf tool outputs
				asstChunk := int64(900)
				userBytes += trChunk
				toolResTotal += trChunk
				asstBytes += asstChunk
				lastBytes = trChunk
			}
			totalB := sysBytes + toolsBytes + userBytes + asstBytes
			inTok := int(totalB / 4)
			cacheRead := prevInput
			cacheWrite := 0
			if turn == 0 {
				cacheRead = 0
				cacheWrite = int((sysBytes + toolsBytes) / 4)
			}
			fixture = append(fixture, LLMContext{
				TaskID: taskID, Worker: "worker", Model: "claude-sonnet-4", Profile: "fixture",
				ToolCount: 16, MessageCount: 1 + turn*2,
				SystemStaticBytes: sysBytes, ToolsBytes: toolsBytes,
				MessagesUserBytes: userBytes, MessagesAssistantBytes: asstBytes,
				ToolResultBytes: toolResTotal, LastMessageBytes: lastBytes,
				InputTokens: inTok, OutputTokens: 380, CacheRead: cacheRead, CacheWrite: cacheWrite, Status: "ok",
			})
			prevInput = inTok
		}
	}

	for i := range fixture {
		if err := d.InsertLLMContext(&fixture[i]); err != nil {
			t.Fatal(err)
		}
	}
	summary, err := d.LLMContextSummary(LLMContextQuery{Days: 1, TaskID: taskID, TopTasks: 5})
	if err != nil {
		t.Fatal(err)
	}
	if len(summary.ByWorkerModel) != 2 || len(summary.TopTasks) != 1 {
		t.Fatalf("unexpected fixture summary shape: %+v", summary)
	}
	for _, g := range summary.ByWorkerModel {
		t.Logf("FIXTURE [%s/%s] calls=%d in_total=%d p50=%.0f p90=%.0f max=%d cache_read_ratio=%.3f | sys_static=%.1f%% sys_dyn=%.1f%% tools=%.1f%% user=%.1f%% (tool_result=%.1f%%) asst=%.1f%%",
			g.Worker, g.Model, g.Calls, g.InputTokensTotal, g.InputP50, g.InputP90, g.InputMax, g.CacheReadRatio,
			g.Shares.SystemStatic*100, g.Shares.SystemDynamic*100, g.Shares.Tools*100,
			g.Shares.MessagesUser*100, g.Shares.ToolResultSubset*100, g.Shares.MessagesAsst*100)
	}
}
