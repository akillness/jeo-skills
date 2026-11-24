package notify

// Snapshot is the contract for the notification_events.snapshot JSONB column.
// The writer is the vulnerability persistence transaction in the db layer; the
// readers are the delivery engine and filter matching in the server layer. The
// definition lives in this package because it is the payload of the
// "notification domain": db only serializes it and does not understand the fields.
//
// Why store vulnerability fields redundantly instead of looking them up at render
// time: a vulnerability can be renamed, re-severitied, or re-statused after the
// fact, while a pushed message must reflect the conclusion **at the moment of the
// event** — a lookup would produce the dangerously misleading "later downgraded to
// low" content. As a bonus, fan-out and rendering do not need to JOIN the
// findings/tasks/assets tables.
type Snapshot struct {
	// Event kind: finding_created / finding_status_changed
	Kind      string  `json:"kind"`
	FindingID int64   `json:"finding_id"`
	TaskID    int64   `json:"task_id"`
	VulnClass string  `json:"vulnclass"`
	Name      string  `json:"name"`
	Severity  string  `json:"severity"`
	Summary   string  `json:"summary"`
	AssetIDs  []int64 `json:"asset_ids"`
	// Non-empty only when kind=finding_status_changed.
	FromStatus string `json:"from_status,omitempty"`
	ToStatus   string `json:"to_status,omitempty"`
}

// Item is a single vulnerability to be pushed, rendered by channels.
type Item struct {
	FindingID int64
	Name      string
	VulnClass string
	Severity  string
	Summary   string
	// Assets holds the resolved display names of the assets (e.g. domain/IP).
	// Filled by the server layer — this package never touches the database
	// and has no way to look up names.
	Assets []string
	// DetailURL is the backlink to the vulnerability details; empty means
	// public_base_url is not configured and rendering omits it.
	DetailURL string
	// Only for status-change events; when both are non-empty, rendered as
	// "Pending → Fixed".
	FromStatus string
	ToStatus   string
}

// IsStatusChange reports whether this item is a status-change event.
func (i Item) IsStatusChange() bool { return i.FromStatus != "" || i.ToStatus != "" }

// Title returns the display title of the item: prefer the human-assigned name,
// fall back to the vulnerability class vulnclass, and use a placeholder when both
// are empty — never emit an empty title.
func (i Item) Title() string {
	if i.Name != "" {
		return i.Name
	}
	if i.VulnClass != "" {
		return i.VulnClass
	}
	return "(unnamed vulnerability)"
}

// Message is the complete content of one channel send.
type Message struct {
	// Length is 1 for a single push; a whole batch for a digest push.
	// An empty slice is illegal; callers must guarantee at least one item.
	Items []Item
	// Batch=true renders as a digest message (different title, with time window
	// and item count).
	Batch bool
	// WindowMinutes is the digest period (in minutes), used only with Batch=true
	// for the "in the last N minutes" wording. Deliberately passed in explicitly
	// from configuration instead of computing time.Since at render time: keeping
	// rendering deterministic makes it testable.
	WindowMinutes int
	// HomeURL is the platform dashboard address (global public_base_url); empty
	// means no dashboard entry is included.
	HomeURL string
	// Limits are the truncation limits to render with; nil means the defaults.
	// A pointer because the zero value is meaningful (no truncation).
	Limits *Limits
}

// Limits are the render-time truncation limits of a message, configured
// globally (see the server's notify_summary_max_runes / notify_assets_max_shown
// settings). In both fields 0 means no truncation; each channel's own length
// cap remains the final guard.
type Limits struct {
	// SummaryRunes is how many characters the summary of a single push is
	// compressed to.
	SummaryRunes int
	// AssetsShown is the maximum number of assets listed per vulnerability.
	AssetsShown int
}

// limits returns the limits to render with, falling back to the defaults when
// none were passed in.
func (m Message) limits() Limits {
	if m.Limits == nil {
		return Limits{SummaryRunes: DefaultMaxSummaryRunes, AssetsShown: DefaultMaxAssetsShown}
	}
	return *m.Limits
}
