// Package notify implements the IM / email push channel adapters for vulnerability
// findings.
//
// Layering: this package is a **leaf package** that depends only on the standard
// library. It knows neither the database nor server. Channel configuration is
// passed in as map[string]any (corresponding to the notification_channels.config
// JSONB column), and the content to push is passed in as a Message. The benefit of
// this split is that the truly error-prone parts — signature computation, UTF-8
// truncation, filter matching — can be unit-tested without PostgreSQL, while the
// host only does orchestration on the server side.
//
// Concurrency contract: Channel implementations must be **stateless**. The same
// Channel instance is shared concurrently by multiple channel configurations (even
// multiple bot instances of the same channel); all credentials are passed in via
// the cfg parameter, and caching things like a webhook URL into fields of the
// implementation itself is not allowed.
package notify

// Channel kind identifiers. The values are also the valid set of
// notification_channels.kind, whitelisted on the server side (same approach as
// findings.status — no DB CHECK constraint, so adding channels later is easy).
const (
	KindDingTalk = "dingtalk" // DingTalk custom bot
	KindFeishu   = "feishu"   // Feishu (incl. Lark) custom bot
	KindWeCom    = "wecom"    // WeCom group bot
	KindWebhook  = "webhook"  // Generic webhook: custom method/headers/JSON template
	KindTelegram = "telegram" // Telegram Bot API
	KindEmail    = "email"    // SMTP email
)

// Event kinds, corresponding to notification_events.kind.
const (
	EventFindingCreated       = "finding_created"
	EventFindingStatusChanged = "finding_status_changed"
)

// InitKind is the fallback value for an empty kind in config.
const InitKind = KindDingTalk

// severityRank maps vulnerability severity to comparable ordinals. Unknown
// severities return 0, so any min_severity setting keeps unknown severities
// out — when in doubt, do not push, to avoid false-positive floods.
var severityRank = map[string]int{
	"low":      1,
	"medium":   2,
	"high":     3,
	"critical": 4,
}

// SeverityRank returns the ordinal of a severity; unknown severities return 0.
func SeverityRank(severity string) int { return severityRank[severity] }

// SeverityLabel returns the severity name with an emoji, used in message titles
// and card coloring. Unknown severities are echoed as-is, never invented.
func SeverityLabel(severity string) string {
	switch severity {
	case "critical":
		return "🔴 Critical"
	case "high":
		return "🟠 High"
	case "medium":
		return "🟡 Medium"
	case "low":
		return "🔵 Low"
	default:
		return severity
	}
}

// StatusLabel maps a handling status to a human-readable label, used in
// status-change messages.
func StatusLabel(status string) string {
	switch status {
	case "pending":
		return "Pending"
	case "in_progress":
		return "In progress"
	case "confirmed":
		return "Confirmed"
	case "resolved":
		return "Resolved"
	case "fixed":
		return "Fixed"
	case "false_positive":
		return "False positive"
	case "ignored":
		return "Ignored"
	case "duplicate":
		return "Duplicate"
	case "risk_accepted":
		return "Risk accepted"
	default:
		return status
	}
}

// AtLeast reports whether severity reaches the min threshold. An empty min means
// no threshold, everything passes. Note that unknown severities have ordinal 0
// and are rejected by any non-empty min (see the severityRank comment).
func AtLeast(severity, min string) bool {
	if min == "" {
		return true
	}
	return SeverityRank(severity) >= SeverityRank(min)
}
