package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The update check is opt-in: only ARTEX_UPDATE_CHECK=1 (or true/on/yes) lets
// the backend ask the public GitHub releases API for the latest ARTEX tag.
// Unset, it makes no request at all and the UI shows no banner.
const updateCheckURL = "https://api.github.com/repos/BaaRai/ARTEX/releases/latest"
const updateCheckInterval = 24 * time.Hour

func updateCheckEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("ARTEX_UPDATE_CHECK"))) {
	case "1", "true", "on", "yes":
		return true
	}
	return false
}

// updateCheck caches the last check (time + latest tag) in memory. A failed
// check also stamps the time, so it is not retried within the same 24 h.
type updateCheck struct {
	enabled   bool
	fetch     func(context.Context) (string, error)
	mu        sync.Mutex
	checkedAt time.Time
	tag       string
}

var updates = &updateCheck{enabled: updateCheckEnabled(), fetch: fetchLatestRelease}

// newerVersion returns the latest release tag when it is newer than current,
// fetching it at most once per updateCheckInterval; "" otherwise.
func (u *updateCheck) newerVersion(ctx context.Context, now time.Time, current string) string {
	if !u.enabled {
		return ""
	}
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.checkedAt.IsZero() || now.Sub(u.checkedAt) >= updateCheckInterval {
		u.checkedAt = now
		u.tag = ""
		if tag, err := u.fetch(ctx); err == nil {
			u.tag = tag
		}
	}
	if u.tag != "" && versionLess(current, u.tag) {
		return u.tag
	}
	return ""
}

// fetchLatestRelease sends only a generic User-Agent: no cookies, no host or
// user identifiers.
func fetchLatestRelease(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, updateCheckURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "artex-update-check")
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", errors.New("update check: " + resp.Status)
	}
	var body struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", err
	}
	return body.TagName, nil // "" shows nothing: parseVersion rejects it
}

// versionLess reports whether a < b, comparing the leading numeric
// major.minor.patch of each ("v2.2.0-3-gabc" reads as 2.2.0). A version
// without a leading number (for example "dev") never compares as older.
func versionLess(a, b string) bool {
	pa, oka := parseVersion(a)
	pb, okb := parseVersion(b)
	if !oka || !okb {
		return false
	}
	for i := range pa {
		if pa[i] != pb[i] {
			return pa[i] < pb[i]
		}
	}
	return false
}

func parseVersion(s string) ([3]int, bool) {
	var out [3]int
	s = strings.TrimPrefix(strings.TrimSpace(s), "v")
	if i := strings.IndexAny(s, "-+"); i >= 0 {
		s = s[:i]
	}
	parts := strings.Split(s, ".")
	if len(parts) > 3 {
		return out, false
	}
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			return out, false
		}
		out[i] = n
	}
	return out, true
}
