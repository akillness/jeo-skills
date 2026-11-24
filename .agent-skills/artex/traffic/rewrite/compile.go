package rewrite

import (
	"sort"
	"sync"
	"time"
)

// Options configure a compiled Set.
type Options struct {
	// TraceKey is the instance sub-key of the sensitive-value fingerprint.
	// Empty: sensitive values get no fingerprint at all.
	TraceKey []byte
	// Errors receives the run-time rule errors. Pass the same log to every
	// Compile so the entries survive a reload. Nil: errors are not kept.
	Errors *ErrorLog
}

// Set is an immutable snapshot of the enabled rules, compiled and in execution
// order: priority ascending, then id ascending, so the highest priority applies
// last. A nil *Set holds no rule.
type Set struct {
	request, response []*compiledRule
	loadErrors        map[int64]string
	traceKey          []byte
	errors            *ErrorLog
}

// Compile builds the snapshot of the enabled rules. An enabled rule that fails
// validation is left out and reported by LoadErrors.
func Compile(rules []Rule, opts Options) *Set {
	s := &Set{loadErrors: map[int64]string{}, traceKey: opts.TraceKey, errors: opts.Errors}
	enabled := make([]Rule, 0, len(rules))
	for _, r := range rules {
		if r.Enabled {
			enabled = append(enabled, r)
		}
	}
	sort.SliceStable(enabled, func(i, j int) bool {
		if enabled[i].Priority != enabled[j].Priority {
			return enabled[i].Priority < enabled[j].Priority
		}
		return enabled[i].ID < enabled[j].ID
	})
	for _, r := range enabled {
		c, err := compileRule(r)
		switch {
		case err != nil:
			s.loadErrors[r.ID] = err.Error()
		case r.Phase == PhaseRequest:
			s.request = append(s.request, c)
		default:
			s.response = append(s.response, c)
		}
	}
	return s
}

// Len is the number of rules the snapshot runs in a phase.
func (s *Set) Len(phase Phase) int {
	if s == nil {
		return 0
	}
	return len(s.rules(phase))
}

func (s *Set) rules(phase Phase) []*compiledRule {
	if phase == PhaseRequest {
		return s.request
	}
	return s.response
}

// LoadErrors maps the id of each enabled rule left out of the snapshot to the
// reason. The map must not be modified.
func (s *Set) LoadErrors() map[int64]string {
	if s == nil {
		return nil
	}
	return s.loadErrors
}

// NoteError records a run-time error of a rule seen outside the engine, such
// as the transport failure of a request the rule rewrote.
func (s *Set) NoteError(id int64, class string) {
	if s != nil {
		s.errors.record(id, class)
	}
}

// LastError is the most recent run-time error of a rule. It lives in memory
// only; the per-exchange trace keeps the history.
type LastError struct {
	Class string    `json:"class"`
	At    time.Time `json:"at"`
	Count int64     `json:"count"`
}

// ErrorLog keeps the last run-time error of each rule. The zero value is ready
// to use.
type ErrorLog struct {
	mu sync.Mutex
	m  map[int64]LastError
}

func (l *ErrorLog) record(id int64, class string) {
	if l == nil {
		return
	}
	l.mu.Lock()
	if l.m == nil {
		l.m = map[int64]LastError{}
	}
	l.m[id] = LastError{Class: class, At: time.Now(), Count: l.m[id].Count + 1}
	l.mu.Unlock()
}

// Get returns the last error of a rule, ok=false when it has none.
func (l *ErrorLog) Get(id int64) (LastError, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	e, ok := l.m[id]
	return e, ok
}

// Forget drops the entry of a rule that was edited or deleted.
func (l *ErrorLog) Forget(id int64) {
	l.mu.Lock()
	delete(l.m, id)
	l.mu.Unlock()
}
