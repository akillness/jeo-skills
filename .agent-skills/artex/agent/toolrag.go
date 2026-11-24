package agent

import (
	"context"
	"fmt"
	"log"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"unicode"

	actool "github.com/Autumn-27/norma/tool"
)

// Tool RAG: a lexical PROJECTION of an agent's already-bound tool list. It runs in
// AugmentTools after ToolResolve (binding + enabled filters), so it only ever
// removes tools from that list: it cannot add an unbound or disabled tool, never
// rewrites a description or schema, and never reads the database. Off by default.

const (
	toolRAGEnv        = "ARTEX_TOOL_RAG"      // "1"/"true"/"on"/"yes" enables; anything else (incl. unset) = off
	toolRAGTopKEnv    = "ARTEX_TOOL_RAG_TOPK" // non-core tools kept; default toolRAGDefaultK
	toolRAGDefaultK   = 12
	toolRAGMinCatalog = 20 // smaller catalogs are passed through whole
)

// toolRAGCore is always kept when bound and never counts against k.
var toolRAGCore = map[string]bool{
	"record_fact": true, "insert_assets": true, "report_finding": true, "list_findings": true,
	"graph_overview": true, "node_detail": true, "add_intent": true, "steer_work": true,
	"ask_operator": true, "prove_goal": true, "goal_met": true, "list_assets": true,
}

type toolQueryKey struct{}

// WithToolQuery attaches the retrieval query (goal + current intent/round summary)
// read by AugmentTools. No query = no projection.
func WithToolQuery(ctx context.Context, q string) context.Context {
	return context.WithValue(ctx, toolQueryKey{}, q)
}

// ToolScorer returns one relevance score per tool (same order as tools); higher is
// more relevant. It must be pure: no network, no database.
type ToolScorer func(query string, tools []actool.CoreTool) ([]float64, error)

// projectTools keeps the tools in keep (core / harness / deferred names) plus the
// k best-scoring other tools, preserving the input order. It falls back to the full
// list (projected=false) on an empty query, a catalog under toolRAGMinCatalog, or a
// scorer error.
func projectTools(query string, tools []actool.CoreTool, keep map[string]bool, k int, score ToolScorer) (out []actool.CoreTool, projected bool, err error) {
	if strings.TrimSpace(query) == "" || len(tools) < toolRAGMinCatalog {
		return tools, false, nil
	}
	var cands []actool.CoreTool
	for _, t := range tools {
		if !keep[t.Name()] {
			cands = append(cands, t)
		}
	}
	ranked, err := rankTools(query, cands, score)
	if err != nil {
		return tools, false, err
	}
	sel := map[string]bool{}
	for i := 0; i < len(ranked) && i < k; i++ {
		sel[ranked[i].Name()] = true
	}
	for _, t := range tools {
		if keep[t.Name()] || sel[t.Name()] {
			out = append(out, t)
		}
	}
	return out, true, nil
}

// rankTools orders tools by score descending, ties broken by name ascending.
func rankTools(query string, tools []actool.CoreTool, score ToolScorer) ([]actool.CoreTool, error) {
	scores, err := score(query, tools)
	if err == nil && len(scores) != len(tools) {
		err = fmt.Errorf("scorer returned %d scores for %d tools", len(scores), len(tools))
	}
	if err != nil {
		return nil, err
	}
	idx := make([]int, len(tools))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool {
		if sa, sb := scores[idx[a]], scores[idx[b]]; sa != sb {
			return sa > sb
		}
		return tools[idx[a]].Name() < tools[idx[b]].Name()
	})
	out := make([]actool.CoreTool, len(idx))
	for i, j := range idx {
		out[i] = tools[j]
	}
	return out, nil
}

// bm25Score is the default ToolScorer: Okapi BM25 (k1=1.2, b=0.75) over each tool's
// name + description + parameter names, IDF computed across the candidate set.
func bm25Score(query string, tools []actool.CoreTool) ([]float64, error) {
	const k1, b = 1.2, 0.75
	docs := make([]map[string]int, len(tools))
	lens := make([]float64, len(tools))
	df := map[string]int{}
	var total float64
	for i, t := range tools {
		text := t.Name() + " " + t.Description()
		if props, ok := t.InputSchema()["properties"].(map[string]any); ok {
			for p := range props {
				text += " " + p
			}
		}
		tf := map[string]int{}
		for _, w := range tokenize(text) {
			tf[w]++
			lens[i]++
		}
		for w := range tf {
			df[w]++
		}
		docs[i], total = tf, total+lens[i]
	}
	scores := make([]float64, len(tools))
	n := float64(len(tools))
	avg, seen := math.Max(total/math.Max(n, 1), 1), map[string]bool{}
	for _, q := range tokenize(query) {
		if seen[q] || df[q] == 0 {
			continue
		}
		seen[q] = true
		idf := math.Log(1 + (n-float64(df[q])+0.5)/(float64(df[q])+0.5))
		for i, tf := range docs {
			if f := float64(tf[q]); f > 0 {
				scores[i] += idf * f * (k1 + 1) / (f + k1*(1-b+b*lens[i]/avg))
			}
		}
	}
	return scores, nil
}

// tokenize lowercases and splits on non-alphanumerics ("sql_injection" → sql, injection).
func tokenize(s string) []string {
	return strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}

// toolRAGKeep: names never hidden by the projection — the core set, the harness
// tools every agent relies on (file/shell tools, interactive shell, Skill
// meta-tool), and deferred tools (schemas already withheld; dropping them would
// desync the deferred block and the skill unlock gate).
func toolRAGKeep(deferred []string) map[string]bool {
	keep := map[string]bool{"Skill": true}
	for n := range toolRAGCore {
		keep[n] = true
	}
	for _, t := range append(actool.DefaultTools(), actool.ShellSessionTools()...) {
		keep[t.Name()] = true
	}
	for _, n := range deferred {
		keep[n] = true
	}
	return keep
}

// applyToolRAG is the AugmentTools hook. Off unless ARTEX_TOOL_RAG is enabled.
func applyToolRAG(ctx context.Context, agentKey string, tools []actool.CoreTool, deferred []string, score ToolScorer) []actool.CoreTool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(toolRAGEnv))) {
	case "1", "true", "on", "yes":
	default:
		return tools
	}
	k, kerr := strconv.Atoi(strings.TrimSpace(os.Getenv(toolRAGTopKEnv)))
	if kerr != nil || k <= 0 {
		k = toolRAGDefaultK
	}
	query, _ := ctx.Value(toolQueryKey{}).(string)
	out, projected, err := projectTools(query, tools, toolRAGKeep(deferred), k, score)
	if err != nil {
		log.Printf("[tool-rag] %s: scoring failed, using full catalog (%d tools): %v", agentKey, len(tools), err)
	} else if !projected {
		log.Printf("[tool-rag] %s: full catalog (%d tools; empty query or under %d)", agentKey, len(tools), toolRAGMinCatalog)
	} else {
		names := make([]string, len(out))
		for i, t := range out {
			names[i] = t.Name()
		}
		log.Printf("[tool-rag] %s: selected %d/%d tools: %s", agentKey, len(out), len(tools), strings.Join(names, ", "))
	}
	return out
}
