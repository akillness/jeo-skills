package agent

import (
	"context"
	"errors"
	"fmt"
)

// AbortCause names why an agent run's context was cancelled. Every cancellation
// site should attach one so the activity trace can report the real initiator.
type AbortCause struct {
	Code  string
	Short string
	Text  string
}

func (c *AbortCause) Error() string { return c.Text }

func cause(code, short, text string) *AbortCause {
	return &AbortCause{Code: code, Short: short, Text: text}
}

// Causef builds a cause that includes runtime-specific detail.
func Causef(code, short, format string, args ...any) *AbortCause {
	return &AbortCause{Code: code, Short: short, Text: fmt.Sprintf(format, args...)}
}

var (
	// Task-level execution context.
	AbortPausedByUser = cause("paused_by_user", "The user paused the task",
		"The user paused the task via the task control API (POST /api/tasks/{id}/control, action=pause). This Planner/Worker run was actively cancelled; running intents return to frontier(open) and are re-claimed and executed from scratch after the task resumes")
	AbortPausedByOrchestrator = cause("paused_by_orchestrator", "The orchestrating agent paused the task",
		"The orchestrating agent called the pause_task tool to pause this task. This Planner/Worker run was actively cancelled; running intents return to frontier(open) and are executed again after resuming")
	AbortTaskDeleted = cause("task_deleted", "The task was deleted",
		"The task is being deleted (DELETE /api/tasks/{id}); the deletion barrier has cancelled the task's running Planner, Worker, and main agent; this run's results will not be used")
	AbortPausedOnReload = cause("paused_on_reload", "Restored the paused state on startup",
		"On startup the backend restored the task pause from the state persisted in the database. This run was cancelled; normally no agent is running during the restore phase")
	AbortGoalMet = cause("goal_met", "The planner judged the task goals met",
		"The planner judged the task goals met and set the task to done, then cancelled the Workers still running; these intents are marked stopped, not failed")
	AbortSettleDrainTimeout = cause("settle_drain_timeout", "Task timeout wrap-up wait expired",
		"After the task hit timeout it waited for running Workers to wrap up gracefully, but the 90-second drain grace was still not enough, so a hard cancel was performed; intents are marked exhausted, and facts and assets already written during wrap-up are kept")

	// Per-work context.
	AbortKilledByPlanner = cause("killed_by_planner", "The planner terminated this intent",
		"The planner actively terminated this intent via kill_work, usually meaning the direction went off track or is no longer worth pursuing; the intent is marked stopped and is not automatically re-claimed")
	AbortWorkPausedByUser = cause("work_paused_by_user", "The user paused this Worker intent",
		"The user paused a running Worker. This call was cancelled and the intent turned paused; all recorded intents, facts, vulnerabilities, and activity records are kept, and execution restarts from scratch after resuming")
	AbortWorkCancelledByUser = cause("work_cancelled_by_user", "The user deleted this Worker intent",
		"The user deleted a running Worker. This call was cancelled; after the Worker exits the write area, the server handles the intent per the user-chosen deletion mode — soft delete only marks it deleted and keeps all outputs, hard delete cascades to remove the intent and the downstream nodes supported only by it")
	AbortWorkClaimLost = cause("work_claim_lost", "Another Worker took this intent over",
		"This Worker's claim on the intent expired (no heartbeat reached the database within the claim TTL) and another Worker took the intent over, so its heartbeat was rejected. This run was cancelled and its result is discarded; the intent now belongs to the new claimer")
	AbortWorkFinished = cause("work_finished", "Worker finished normally, context freed",
		"The Worker finished normally, and the engine released its context resources in detachWork. This is not an interruption; if it appears in an interruption message, the cancel and finish events raced")
	AbortPausedRaceGuard = cause("paused_race_guard", "Refused a new run while task is paused",
		"While the task is paused, the engine refuses to issue a new execution context, preventing a race between claim and pause from letting a Worker keep starting; already-claimed intents return to frontier")

	// Main Agent and standalone conversation contexts.
	AbortChatStoppedByUser = cause("chat_stopped_by_user", "The user stopped this conversation turn",
		"The user clicked stop, actively aborting this main agent or conversation agent run. Activity records already produced are kept, and you can continue sending the next message")
	AbortChatPausedWithTask = cause("chat_paused_with_task", "Task pause aborted the main agent chat",
		"When the user paused the task, the running main agent conversation was cancelled along with it. Activity records already produced are kept; this turn's messages are not automatically replayed after the task resumes")
	AbortChatTurnFinished = cause("chat_turn_finished", "Turn finished normally; context released",
		"This conversation turn finished normally, and the server is releasing that turn's context resources. This is not an interruption; if it appears in an interruption message, the cancel and finish events raced")

	// Process-level and per-run hard backstop.
	AbortShutdown = cause("shutdown", "The backend process is shutting down",
		"The backend process received SIGINT or SIGTERM and is restarting, updating, or shutting down. All running agents are cancelled; after restart, leftover running intents are reset to open and executed again")
	AbortRunHardTimeout = cause("run_hard_timeout", "The per-run hard timeout backstop fired",
		"A single run exceeded the soft wall-clock budget plus the extra grace, meaning a model request or a tool did not return for a long time, so normal turn-boundary wrap-up could not run. Focus on the last unreturned tool call before the interruption")
)

// AbortReason resolves the named cause attached to a cancelled run context.
func AbortReason(ctx context.Context) (code, short, text string, ok bool) {
	c := context.Cause(ctx)
	if c == nil {
		return "", "", "", false
	}
	var ac *AbortCause
	if errors.As(c, &ac) {
		return ac.Code, ac.Short, ac.Text, true
	}
	switch {
	case errors.Is(c, context.DeadlineExceeded):
		return "deadline_exceeded", "The upstream context reached its deadline",
			"The upstream context reached its deadline, but the setter did not attach a named reason via WithTimeoutCause: " + c.Error(), true
	case errors.Is(c, context.Canceled):
		return "canceled_no_cause", "The canceller did not attach a named reason",
			"The upstream context was cancelled, but the canceller did not attach a named reason via context.WithCancelCause; please register the reason in agent/cancelcause.go and wire it into that cancellation point", true
	default:
		return "other", firstLine(c.Error(), 80), c.Error(), true
	}
}
