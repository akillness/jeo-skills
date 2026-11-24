package server

import (
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
)

// Server-side resolution of the retry policy; see docs/llm-retry-design.md. Of the five layers:
//   - connect / empty response / same-provider safe window "follow the endpoint": every LLM
//     profile can override the global default (an empty profile field inherits the global; if the global is unset too, the built-in default applies);
//   - circuit breaker / intent re-run are process-wide — there is only one global copy.
//
// The global policy reads one settings row from the DB; its call sites are all on low-frequency
// paths (building providers, work wrap-up, saving profiles), so another cache layer is not worth
// it. Circuit-breaker parameters are the exception — they are read on every failure path, so applyRetryPolicy pushes them into the Registry.

// retryPolicy reads the global policy; a nil DB yields the zero policy (all
// layers on their built-in defaults).
func (s *Server) retryPolicy() db.LLMRetryPolicy {
	if s.m == nil || s.m.pg == nil {
		return db.LLMRetryPolicy{}
	}
	return s.m.pg.LLMRetryPolicy()
}

// resolveRetry layers one profile's override on top of the global policy and
// converts the result into the form agent.Config carries. Rules combine field by
// field, so a profile that only pins an interval still inherits the global count.
func resolveRetry(o db.RetryOverride, pol db.LLMRetryPolicy) agent.RetryConfig {
	connect := o.Connect.Or(pol.Connect)
	empty := o.Empty.Or(pol.Empty)
	stream := o.Stream.Or(pol.Stream)
	return agent.RetryConfig{
		// The counts keep their raw "0=default / negative=off" semantics here: the
		// SDK's MaxRetries / EmptyResponseRetries are fully isomorphic to this — let it parse them itself.
		ConnectAttempts: connect.Attempts, ConnectInterval: connect.Interval(),
		EmptyAttempts: empty.Attempts, EmptyInterval: empty.Interval(),
		StreamAttempts: stream.Attempts, StreamInterval: stream.Interval(),
	}
}

// applyProfileRetry fills cfg.Retry for a profile read from the DB.
func (s *Server) applyProfileRetry(cfg *agent.Config, p *db.LLMProfile) {
	if p == nil {
		return
	}
	cfg.Retry = resolveRetry(p.Retry, s.retryPolicy())
}

// Defaults for circuit breaking (pool cool-down), identical to the llmpool built-ins — overridden here only when the user has set a value.
// Intent re-run defaults are engine.go's modelErrorRetries / modelErrorRetryBackoff.

// applyRetryPolicy pushes the process-wide layers of the policy into the objects
// that consume them on a hot path: the circuit-breaker registry. Called at
// startup and whenever the policy is saved.
func (s *Server) applyRetryPolicy() {
	pol := s.retryPolicy()
	if s.llmHealth != nil {
		s.llmHealth.SetPolicy(pol.Breaker.Attempts, pol.Breaker.Interval())
	}
}

// modelErrorRetryPolicy resolves the intent-level replay knobs (layer ⑤): how
// many times a model_error work is re-run and how long to back off between runs.
func (e *Engine) modelErrorRetryPolicy() (retries int, backoff time.Duration) {
	retries, backoff = modelErrorRetries, modelErrorRetryBackoff
	if e == nil || e.m == nil || e.m.pg == nil {
		return retries, backoff
	}
	rule := e.m.pg.LLMRetryPolicy().Intent
	if rule.Attempts != 0 {
		retries = max(rule.Attempts, 0)
	}
	if d := rule.Interval(); d > 0 {
		backoff = d
	}
	return retries, backoff
}

// emptyTurnNudgeLimit resolves how many empty-turn continuations one work may
// inject (see steerHooks.Stop). It deliberately reuses layer ②'s knob — "empty-response
// retry count": the two are two means to the same end. The SDK layer handles "not a single
// content block" by resending the very same request; this one handles "only thinking, neither
// body nor tools" by appending an instruction so the model continues from its existing thinking
// (a verbatim resend is pointless for an idle turn dictated by the shape of the context). The
// emptiness criteria differ because the SDK goes by "has any event been yielded", and thinking
// increments are themselves events — but a user configuring "how many empty-response retries" means "retry once more when the model produced nothing substantive", so sharing one count across both layers matches that mental model.
//
// Reads the global policy rather than a profile's override: a run may switch profiles
// mid-way due to failover, while this is the total gate for the whole intent and must not change with the endpoint. Semantics mirror the SDK's emptyRetries():
// 0 = the default defaultEmptyTurnNudges; -1 (negative) = disable idle-turn continuation; >0 = use that value.
func (e *Engine) emptyTurnNudgeLimit() int {
	if e == nil || e.m == nil || e.m.pg == nil {
		return defaultEmptyTurnNudges
	}
	switch n := e.m.pg.LLMRetryPolicy().Empty.Attempts; {
	case n == 0:
		return defaultEmptyTurnNudges
	case n < 0:
		return 0
	default:
		return n
	}
}
