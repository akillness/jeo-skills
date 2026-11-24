package server

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Autumn-27/artex/agent"
)

// triageClient builds the advisory triage client from the configured profile, or
// nil when triage is off. The profile's base_url must serve the decision-model
// contract at <base_url>/systemone; the model is the profile's model. Built per
// agent run (cheap: one settings read + one profile read), so toggling the setting
// takes effect on the next run without an agent rebuild.
//
// Fail-open by design: an unreadable setting, a missing profile or a profile with
// no base_url/model returns nil, and report_finding behaves exactly as before.
func (s *Server) triageClient() agent.TriageClient {
	id := s.triageProfileID()
	log.Printf("[triage] triageClient: profile_id=%d", id)
	if id <= 0 {
		return nil
	}
	p, err := s.m.pg.ProfileByID(id)
	if err != nil || p == nil {
		return nil
	}
	if strings.TrimSpace(p.BaseURL) == "" || strings.TrimSpace(p.Model) == "" {
		return nil
	}
	client := s.triageHTTPClient(p.BaseURL)
	if client == nil {
		return nil
	}
	return &agent.SystemOneClient{BaseURL: p.BaseURL, APIKey: p.APIKey, Model: p.Model, HTTP: client}
}

// triageHTTPClient builds the HTTP client for the decision endpoint under the same
// endpoint guard the model-list path uses (ARTEX_LLM_PRIVATE_ENDPOINTS, private and
// metadata addresses refused, redirects not followed). A triage profile is a stored
// base_url: without the guard, pointing it at an internal host makes the server dial
// that host on every report_finding. A refused base_url returns nil and triage stays
// off — the same fail-open path as every other triage failure.
func (s *Server) triageHTTPClient(baseURL string) *http.Client {
	g := newModelURLGuard(s)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := g.validateURL(ctx, baseURL, "triage"); err != nil {
		log.Printf("[triage] base_url refused (%v); dedup stays off", err)
		return nil
	}
	var tr *http.Transport
	if base, ok := http.DefaultTransport.(*http.Transport); ok {
		tr = base.Clone()
	} else {
		tr = &http.Transport{}
	}
	tr.Proxy = nil // a proxy fetches the target itself and would bypass the dial guard
	tr.DialContext = (&net.Dialer{Timeout: 10 * time.Second, Control: g.blockDial}).DialContext
	return &http.Client{
		Transport: tr,
		Timeout:   agent.TriageHTTPTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return fmt.Errorf("triage: redirects are not followed")
		},
	}
}

// applyTriageThreshold pushes the stored threshold into the agent package. Called on
// boot and on a settings change; an unreadable or out-of-range value keeps the current
// threshold. 0 is in range and means "back to the default" (SetTriageMinConfidence).
func (s *Server) applyTriageThreshold() {
	if s.m.pg == nil {
		return
	}
	raw, ok, err := s.m.pg.GetSetting(settingTriageMinConfidence)
	if err != nil || !ok {
		return
	}
	if v, err := strconv.ParseFloat(strings.TrimSpace(raw), 64); err == nil && v >= 0 && v <= 1 {
		agent.SetTriageMinConfidence(v)
	}
}

// triageMinConfidence reports the stored threshold for the settings API (0 = default).
func (s *Server) triageMinConfidence() float64 {
	if s.m.pg == nil {
		return 0
	}
	raw, ok, err := s.m.pg.GetSetting(settingTriageMinConfidence)
	if err != nil || !ok {
		return 0
	}
	v, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil {
		return 0
	}
	return v
}

// triageProfileID returns the configured triage profile id, 0 when off or unreadable.
func (s *Server) triageProfileID() int64 {
	if s.m.pg == nil {
		return 0
	}
	raw, ok, err := s.m.pg.GetSetting(settingTriageProfile)
	if err != nil || !ok {
		return 0
	}
	id, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil || id < 0 {
		return 0
	}
	return id
}
