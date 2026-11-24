package llmrec

import (
	"encoding/json"
	"log"
	"os"
	"strings"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/norma/llm"
)

// ContextTelemetryEnv switches per-call context size telemetry into llm_context.
//
// ON by default. Measurement: on the test bench, 15 runs left llm_context EMPTY
// (0 rows) because the flag was off by default, so the worker's context size was
// discussed from the task's total tokens, not from a breakdown (2026-11-22).
// Cost: one row per model call plus length counts; no content is stored (up to about
// 300 calls per run in the bench logs, so up to about 300 rows).
// Explicit off switch: ARTEX_CONTEXT_TELEMETRY=0|false|off|no.
const ContextTelemetryEnv = "ARTEX_CONTEXT_TELEMETRY"

// ContextTelemetryEnabled reports whether context telemetry is on. Default true;
// only an explicit falsy value (0, false, off, no; case-insensitive) turns it off.
func ContextTelemetryEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(ContextTelemetryEnv))) {
	case "0", "false", "off", "no":
		return false
	}
	return true
}

// ContextMetrics holds size-only measurements of an assembled CompletionRequest
// as it leaves for the provider. Never retains any prompt, tool, or message
// content.
type ContextMetrics struct {
	ToolCount              int
	MessageCount           int
	SystemStaticBytes      int64
	SystemDynamicBytes     int64
	ToolsBytes             int64
	MessagesUserBytes      int64
	MessagesAssistantBytes int64
	MessagesOtherBytes     int64
	ToolResultBytes        int64
	LastMessageBytes       int64
}

// MeasureContext computes deterministic byte sizes and counts for req without
// retaining any content:
//
//   - System: when DynamicBoundary > 0, req.System is split at
//     min(DynamicBoundary, len(req.System)) into SystemStaticBytes ([:b]) and
//     SystemDynamicBytes ([b:]). Within each slice, each segment is trimmed with
//     strings.TrimSpace, empty segments are dropped, and remaining segments are
//     joined with "\n\n", matching norma's llm.joinSystem. When
//     DynamicBoundary <= 0, the whole req.System is measured as a single static
//     block (SystemStaticBytes) and SystemDynamicBytes is 0.
//   - Tools: ToolCount = len(req.Tools); ToolsBytes = len(json.Marshal(req.Tools))
//     (0 when no tools). Go's encoding/json sorts map keys deterministically.
//   - Messages: MessageCount = len(req.Messages). Each message is measured by
//     len(json.Marshal(msg)) and summed into MessagesUserBytes (role "user"),
//     MessagesAssistantBytes (role "assistant"), or MessagesOtherBytes (any
//     other role). ToolResultBytes records the serialized size of tool_result
//     content blocks inside messages as an informational subset (not added to
//     the partition denominator). LastMessageBytes is the serialized byte size
//     of the final message (0 when no messages).
func MeasureContext(req llm.CompletionRequest) ContextMetrics {
	var m ContextMetrics

	// 1. System prompt bytes (split at DynamicBoundary when > 0, else single static block).
	if len(req.System) > 0 {
		if req.DynamicBoundary > 0 {
			b := req.DynamicBoundary
			if b > len(req.System) {
				b = len(req.System)
			}
			m.SystemStaticBytes = joinedSegmentBytes(req.System[:b])
			m.SystemDynamicBytes = joinedSegmentBytes(req.System[b:])
		} else {
			m.SystemStaticBytes = joinedSegmentBytes(req.System)
		}
	}

	// 2. Serialized tool schemas and count.
	m.ToolCount = len(req.Tools)
	if len(req.Tools) > 0 {
		if b, err := json.Marshal(req.Tools); err == nil {
			m.ToolsBytes = int64(len(b))
		}
	}

	// 3. Messages by role, tool_result subset, and last message size.
	m.MessageCount = len(req.Messages)
	for i, msg := range req.Messages {
		var msgBytes int64
		if b, err := json.Marshal(msg); err == nil {
			msgBytes = int64(len(b))
		}
		switch msg.Role {
		case llm.RoleUser:
			m.MessagesUserBytes += msgBytes
		case llm.RoleAssistant:
			m.MessagesAssistantBytes += msgBytes
		default:
			m.MessagesOtherBytes += msgBytes
		}
		if i == len(req.Messages)-1 {
			m.LastMessageBytes = msgBytes
		}
		for _, blk := range msg.Content {
			if blk.Type == llm.BlockToolResult {
				if b, err := json.Marshal(blk); err == nil {
					m.ToolResultBytes += int64(len(b))
				}
			}
		}
	}

	return m
}

// joinedSegmentBytes returns the byte length of segs after trimming whitespace
// from each segment, dropping empty segments, and joining the remaining ones
// with "\n\n" — matching norma's llm.joinSystem without allocating a joined
// string.
func joinedSegmentBytes(segs []string) int64 {
	var total int64
	nonEmpty := 0
	for _, s := range segs {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if nonEmpty > 0 {
			total += 2 // "\n\n"
		}
		total += int64(len(s))
		nonEmpty++
	}
	return total
}

// recordContext appends one row to llm_context when r.pg is configured.
// Best-effort: logs and continues on error so telemetry never disrupts calls.
func (r *Recorder) recordContext(taskID, worker string, m ContextMetrics, usage llm.Usage, status string) {
	if r.pg == nil {
		return
	}
	err := r.pg.InsertLLMContext(&db.LLMContext{
		TaskID:                 taskID,
		Worker:                 worker,
		Model:                  r.model,
		Profile:                r.prof,
		ToolCount:              m.ToolCount,
		MessageCount:           m.MessageCount,
		SystemStaticBytes:      m.SystemStaticBytes,
		SystemDynamicBytes:     m.SystemDynamicBytes,
		ToolsBytes:             m.ToolsBytes,
		MessagesUserBytes:      m.MessagesUserBytes,
		MessagesAssistantBytes: m.MessagesAssistantBytes,
		MessagesOtherBytes:     m.MessagesOtherBytes,
		ToolResultBytes:        m.ToolResultBytes,
		LastMessageBytes:       m.LastMessageBytes,
		InputTokens:            usage.InputTokens,
		OutputTokens:           usage.OutputTokens,
		CacheRead:              usage.CacheReadTokens,
		CacheWrite:             usage.CacheWriteTokens,
		Status:                 status,
	})
	if err != nil {
		log.Printf("[llmcontext] insert: %v", err)
	}
}
