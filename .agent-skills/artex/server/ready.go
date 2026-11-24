package server

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"
)

const (
	readyCacheTTL    = time.Second
	readyPingTimeout = time.Second
)

var errNoPostgres = errors.New("PostgreSQL is not configured")

type readyCache struct {
	mu      sync.Mutex
	checked time.Time
	ready   bool
	pending chan struct{}
}

func (c *readyCache) check(ctx context.Context, ping func(context.Context) error) bool {
	if ctx.Err() != nil {
		return false
	}

	c.mu.Lock()
	if !c.checked.IsZero() && time.Since(c.checked) < readyCacheTTL {
		ready := c.ready
		c.mu.Unlock()
		return ready
	}
	if done := c.pending; done != nil {
		c.mu.Unlock()
		select {
		case <-done:
			c.mu.Lock()
			ready := c.ready
			c.mu.Unlock()
			return ready
		case <-ctx.Done():
			return false
		}
	}
	done := make(chan struct{})
	c.pending = done
	c.mu.Unlock()

	pingCtx, cancel := context.WithTimeout(context.Background(), readyPingTimeout)
	err := ping(pingCtx)
	cancel()

	c.mu.Lock()
	c.ready = err == nil
	c.checked = time.Now()
	c.pending = nil
	close(done)
	ready := c.ready
	c.mu.Unlock()
	return ready
}

// ready reports PostgreSQL reachability without exposing connection details.
// Its cached ping is bounded to one second and never runs application work.
func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ready := s.readyPG.check(r.Context(), func(ctx context.Context) error {
		if s.m == nil || s.m.pg == nil {
			return errNoPostgres
		}
		return s.m.pg.PingContext(ctx)
	})
	status := http.StatusServiceUnavailable
	if ready {
		status = http.StatusOK
	}
	writeJSON(w, status, map[string]bool{"ready": ready})
}
