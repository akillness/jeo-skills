package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"iter"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/llmrec"
	"github.com/Autumn-27/norma/llm"
	actool "github.com/Autumn-27/norma/tool"
)

type captureReqProvider struct {
	mu   sync.Mutex
	reqs []llm.CompletionRequest
}

func (p *captureReqProvider) Stream(_ context.Context, req llm.CompletionRequest) iter.Seq2[llm.StreamEvent, error] {
	p.mu.Lock()
	p.reqs = append(p.reqs, req)
	p.mu.Unlock()
	return func(yield func(llm.StreamEvent, error) bool) {
		if !yield(llm.StreamEvent{Type: llm.SEMessageStart, Usage: llm.Usage{InputTokens: 100}}, nil) {
			return
		}
		if !yield(llm.StreamEvent{Type: llm.SETextDelta, Text: "done"}, nil) {
			return
		}
		yield(llm.StreamEvent{Type: llm.SEMessageDelta, StopReason: "end_turn", Usage: llm.Usage{OutputTokens: 4}}, nil)
	}
}

func (p *captureReqProvider) Complete(_ context.Context, req llm.CompletionRequest) (llm.Message, string, llm.Usage, error) {
	p.mu.Lock()
	p.reqs = append(p.reqs, req)
	p.mu.Unlock()
	return llm.Message{Role: llm.RoleAssistant, Content: []llm.ContentBlock{llm.TextBlock("done")}}, "end_turn", llm.Usage{InputTokens: 100, OutputTokens: 4}, nil
}

func (p *captureReqProvider) last() llm.CompletionRequest {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.reqs) == 0 {
		return llm.CompletionRequest{}
	}
	return p.reqs[len(p.reqs)-1]
}

func TestAssembleWorkerSystemFlagOffAndOnByteExact(t *testing.T) {
	for _, tc := range []struct {
		name        string
		caCert      string
		globalNames []string
		guidance    string
	}{
		{name: "no_deferred_no_traffic", caCert: "", globalNames: nil, guidance: ""},
		{name: "with_deferred_and_traffic", caCert: "/ca.pem", globalNames: []string{"mcp__zap__scan", "mcp__burp__send"}, guidance: "\n\n[Finding guidance]"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			def := DeferredInfo{
				GlobalNames:     tc.globalNames,
				FindingGuidance: tc.guidance,
			}
			buildTail := func(runDir, intentSummary, assetDomain string) (string, string) {
				staticPart, dynamicTail := workerSystemParts("127.0.0.1:8788", tc.caCert, "/data", runDir)
				dynamicTail += "\n\n## Prior evidence\n- lesson A"
				dynamicTail += "\n\n[Constraints]\n- do not touch prod"
				dynamicTail += renderIntentTask(&db.Node{ID: 7, Payload: json.RawMessage(`{"summary":"` + intentSummary + `"}`)})
				dynamicTail += "\n\nThe target assets corresponding to this intent's asset_ids:\n[{\"domain\":\"" + assetDomain + "\"}]"
				dynamicTail += "\n\nStart executing the intent above: do only it, produce only facts, assets, findings, stop when done."
				return staticPart, dynamicTail
			}

			s1, d1 := buildTail("/data/tasks/1/i10", "probe auth", "alpha.example")
			s2, d2 := buildTail("/data/tasks/1/i20", "probe billing", "beta.example")

			// Legacy baseline (equivalent to flag off).
			legacySys1, legacyBound1 := deferredSystem(workerSystem("127.0.0.1:8788", tc.caCert, "/data", "/data/tasks/1/i10")+strings.TrimPrefix(d1, workerArtifactSpec("/data/tasks/1/i10")+noiseProfileBlock()), def)
			offSys1, offBound1 := assembleWorkerSystem(s1, d1, def, false)
			if offBound1 != legacyBound1 || !slices.Equal(offSys1, legacySys1) {
				t.Fatalf("flag off diverged from legacy: got (%d, len=%d) want (%d, len=%d)", offBound1, len(offSys1), legacyBound1, len(legacySys1))
			}

			// Flag ON: split into [static, dynamic] with DynamicBoundary=1.
			onSys1, onBound1 := assembleWorkerSystem(s1, d1, def, true)
			onSys2, onBound2 := assembleWorkerSystem(s2, d2, def, true)

			if onBound1 != 1 || onBound2 != 1 || len(onSys1) != 2 || len(onSys2) != 2 {
				t.Fatalf("flag on shape = (%d, %d) / (%d, %d), want boundary=1 len=2", onBound1, len(onSys1), onBound2, len(onSys2))
			}
			// Static segment identical across sibling workers.
			if onSys1[0] != onSys2[0] {
				t.Fatalf("static prefix differs between sibling workers")
			}
			// Dynamic segment differs and carries per-intent data + deferred block.
			if onSys1[1] == onSys2[1] {
				t.Fatalf("dynamic segment unexpectedly identical")
			}
			for _, want := range []string{"/data/tasks/1/i10", "probe auth", "alpha.example", "Start executing the intent above:"} {
				if !strings.Contains(onSys1[1], want) {
					t.Errorf("dynamic[1] missing %q", want)
				}
				if strings.Contains(onSys1[0], want) {
					t.Errorf("static[0] unexpectedly contains volatile %q", want)
				}
			}
			if len(tc.globalNames) > 0 {
				if !strings.Contains(onSys1[1], "<available-deferred-tools>") || !strings.Contains(onSys1[1], "mcp__zap__scan") {
					t.Errorf("deferred tools block missing from dynamic segment")
				}
				if strings.Contains(onSys1[0], "<available-deferred-tools>") {
					t.Errorf("deferred tools block unexpectedly in static segment")
				}
			}

			// Byte-exact visible text: Join(onSys, "\n\n") == Join(offSys, "\n\n").
			wantVisible1 := strings.Join(offSys1, "\n\n")
			gotVisible1 := strings.Join(onSys1, "\n\n")
			if gotVisible1 != wantVisible1 {
				t.Fatalf("visible text mismatch (len got=%d want=%d)", len(gotVisible1), len(wantVisible1))
			}
			offSys2, _ := assembleWorkerSystem(s2, d2, def, false)
			if strings.Join(onSys2, "\n\n") != strings.Join(offSys2, "\n\n") {
				t.Fatalf("worker 2 visible text mismatch")
			}
		})
	}
}

func TestWorkerExecuteCachePrefixEndToEnd(t *testing.T) {
	d := testDB(t)
	t.Cleanup(func() { _ = d.Close() })

	stamp := time.Now().UnixNano()
	task, err := d.CreateTask(fmt.Sprintf("cache-prefix-%d", stamp), "verify worker cache prefix", nil, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.DeleteTask(task.ID) })

	ts := d.Exploration(task.ExplorationID)
	as := d.Assets()
	var asset1ID, asset2ID int64
	dom1 := fmt.Sprintf("alpha-%d.cache.test", stamp)
	dom2 := fmt.Sprintf("beta-%d.cache.test", stamp)
	if err := d.QueryRow(`INSERT INTO assets(type,domain,root_domain,task_ids) VALUES('subdomain',$1,$1,ARRAY[$2]::bigint[]) RETURNING id`, dom1, task.ID).Scan(&asset1ID); err != nil {
		t.Fatal(err)
	}
	if err := d.QueryRow(`INSERT INTO assets(type,domain,root_domain,task_ids) VALUES('subdomain',$1,$1,ARRAY[$2]::bigint[]) RETURNING id`, dom2, task.ID).Scan(&asset2ID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = d.Exec(`DELETE FROM assets WHERE id IN ($1,$2)`, asset1ID, asset2ID)
	})

	if _, err := ts.AddConstraint("deny", "stay within test scope", "human"); err != nil {
		t.Fatal(err)
	}

	p1Map := map[string]any{"summary": "inspect alpha auth", "asset_ids": []int64{asset1ID}}
	p2Map := map[string]any{"summary": "inspect beta checkout", "asset_ids": []int64{asset2ID}}
	i1ID, err := ts.AddNode("intent", p1Map, 0, "running", "planner", nil)
	if err != nil {
		t.Fatal(err)
	}
	i2ID, err := ts.AddNode("intent", p2Map, 0, "running", "planner", nil)
	if err != nil {
		t.Fatal(err)
	}
	raw1, _ := json.Marshal(p1Map)
	raw2, _ := json.Marshal(p2Map)
	intent1 := &db.Node{ID: i1ID, Payload: raw1}
	intent2 := &db.Node{ID: i2ID, Payload: raw2}

	// Inject a global deferred MCP name so the deferred block is exercised end-to-end.
	prevAugment := ToolAugment()
	SetToolAugment(func(_ context.Context, _ string) ([]actool.CoreTool, DeferredInfo, func()) {
		return nil, DeferredInfo{
			GlobalNames: []string{"mcp__demo__scanner"},
		}, func() {}
	})
	t.Cleanup(func() { SetToolAugment(prevAugment) })

	workDir := t.TempDir()
	runWorker := func(intent *db.Node, lessons string) llm.CompletionRequest {
		t.Helper()
		prov := &captureReqProvider{}
		w := NewWorker(prov, "test-model", workDir, nil, 0, 2)
		w.SetProxy("127.0.0.1:8788", "/ca.pem")
		w.SetLessonsBlock(lessons)
		if _, _, err := w.Execute(t.Context(), "work#1", task.ID, as, ts, intent, passHooks{}, nil, nil, nil); err != nil {
			t.Fatalf("Worker.Execute(intent=%d): %v", intent.ID, err)
		}
		return prov.last()
	}

	// 1. Flag OFF (default): legacy segments and boundary. With a global deferred
	// tool block, deferredSystem emits [sysText, deferredBlock] with boundary=2,
	// and norma's UntrustedOutputBoundary (on by default) appends its fixed note as
	// System[2], giving len=3 and boundary=2.
	t.Setenv(CachePrefixEnv, "")
	req1Off := runWorker(intent1, "")
	req2Off := runWorker(intent2, "")
	if req1Off.DynamicBoundary != 2 || len(req1Off.System) != 3 {
		t.Fatalf("flag off worker 1: boundary=%d len=%d, want 2/3", req1Off.DynamicBoundary, len(req1Off.System))
	}
	if req1Off.System[0] == req2Off.System[0] {
		t.Fatalf("expected flag-off worker system[0] to differ because runDir/intent are inside it")
	}

	// 2. Flag ON: static prefix identical across sibling workers, dynamic differs,
	// visible text byte-identical, tools unchanged, deferred block inside dynamic,
	// norma's appended untrusted-output note preserved as System[2].
	t.Setenv(CachePrefixEnv, "1")
	req1On := runWorker(intent1, "")
	req2On := runWorker(intent2, "")

	if req1On.DynamicBoundary != 1 || req2On.DynamicBoundary != 1 || len(req1On.System) != 3 || len(req2On.System) != 3 {
		t.Fatalf("flag on shape: w1=(%d,%d) w2=(%d,%d), want (1,3)",
			req1On.DynamicBoundary, len(req1On.System), req2On.DynamicBoundary, len(req2On.System))
	}
	if req1On.System[2] != req1Off.System[2] || req2On.System[2] != req2Off.System[2] {
		t.Fatalf("norma untrusted-output note segment changed under ARTEX_CACHE_PREFIX=1")
	}
	if req1On.System[0] != req2On.System[0] {
		t.Fatalf("flag on static prefix differs between sibling workers")
	}
	if req1On.System[1] == req2On.System[1] {
		t.Fatalf("flag on dynamic suffix should differ between sibling workers")
	}

	runDir1 := filepath.Join(workDir, "tasks", fmt.Sprint(task.ID), fmt.Sprintf("i%d", intent1.ID))
	runDir2 := filepath.Join(workDir, "tasks", fmt.Sprint(task.ID), fmt.Sprintf("i%d", intent2.ID))
	for _, pair := range []struct {
		name   string
		req    llm.CompletionRequest
		runDir string
		intent string
		domain string
	}{
		{"worker1", req1On, runDir1, "inspect alpha auth", dom1},
		{"worker2", req2On, runDir2, "inspect beta checkout", dom2},
	} {
		for _, needle := range []string{pair.runDir, pair.intent, "stay within test scope", "Start executing the intent above:", "<available-deferred-tools>", "mcp__demo__scanner"} {
			if !strings.Contains(pair.req.System[1], needle) {
				t.Errorf("%s dynamic segment missing %q", pair.name, needle)
			}
			if strings.Contains(pair.req.System[0], needle) {
				t.Errorf("%s static segment unexpectedly contains %q", pair.name, needle)
			}
		}
		// Intent assets moved to the framed launch user message (#124 P4.3) so target-controlled
		// fields never appear unframed in the worker system prompt.
		if strings.Contains(pair.req.System[0], pair.domain) || strings.Contains(pair.req.System[1], pair.domain) {
			t.Errorf("%s system prompt unexpectedly contains target asset domain %q", pair.name, pair.domain)
		}
		rawMsgs, _ := json.Marshal(pair.req.Messages)
		userMsg := string(rawMsgs)
		if !strings.Contains(userMsg, pair.domain) || !strings.Contains(userMsg, "field=intent_assets]]") {
			t.Errorf("%s launch user message missing framed intent_assets for %q", pair.name, pair.domain)
		}
	}

	if strings.Join(req1On.System, "\n\n") != strings.Join(req1Off.System, "\n\n") {
		t.Fatalf("worker 1 visible prompt changed under ARTEX_CACHE_PREFIX=1")
	}
	if strings.Join(req2On.System, "\n\n") != strings.Join(req2Off.System, "\n\n") {
		t.Fatalf("worker 2 visible prompt changed under ARTEX_CACHE_PREFIX=1")
	}

	// With RSI lessons enabled (framed with a per-run random nonce), lessons stay in
	// System[1] so System[0] remains byte-identical across sibling workers.
	const sampleLessons = "- [positive, 1 evidence] sqli: verified"
	req1Lessons := runWorker(intent1, sampleLessons)
	req2Lessons := runWorker(intent2, sampleLessons)
	if req1Lessons.System[0] != req1On.System[0] || req2Lessons.System[0] != req1On.System[0] {
		t.Fatalf("lessons block leaked into static prefix")
	}
	if !strings.Contains(req1Lessons.System[1], sampleLessons) || !strings.Contains(req2Lessons.System[1], sampleLessons) {
		t.Fatalf("lessons block missing from dynamic segment")
	}

	toolsOffJSON, _ := json.Marshal(req1Off.Tools)
	toolsOnJSON, _ := json.Marshal(req1On.Tools)
	if string(toolsOnJSON) != string(toolsOffJSON) {
		t.Fatalf("tools changed under ARTEX_CACHE_PREFIX=1")
	}

	// Telemetry observes non-zero static & dynamic split with identical static bytes.
	m1 := llmrec.MeasureContext(req1On)
	m2 := llmrec.MeasureContext(req2On)
	if m1.SystemStaticBytes <= 0 || m1.SystemDynamicBytes <= 0 || m1.SystemStaticBytes != m2.SystemStaticBytes {
		t.Fatalf("MeasureContext mismatch: m1=(%d,%d) m2=(%d,%d)",
			m1.SystemStaticBytes, m1.SystemDynamicBytes, m2.SystemStaticBytes, m2.SystemDynamicBytes)
	}

	// 3. Planner and mainagent are completely unchanged by ARTEX_CACHE_PREFIX=1.
	runPlanner := func() llm.CompletionRequest {
		prov := &captureReqProvider{}
		if _, _, err := NewPlanner(prov, "test-model", workDir, nil, 0, 2).Plan(t.Context(), task.ID, as, ts, "goal", nil, passHooks{}, nil); err != nil {
			t.Fatal(err)
		}
		return prov.last()
	}
	runMain := func() llm.CompletionRequest {
		prov := &captureReqProvider{}
		if _, err := NewMainAgent(prov, "test-model", workDir, nil, 0, 2).Chat(t.Context(), task.ID, 0, as, ts, "goal", "status?", passHooks{}, nil, nil, nil, nil, nil); err != nil {
			t.Fatal(err)
		}
		return prov.last()
	}

	t.Setenv(CachePrefixEnv, "")
	planOff := runPlanner()
	mainOff := runMain()
	t.Setenv(CachePrefixEnv, "1")
	planOn := runPlanner()
	mainOn := runMain()

	if planOn.DynamicBoundary != planOff.DynamicBoundary || !slices.Equal(planOn.System, planOff.System) {
		t.Fatalf("planner changed under ARTEX_CACHE_PREFIX=1: off=(%d,len=%d) on=(%d,len=%d)",
			planOff.DynamicBoundary, len(planOff.System), planOn.DynamicBoundary, len(planOn.System))
	}
	if mainOn.DynamicBoundary != mainOff.DynamicBoundary || !slices.Equal(mainOn.System, mainOff.System) {
		t.Fatalf("mainagent changed under ARTEX_CACHE_PREFIX=1: off=(%d,len=%d) on=(%d,len=%d)",
			mainOff.DynamicBoundary, len(mainOff.System), mainOn.DynamicBoundary, len(mainOn.System))
	}
}
