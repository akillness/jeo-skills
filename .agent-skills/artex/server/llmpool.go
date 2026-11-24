package server

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/Autumn-27/artex/agent"
	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/llmpool"
	"github.com/Autumn-27/norma/llm"
)

// Server-side wiring for LLM pooling (failover). Design: docs/llm-polling-design.md:
//   - Only the global active-profile path pools (agent unbound, task not pinned);
//   - Bound/pinned paths own that profile exclusively by default: a failure is a failure (llm_pool_bind_fallback can turn on the fallback);
//   - Chain order = active profile → the rest by priority DESC, excluding pool_exclude ones;
//   - Circuit-breaker state is process-wide (s.llmHealth); rebuilding the pool does not clear it.

// newLLMHealthRegistry builds the process-wide circuit-breaker registry, mirroring
// state into PG so a cooling-off window survives a restart. Writes are async.
// The in-memory copy is authoritative. The returned syncer is nil when there is
// no database; otherwise it flushes when ctx is cancelled.
func newLLMHealthRegistry(ctx context.Context, pg *db.DB) (*llmpool.Registry, *healthSync) {
	if pg == nil {
		return llmpool.NewRegistry(nil, nil), nil
	}
	syncer := newHealthSync(ctx, pg.SaveLLMHealth, pg.ClearLLMHealth)
	persist := func(id int64, st llmpool.State) {
		syncer.enqueue(id, healthOp{st: st})
	}
	forget := func(id int64) {
		syncer.enqueue(id, healthOp{clear: true})
	}
	reg := llmpool.NewRegistry(persist, forget)
	// Restore only windows that haven't expired (LoadLLMHealth filters), so a
	// profile that finished cooling while we were down comes back healthy.
	if rows, err := pg.LoadLLMHealth(); err == nil {
		for _, h := range rows {
			st := llmpool.State{Fails: h.Fails, Trips: h.Trips, LastError: h.LastError, LastAt: h.LastAt}
			if h.OpenUntil != nil {
				st.OpenUntil = *h.OpenUntil
			}
			reg.Restore(h.ProfileID, st)
			log.Printf("[llmpool] restored circuit-breaker state: profile #%d cooling until %s", h.ProfileID, st.OpenUntil.Format(time.RFC3339))
		}
	}
	return reg, syncer
}

// healthOp is one circuit-breaker write for a profile. clear drops the row.
// seq orders writes for that profile: a newer op wins over one still in flight.
type healthOp struct {
	seq   uint64
	clear bool
	st    llmpool.State
}

// healthSync writes circuit-breaker state from one goroutine. A newer update for
// the same profile replaces one that has not been written yet, so a burst of
// state changes becomes one database call. The database call runs without mu,
// so enqueue does not wait on a slow write. writeMu keeps those calls in order.
// Before each call, an op that is already older than the applied or pending
// sequence is dropped. save and clear must not call enqueue.
type healthSync struct {
	save       func(db.LLMHealth) error
	clear      func(int64) error
	retryAfter time.Duration // tests set a short delay; zero uses one second
	mu         sync.Mutex
	writeMu    sync.Mutex // orders database calls; enqueue does not take it
	pending    map[int64]healthOp
	applied    map[int64]uint64
	seq        uint64
	stopped    bool
	wake       chan struct{}
	done       chan struct{}
}

func newHealthSync(ctx context.Context, save func(db.LLMHealth) error, clear func(int64) error) *healthSync {
	if ctx == nil {
		ctx = context.Background()
	}
	h := &healthSync{
		save:    save,
		clear:   clear,
		pending: map[int64]healthOp{},
		applied: map[int64]uint64{},
		wake:    make(chan struct{}, 1),
		done:    make(chan struct{}),
	}
	go h.loop(ctx)
	return h
}

// FlushLLMHealth waits until the circuit-breaker writer has flushed the ops
// queued before shutdown. Call it after the server context is cancelled and
// before the database closes.
func (s *Server) FlushLLMHealth() {
	if s == nil || s.llmHealthSync == nil {
		return
	}
	select {
	case <-s.llmHealthSync.done:
	case <-time.After(5 * time.Second):
		log.Printf("[llmpool] timed out flushing circuit-breaker state")
	}
}

func (h *healthSync) enqueue(id int64, op healthOp) {
	h.mu.Lock()
	h.seq++
	op.seq = h.seq
	if h.stopped {
		h.mu.Unlock()
		if err := h.apply(id, op); err != nil {
			log.Printf("[llmpool] write circuit-breaker profile #%d: %v", id, err)
		}
		return
	}
	if prev, ok := h.pending[id]; ok && prev.seq > op.seq {
		h.mu.Unlock()
		return
	}
	h.pending[id] = op
	h.mu.Unlock()
	select {
	case h.wake <- struct{}{}:
	default:
	}
}

func (h *healthSync) take() map[int64]healthOp {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.pending) == 0 {
		return nil
	}
	out := h.pending
	h.pending = map[int64]healthOp{}
	return out
}

func (h *healthSync) restore(id int64, op healthOp) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.stopped || h.applied[id] >= op.seq {
		return
	}
	if cur, ok := h.pending[id]; ok && cur.seq >= op.seq {
		return
	}
	h.pending[id] = op
}

// superseded reports whether a newer op for id is already applied or waiting.
// The caller holds writeMu, so the decision and the database call stay in order.
func (h *healthSync) superseded(id int64, seq uint64) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if seq > 0 && h.applied[id] >= seq {
		return true
	}
	cur, ok := h.pending[id]
	return ok && cur.seq > seq
}

func (h *healthSync) apply(id int64, op healthOp) error {
	h.writeMu.Lock()
	defer h.writeMu.Unlock()
	if h.superseded(id, op.seq) {
		return nil
	}
	var err error
	if op.clear {
		if h.clear != nil {
			err = h.clear(id)
		}
	} else if h.save != nil {
		row := db.LLMHealth{ProfileID: id, Fails: op.st.Fails, Trips: op.st.Trips, LastError: op.st.LastError}
		if !op.st.OpenUntil.IsZero() {
			openUntil := op.st.OpenUntil
			row.OpenUntil = &openUntil
		}
		err = h.save(row)
	}
	if err != nil {
		return err
	}
	h.mu.Lock()
	if h.applied[id] < op.seq {
		h.applied[id] = op.seq
	}
	h.mu.Unlock()
	return nil
}

func (h *healthSync) write(batch map[int64]healthOp) (failed bool) {
	for id, op := range batch {
		if err := h.apply(id, op); err != nil {
			log.Printf("[llmpool] write circuit-breaker profile #%d: %v", id, err)
			h.restore(id, op)
			failed = true
		}
	}
	return failed
}

func (h *healthSync) finish() {
	h.mu.Lock()
	h.stopped = true
	batch := h.pending
	h.pending = map[int64]healthOp{}
	h.mu.Unlock()
	for id, op := range batch {
		if err := h.apply(id, op); err != nil {
			log.Printf("[llmpool] write circuit-breaker profile #%d: %v", id, err)
		}
	}
}

func (h *healthSync) loop(ctx context.Context) {
	defer close(h.done)
	for {
		failed := h.write(h.take())
		delay := h.retryAfter
		if delay <= 0 {
			delay = time.Second
		}
		var retry <-chan time.Time
		if failed {
			retry = time.After(delay)
		}
		select {
		case <-ctx.Done():
			h.finish()
			return
		case <-h.wake:
		case <-retry:
		}
	}
}

// poolMember builds one chain member from a profile, reusing the per-profile
// provider cache so every agent pointing at the same profile shares one provider
// (hence one rate limiter). Returns nil when the profile can't be built.
func (s *Server) poolMember(p *db.LLMProfile, rank int) *llmpool.Member {
	prov, cfg, ok := s.providerForProfile(p.ID)
	if !ok {
		return nil
	}
	return &llmpool.Member{
		ID: p.ID, Name: p.Name, Model: p.Model, Format: p.Format,
		Priority: p.Priority, Active: p.IsDefault, Rank: rank,
		// Actual window, not CompactionWindow(): that helper floors at 32K for
		// compaction math, which would let an 8K profile accept a 16K request
		// and then 400 without failover.
		WindowTokens: cfg.ContextWindowTokens(), Prov: prov,
	}
}

// poolChain reads the failover chain from the DB. headID/headProv/headCfg describe
// the member that must lead the chain — the globally active profile on the normal
// path, or an explicitly bound one when bound-profile fallback is on. The head is
// passed in (rather than resolved through the cache) so applyLLM's already-built
// provider is reused instead of duplicated.
//
// Returns nil when failover is off or the chain has fewer than two usable members
// — callers then use the bare provider, which is byte-for-byte the old behavior.
func (s *Server) poolChain(headID int64, headProv llm.Provider, headCfg agent.Config) *llmpool.Pool {
	if s.m == nil || s.m.pg == nil || !s.m.LLMPoolEnabled() {
		return nil
	}
	profs, err := s.m.pg.PoolProfiles()
	if err != nil {
		log.Printf("[llmpool] failed to read the pool chain: %v", err)
		return nil
	}
	var head *db.LLMProfile
	for _, p := range profs {
		if p.ID == headID {
			head = p
			break
		}
	}
	if head == nil { // head excluded from the chain (bound + pool_exclude) — still leads
		if p, err := s.m.pg.ProfileByID(headID); err == nil && p != nil {
			head = p
		} else {
			return nil
		}
	}
	members := []*llmpool.Member{{
		ID: head.ID, Name: head.Name, Model: head.Model, Format: head.Format,
		Priority: head.Priority, Active: head.IsDefault, Rank: llmpool.RankActive,
		WindowTokens: headCfg.ContextWindowTokens(), Prov: headProv,
	}}
	for _, p := range profs {
		if p.ID == headID {
			continue
		}
		// The globally active profile outranks the others when it isn't the head
		// (bound-fallback chains), so it stays the first fallback tried.
		rank := p.Priority
		if p.IsDefault {
			rank = llmpool.RankActive - 1
		}
		if m := s.poolMember(p, rank); m != nil {
			members = append(members, m)
		}
	}
	if len(members) < 2 {
		return nil // nothing to fail over to
	}
	return llmpool.New(members, s.llmHealth)
}

// poolForActive wraps the globally-active provider in the failover chain. Returns
// prov unchanged when failover is off or there's nothing to fall back to.
func (s *Server) poolForActive(activeID int64, prov llm.Provider, cfg agent.Config) llm.Provider {
	pool := s.poolChain(activeID, prov, cfg)
	if pool == nil {
		return prov
	}
	names := make([]string, 0, len(pool.Members()))
	for _, m := range pool.Members() {
		names = append(names, m.Name+"/"+m.Model)
	}
	log.Printf("[llmpool] LLM pooling enabled, chain (%d): %v", len(names), names)
	return pool
}

// poolForBinding wraps a BOUND profile's provider so it falls back to the chain.
// Only active when both the failover master switch and the bound-fallback switch
// are on; otherwise a bound profile stays exclusive (fails hard), which is the
// default and the documented precedence.
func (s *Server) poolForBinding(id int64, prov llm.Provider, cfg agent.Config) llm.Provider {
	if s.m == nil || !s.m.LLMPoolEnabled() || !s.m.LLMPoolBindFallback() {
		return prov
	}
	if pool := s.poolChain(id, prov, cfg); pool != nil {
		return pool
	}
	return prov
}

// LLMPoolMemberStatus is one chain entry as shown in the UI.
type LLMPoolMemberStatus struct {
	ProfileID string `json:"profile_id"`
	Name      string `json:"name"`
	Model     string `json:"model"`
	Format    string `json:"format"`
	Priority  int    `json:"priority"`
	Active    bool   `json:"active"`   // is the globally-activated profile
	Excluded  bool   `json:"excluded"` // pool_exclude — not a failover target
	// Health: state is "ok" | "degraded" (failing but not tripped) | "tripped".
	State        string `json:"state"`
	Fails        int    `json:"fails"`
	Trips        int    `json:"trips"`
	CooldownSecs int    `json:"cooldown_secs"` // remaining cooling-off seconds; 0 = none
	LastError    string `json:"last_error,omitempty"`
	LastAt       string `json:"last_at,omitempty"`
}

// llmPoolStatus reports the whole picture for the LLM page: whether failover is
// on, the resolved chain order, and each profile's breaker state. Excluded
// profiles are listed too (flagged), so the user can see why one isn't in line.
func (s *Server) llmPoolStatus() map[string]any {
	out := map[string]any{
		"enabled":       false,
		"bind_fallback": false,
		"chain":         []LLMPoolMemberStatus{},
	}
	if s.m == nil || s.m.pg == nil {
		return out
	}
	out["enabled"] = s.m.LLMPoolEnabled()
	out["bind_fallback"] = s.m.LLMPoolBindFallback()

	all, err := s.m.pg.ListProfiles()
	if err != nil {
		return out
	}
	health := s.llmHealth.Snapshot()
	now := time.Now()
	// Chain order: active first, then priority DESC / id ASC — the same ordering
	// PoolProfiles applies, recomputed here so excluded ones can be shown in place.
	chain := make([]LLMPoolMemberStatus, 0, len(all))
	for _, p := range all {
		st := health[p.ID]
		m := LLMPoolMemberStatus{
			ProfileID: i64s(p.ID), Name: p.Name, Model: p.Model, Format: p.Format,
			Priority: p.Priority, Active: p.IsDefault, Excluded: p.PoolExclude,
			State: "ok", Fails: st.Fails, Trips: st.Trips,
			LastError: st.LastError,
		}
		if st.Open() {
			m.State = "tripped"
			m.CooldownSecs = int(st.OpenUntil.Sub(now).Seconds()) + 1
		} else if st.Fails > 0 {
			m.State = "degraded"
		}
		if !st.LastAt.IsZero() {
			m.LastAt = st.LastAt.Format(time.RFC3339)
		}
		chain = append(chain, m)
	}
	sortPoolStatus(chain)
	out["chain"] = chain
	return out
}

// sortPoolStatus orders the status rows exactly like the live chain: active first,
// then priority DESC, then id ASC (the incoming slice is already id-ordered, so a
// stable insertion sort on the first two keys is enough).
func sortPoolStatus(in []LLMPoolMemberStatus) {
	for i := 1; i < len(in); i++ {
		for j := i; j > 0 && poolLess(in[j], in[j-1]); j-- {
			in[j], in[j-1] = in[j-1], in[j]
		}
	}
}

func poolLess(a, b LLMPoolMemberStatus) bool {
	if a.Active != b.Active {
		return a.Active
	}
	return a.Priority > b.Priority
}
