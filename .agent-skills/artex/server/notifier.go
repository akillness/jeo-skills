package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Autumn-27/artex/db"
	"github.com/Autumn-27/artex/notify"
)

// Global setting keys (stored in the settings key-value table, no dedicated table needed).
const (
	// settingNotifyEnabled is the master switch for delivery. Default on: it exists
	// as a one-shot kill switch during maintenance, not as the enable condition for
	// the feature — the real enable condition is "whether any channel is configured".
	settingNotifyEnabled = "notify_enabled"
	// settingNotifyPublicBaseURL is the externally reachable address used to build
	// detail back-links for vulnerabilities (e.g. https://artex.example.com). If left
	// empty, messages carry no back-link button. There is no reusable external-address
	// setting in the project, so a new one is added here.
	settingNotifyPublicBaseURL = "notify_public_base_url"
	// settingNotifyDigestMinutes is the digest-mode period (minutes).
	settingNotifyDigestMinutes = "notify_digest_interval_min"
	// settingNotifySummaryMaxRunes is how many characters the summary of a single
	// push is cut to, and settingNotifyAssetsMaxShown how many asset names a
	// message lists. 0 means no truncation; unset means the notify package
	// defaults (120 / 3).
	settingNotifySummaryMaxRunes = "notify_summary_max_runes"
	settingNotifyAssetsMaxShown  = "notify_assets_max_shown"
)

const (
	// notifyTick is the delivery engine's polling interval. 3 seconds is the upper
	// bound of this engine's realtimeness, and also the main source of latency
	// between "vulnerability persisted" and "message arrives at the IM".
	notifyTick = 3 * time.Second
	// notifyLease is the lease duration when claiming deliveries. It must be
	// significantly longer than the worst-case duration of a single delivery
	// (the notify package's HTTP client timeout is 15 seconds), otherwise the
	// same row could be delivered by two dispatchers at the same time.
	notifyLease = 3 * time.Minute
	// notifyFanOutPerTick limits the number of events fanned out per tick, so that
	// enabling a channel for the first time does not expand the entire historical
	// backlog into delivery tasks in one go.
	notifyFanOutPerTick = 200
	// notifyDefaultDigestMinutes is the default digest period.
	notifyDefaultDigestMinutes = 30
	// notifySummaryMaxRunesCap / notifyAssetsMaxShownCap are the upper bounds the
	// settings API accepts for the two render limits.
	notifySummaryMaxRunesCap = 4000
	notifyAssetsMaxShownCap  = 50
	// notifyUnlimitedBurstPerTick is the per-tick delivery cap when a channel has
	// no rate limit configured. It exists to prevent "one channel configured as
	// unlimited + a single scan finding thousands of vulnerabilities" from dragging
	// a single tick into a long blocking loop.
	notifyUnlimitedBurstPerTick = 50
	// notifyMaxSendsPerChannelPerTick is the maximum number of deliveries per tick
	// for a single channel.
	//
	// This cap is derived backwards from the **lease duration**: claiming marks rows
	// with a lease (notifyLease = 3 minutes); if one tick serially delivers so many
	// rows that the worst-case duration exceeds the lease, the lease on the later
	// rows expires before they are even sent. Within a single process this is
	// harmless (Run is a single serial goroutine, ticks never re-enter), but with
	// **two processes on the same database**, the peer will reclaim rows whose
	// leases expired and resend them, double-increment attempts, and mark them
	// failed while the original process is still delivering.
	//
	// Value: 3-minute lease / 30-second per-send timeout = 6, which **consumes the
	// lease exactly** with zero headroom, so it cannot be used; 5 leaves a 30-second
	// margin on a 150-second worst case. This relationship is pinned down by
	// TestNotifyTickBudgetFitsWithinLease — changing any of notifyLease,
	// notifySendTimeout, or this value will fail that assertion.
	notifyMaxSendsPerChannelPerTick = 5
	// notifySendTimeout is the timeout for a single delivery. It also determines
	// the value of the constant above; the two multiplied together must not exceed
	// notifyLease, see TestNotifyTickBudgetFitsWithinLease.
	notifySendTimeout = 30 * time.Second
)

// notifyBackoff is the backoff sequence for failed-delivery retries, indexed by
// the number of attempts already made. 3 chances (including the first attempt)
// correspond to db.MaxNotifyAttempts; the two must be changed together.
var notifyBackoff = []time.Duration{
	time.Second,
	5 * time.Second,
	30 * time.Second,
}

// Notifier is the delivery engine for vulnerability notifications.
//
// It runs as an independent goroutine alongside the Scheduler (see server.New).
// It deliberately does not reuse the Scheduler's tick: delivery's realtimeness
// requirement (3 seconds) differs from the trigger's business cadence, and their
// failures must not affect each other — a stuck delivery must not impact agent
// triggering.
type Notifier struct {
	s  *Server
	pg *db.DB

	// mu guards buckets. The number of channels is small and contention is low,
	// so a single mutex is enough; a finer-grained structure is not worth it.
	mu      sync.Mutex
	buckets map[int64]*notifyBucket
}

// notifyBucket is the token bucket for a single channel.
//
// A token bucket is used instead of a sliding window of "count then reset each
// minute", because the latter has terrible boundary effects: sending the full 20
// messages at the end of a window and another 20 right after means 40 messages in
// one second from the platform's perspective, which gets rate-limited; a token
// bucket refills at a constant rate and inherently avoids such bursts.
type notifyBucket struct {
	tokens   float64
	lastFill time.Time
}

func newNotifier(s *Server) *Notifier {
	return &Notifier{s: s, pg: s.m.pg, buckets: map[int64]*notifyBucket{}}
}

// Run loops until ctx ends. Started once by server.New.
func (n *Notifier) Run(ctx context.Context) {
	if n.pg == nil {
		return
	}
	t := time.NewTicker(notifyTick)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			n.step(ctx)
		}
	}
}

// step runs one round: first fan out new events, then deliver due tasks.
//
// Failure of any step only logs and never interrupts the loop — a failure in the
// notification system must never escalate into a process-level problem. Every
// tick is independent, and the next round will naturally retry.
func (n *Notifier) step(ctx context.Context) {
	if !n.enabled() {
		return
	}
	if _, _, err := n.pg.FanOutPendingEvents(ctx, notifyFanOutPerTick); err != nil {
		log.Printf("[notify] failed to fan out events: %v", err)
		return
	}
	channels, err := n.pg.ListNotificationChannels(ctx)
	if err != nil {
		log.Printf("[notify] failed to read channels: %v", err)
		return
	}
	baseURL := n.publicBaseURL()
	for _, ch := range channels {
		if !ch.IsEnabled() {
			continue
		}
		// The token bucket is metered in **messages** (equivalent to HTTP requests),
		// not vulnerabilities. In realtime mode the two are the same (one message per
		// vulnerability); in digest mode a whole batch of vulnerabilities becomes one
		// message, so it consumes only one token.
		//
		// Both modes ask the token bucket first and then claim within that allowance —
		// the order must not be reversed, otherwise deliveries blocked by rate limiting
		// would already have consumed retry attempts.
		now := time.Now()
		if ch.Mode == db.NotifyModeDigest {
			tokens, claimLimit := digestTickPlan()
			if n.takeTokens(ch.ID, ch.RatePerMin, tokens, now) <= 0 {
				continue
			}
			n.stepDigest(ctx, ch, claimLimit, baseURL)
			continue
		}
		allow := n.takeTokens(ch.ID, ch.RatePerMin, notifyMaxSendsPerChannelPerTick, now)
		if allow <= 0 {
			continue
		}
		n.stepRealtime(ctx, ch, allow, baseURL)
	}
}

// digestTickPlan returns the token consumption and batch-size upper bound for a
// digest channel in this tick.
//
// The two return values are **two different dimensions**, which is exactly why
// this is a separate function:
//
//   - tokens is the number of messages. A batch of vulnerabilities becomes one
//     message and one HTTP request, so it is always 1. rate_per_min therefore
//     still applies to digests (at most this many digest messages per minute).
//   - claimLimit is how many vulnerabilities a batch may hold at most. It is
//     bounded only by memory and is unrelated to the request budget.
//
// A previous version, in order to make rate_per_min apply to digests, passed the
// per-tick request budget (notifyMaxSendsPerChannelPerTick, derived backwards
// from the lease) directly as the batch size. The consequence was that a channel
// with rate_per_min=20 only refilled 1 token in a 3-second tick, so every digest
// message carried just 1 vulnerability — the digest degenerated into "realtime
// delivery with digest wording", readers received a stream of "1 new vulnerability
// in the last 30 minutes", and db.MaxDigestBatchSize was never reachable.
//
// This symptom is hard to catch in end-to-end tests (existing cases all pass a
// large enough limit to stepDigest manually, bypassing the allowance calculation
// in step), so the decision is pinned down here directly by
// TestDigestTickPlanDecouplesBatchSizeFromSendBudget.
func digestTickPlan() (tokens, claimLimit int) {
	return 1, db.MaxDigestBatchSize
}

// stepRealtime claims and delivers a channel's realtime tasks, one message per
// vulnerability.
func (n *Notifier) stepRealtime(ctx context.Context, ch *db.NotificationChannel, allow int, baseURL string) {
	deliveries, err := n.pg.ClaimRealtimeDeliveries(ctx, ch.ID, allow, notifyLease)
	if err != nil {
		log.Printf("[notify] failed to claim realtime deliveries channel=%d: %v", ch.ID, err)
		return
	}
	if len(deliveries) == 0 {
		return
	}
	channel, cfg, ok := n.adapt(ch)
	if !ok {
		_ = n.pg.FailDeliveries(ctx, deliveryIDs(deliveries), fmt.Sprintf("channel type %q is not registered", ch.Kind))
		return
	}
	limits := notifyLimits(n.pg)
	for _, dl := range deliveries {
		msg, err := n.renderSingle(ctx, dl, baseURL, limits)
		if err != nil {
			// A render failure is a local data problem; retrying will not help.
			_ = n.pg.FailDeliveries(ctx, []int64{dl.ID}, err.Error())
			continue
		}
		n.send(ctx, channel, cfg, msg, []*db.NotificationDelivery{dl})
	}
}

// stepDigest aggregates a channel's pending deliveries into one message and sends
// it when the batch is due.
func (n *Notifier) stepDigest(ctx context.Context, ch *db.NotificationChannel, allow int, baseURL string) {
	window := n.digestInterval()
	due, err := n.pg.DigestBatchDue(ctx, ch.ID, window)
	if err != nil {
		log.Printf("[notify] failed to check digest batch channel=%d: %v", ch.ID, err)
		return
	}
	if !due {
		return
	}
	deliveries, err := n.pg.ClaimDigestBatch(ctx, ch.ID, allow, notifyLease)
	if err != nil {
		log.Printf("[notify] failed to claim digest batch channel=%d: %v", ch.ID, err)
		return
	}
	if len(deliveries) == 0 {
		return
	}
	channel, cfg, ok := n.adapt(ch)
	if !ok {
		_ = n.pg.FailDeliveries(ctx, deliveryIDs(deliveries), fmt.Sprintf("channel type %q is not registered", ch.Kind))
		return
	}
	msg, included, err := n.renderBatch(ctx, deliveries, baseURL, int(window.Minutes()), notifyLimits(n.pg))
	if err != nil {
		_ = n.pg.FailDeliveries(ctx, deliveryIDs(deliveries), err.Error())
		return
	}
	// Deliveries whose snapshots were broken and did not make it into the message
	// must be marked failed explicitly. Otherwise they stay outside `included`,
	// entering neither the message nor the failure list — when the send succeeds,
	// the later batch marking would miss them, and they would stay in `sending`
	// forever until their leases expire and they get reclaimed over and over.
	if skipped := excludeDeliveries(deliveries, included); len(skipped) > 0 {
		reason := "event snapshot could not be parsed; this vulnerability cannot be rendered into a message"
		if fErr := n.pg.FailDeliveries(ctx, deliveryIDs(skipped), reason); fErr != nil {
			log.Printf("[notify] failed to mark broken-snapshot deliveries failed channel=%s ids=%v: %v", ch.Kind, deliveryIDs(skipped), fErr)
		}
		log.Printf("[notify] skipped %d deliveries with unparseable snapshots channel=%d", len(skipped), ch.ID)
	}
	// Only pass those that made it into the message to send: included[i]
	// corresponds strictly to msg.Items[i], and send relies on this correspondence
	// to attribute "the channel reported fitting the first K entries" to the
	// correct delivery rows.
	n.send(ctx, channel, cfg, msg, included)
}

// send delivers and transitions state according to the result.
//
// A batch of deliveries (possibly dozens in digest mode) shares a single send
// result: either delivered, or retried as a whole batch. There is no per-item
// retry — a digest message is one message, and resending part of it would corrupt
// the batch semantics.
//
// The only exception is **segmentation caused by the channel's length limit**: if
// the channel reports that only the first K entries actually fit, then from entry
// K+1 onward must be left for the next batch instead of being marked succeeded
// along with the rest. Otherwise the truncated vulnerabilities would be neither
// in the message nor in the failure list — they would disappear entirely.
func (n *Notifier) send(ctx context.Context, channel notify.Channel, cfg map[string]any, msg notify.Message, deliveries []*db.NotificationDelivery) {
	// Cap the duration of a single delivery so one stuck channel cannot hold up
	// all remaining channels in this round.
	sendCtx, cancel := context.WithTimeout(ctx, notifySendTimeout)
	defer cancel()
	delivered, err := channel.Send(sendCtx, cfg, msg)
	if err == nil && delivered > 0 {
		if delivered > len(deliveries) {
			// The channel cannot possibly report more delivered entries than there
			// are deliveries; if it does, the render layer miscounted. Treat it as
			// fully delivered and record the problem — better than corrupting the
			// records.
			log.Printf("[notify] channel reported %d delivered entries, more than the %d deliveries channel=%s; treating as fully delivered",
				delivered, len(deliveries), channel.Kind())
			delivered = len(deliveries)
		}
		sent, rest := deliveries[:delivered], deliveries[delivered:]
		if err := n.pg.MarkDeliveriesSent(ctx, deliveryIDs(sent)); err != nil {
			log.Printf("[notify] failed to mark as sent channel=%s ids=%v: %v", channel.Kind(), deliveryIDs(sent), err)
		}
		if len(rest) > 0 {
			// This message has reached the channel's length limit: the remainder
			// re-queues immediately and the next tick continues sending. Use
			// DeferDeliveries rather than RescheduleDeliveries — this is not a
			// failure and must not consume the retry budget (claiming already
			// optimistically incremented attempts by +1, which this will undo).
			if err := n.pg.DeferDeliveries(ctx, deliveryIDs(rest),
				fmt.Sprintf("this message reached the channel length limit; only the first %d entries were delivered, the rest are left for the next batch", delivered)); err != nil {
				log.Printf("[notify] failed to queue segmented continuation channel=%s ids=%v: %v", channel.Kind(), deliveryIDs(rest), err)
			}
		}
		return
	}
	if err == nil {
		// The channel neither reported an error nor said how many entries were
		// delivered. Treat it as a failure (with backoff), so this delivery is not
		// repeatedly claimed yet never marked.
		err = fmt.Errorf("channel did not report a delivered count (delivered=%d)", delivered)
	}

	// Failure handling is decided **per delivery**, not by the maximum attempt
	// count of the whole batch.
	//
	// A previous version failed the entire batch with
	// `if maxAttempts(deliveries) >= MaxNotifyAttempts`, but the attempt counts of
	// items in a batch differ: an old delivery already retried twice (attempts=2)
	// would drag a brand-new delivery (attempts=1) in the same batch into failed —
	// a new vulnerability permanently lost without using a single retry, the exact
	// opposite of the intent of "don't let old rows sink new rows".
	permanent := notify.IsPermanent(err)
	var failIDs, exhaustedIDs []int64
	byDelay := map[time.Duration][]int64{}
	for _, dl := range deliveries {
		switch {
		case permanent:
			failIDs = append(failIDs, dl.ID)
		case dl.Attempts >= db.MaxNotifyAttempts:
			exhaustedIDs = append(exhaustedIDs, dl.ID)
		default:
			delay := notifyBackoff[min(dl.Attempts, len(notifyBackoff)-1)]
			byDelay[delay] = append(byDelay[delay], dl.ID)
		}
	}

	if len(failIDs) > 0 {
		if fErr := n.pg.FailDeliveries(ctx, failIDs, err.Error()); fErr != nil {
			log.Printf("[notify] error marking failed state channel=%s ids=%v: %v", channel.Kind(), failIDs, fErr)
		}
	}
	if len(exhaustedIDs) > 0 {
		reason := fmt.Sprintf("still failing after %d retries: %s", db.MaxNotifyAttempts, err)
		if fErr := n.pg.FailDeliveries(ctx, exhaustedIDs, reason); fErr != nil {
			log.Printf("[notify] error marking failed state channel=%s ids=%v: %v", channel.Kind(), exhaustedIDs, fErr)
		}
	}
	// Reschedule grouped by delay: with only 3 backoff tiers the number of groups
	// is inherently small, so there is no need to issue a separate UPDATE per row
	// (which would turn a 500-row batch into 500 round trips).
	for delay, group := range byDelay {
		if rErr := n.pg.RescheduleDeliveries(ctx, group, delay, err.Error()); rErr != nil {
			log.Printf("[notify] failed to reschedule deliveries channel=%s ids=%v: %v", channel.Kind(), group, rErr)
		}
	}
	if len(failIDs)+len(exhaustedIDs) > 0 {
		log.Printf("[notify] delivery failed channel=%d kind=%s permanent=%d retries-exhausted=%d pending-retry=%d: %s",
			deliveries[0].ChannelID, channel.Kind(), len(failIDs), len(exhaustedIDs), len(byDelay), err)
	}
}

// excludeDeliveries returns the items in all that are not in keep (compared by
// pointer identity). Used to find deliveries that "did not make it into the
// message" — they must be handled explicitly and must not be left in a gray zone.
func excludeDeliveries(all, keep []*db.NotificationDelivery) []*db.NotificationDelivery {
	inKeep := make(map[*db.NotificationDelivery]bool, len(keep))
	for _, dl := range keep {
		inKeep[dl] = true
	}
	var out []*db.NotificationDelivery
	for _, dl := range all {
		if !inKeep[dl] {
			out = append(out, dl)
		}
	}
	return out
}

// adapt resolves the channel implementation and parses its configuration.
// Returning ok=false means the type is not registered; deliveries should be
// marked failed directly instead of retried indefinitely.
func (n *Notifier) adapt(ch *db.NotificationChannel) (notify.Channel, map[string]any, bool) {
	channel, ok := notify.Get(ch.Kind)
	if !ok {
		return nil, nil, false
	}
	var cfg map[string]any
	if len(ch.Config) > 0 {
		// When config parsing fails, fall back to an empty map: the channel's own
		// Validate will report "which field is missing", an error far more
		// actionable for the user than a JSON parse error.
		_ = json.Unmarshal(ch.Config, &cfg)
	}
	if cfg == nil {
		cfg = map[string]any{}
	}
	return channel, cfg, true
}

// renderSingle renders a single-vulnerability message.
func (n *Notifier) renderSingle(ctx context.Context, dl *db.NotificationDelivery, baseURL string, limits notify.Limits) (notify.Message, error) {
	snap, err := parseSnapshot(dl)
	if err != nil {
		return notify.Message{}, err
	}
	item, err := n.itemFor(ctx, snap, baseURL)
	if err != nil {
		return notify.Message{}, err
	}
	return notify.Message{Items: []notify.Item{item}, HomeURL: baseURL, Limits: &limits}, nil
}

// renderBatch renders a digest message. Snapshots are parsed one by one — a
// single broken one only skips that entry and must not sink the whole digest.
//
// The return value included corresponds **strictly one-to-one** with msg.Items
// (the i-th delivery ↔ the i-th item). This correspondence is a hard requirement:
// the caller marks the first K deliveries as sent based on "the channel reported
// fitting the first K entries". If a broken snapshot were skipped here without
// removing the skipped delivery from included, the indices would shift — a broken
// entry that should have failed would be marked sent, and a good entry would be
// misjudged as undelivered. The broken ones are marked failed explicitly by the
// caller, see stepDigest.
func (n *Notifier) renderBatch(ctx context.Context, deliveries []*db.NotificationDelivery, baseURL string, windowMinutes int, limits notify.Limits) (notify.Message, []*db.NotificationDelivery, error) {
	items := make([]notify.Item, 0, len(deliveries))
	included := make([]*db.NotificationDelivery, 0, len(deliveries))
	for _, dl := range deliveries {
		snap, err := parseSnapshot(dl)
		if err != nil {
			// A broken snapshot goes neither into the message nor into included —
			// handling it is the caller's responsibility (explicitly marking it
			// failed, rather than sneaking it through among the "sent" ones).
			log.Printf("[notify] skipping unparseable snapshot in digest batch delivery=%d: %v", dl.ID, err)
			continue
		}
		item, err := n.itemFor(ctx, snap, baseURL)
		if err != nil {
			return notify.Message{}, nil, err
		}
		items = append(items, item)
		included = append(included, dl)
	}
	if len(items) == 0 {
		return notify.Message{}, nil, fmt.Errorf("all %d deliveries in the digest batch failed to parse", len(deliveries))
	}
	return notify.Message{
		Items:         items,
		Batch:         true,
		WindowMinutes: windowMinutes,
		HomeURL:       baseURL,
		Limits:        &limits,
	}, included, nil
}

// itemFor renders an event snapshot into a notification item, also resolving
// asset names and the detail back-link.
func (n *Notifier) itemFor(ctx context.Context, snap notify.Snapshot, baseURL string) (notify.Item, error) {
	assets, err := n.pg.NotificationAssetNames(ctx, snap.AssetIDs)
	if err != nil {
		// Failing to resolve asset names must not block delivery: missing names is
		// far less severe than missing the notification — the message just has one
		// fewer asset line.
		log.Printf("[notify] failed to resolve asset names finding=%d: %v", snap.FindingID, err)
	}
	item := notify.Item{
		FindingID:  snap.FindingID,
		Name:       snap.Name,
		VulnClass:  snap.VulnClass,
		Severity:   snap.Severity,
		Summary:    snap.Summary,
		Assets:     assets,
		FromStatus: snap.FromStatus,
		ToStatus:   snap.ToStatus,
	}
	if baseURL != "" {
		// The detail page route is in web/src/app/(main)/function/findings/detail/page.tsx;
		// it reads the finding id from the `id` query parameter.
		item.DetailURL = fmt.Sprintf("%s/function/findings/detail?id=%d", baseURL, snap.FindingID)
	}
	return item, nil
}

// takeTokens takes **at most want** tokens from the channel's token bucket and
// returns the number actually taken.
//
// One token = one message (one HTTP request). In realtime mode the caller passes
// as many as it needs; in digest mode a whole batch of vulnerabilities sends only
// one message, so pass 1.
//
// The bucket capacity is the channel's per-minute limit and refills at a constant
// rate. ratePerMin<=0 means no rate limit, in which case a finite but
// sufficiently large value is returned, to prevent a single tick from being
// dragged down by unlimited backlog.
//
// The `want` cap is necessary: without it the only option would be draining the
// whole bucket, while the caller has its own per-tick cap — the extra tokens are
// both unusable and gone before the next refill. Accumulated burst capacity would
// be forever unreachable, and even "no pending deliveries this round" would still
// be charged.
func (n *Notifier) takeTokens(channelID int64, ratePerMin, want int, now time.Time) int {
	if want <= 0 {
		return 0
	}
	if ratePerMin <= 0 {
		return min(want, notifyUnlimitedBurstPerTick)
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	b := n.buckets[channelID]
	if b == nil {
		b = &notifyBucket{tokens: float64(ratePerMin), lastFill: now}
		n.buckets[channelID] = b
	}
	// Refill by real elapsed time at a rate of ratePerMin/60 per second.
	if elapsed := now.Sub(b.lastFill).Seconds(); elapsed > 0 {
		b.tokens = minF(float64(ratePerMin), b.tokens+elapsed*float64(ratePerMin)/60)
		b.lastFill = now
	}
	// Add a tiny epsilon before truncating: the token count is accumulated in
	// floating point, and two half refills can yield 0.5 + 0.5 = 0.9999999999,
	// which a plain int() would truncate to 0 — a mathematically full bucket that
	// yields no token. 1e-9 is far smaller than one token and will not let a real
	// shortfall through.
	take := min(int(b.tokens+1e-9), want)
	if take <= 0 {
		return 0
	}
	b.tokens -= float64(take)
	return take
}

// enabled reads the master switch.
func (n *Notifier) enabled() bool {
	return n.pg.GetBool(settingNotifyEnabled, true)
}

// publicBaseURL returns the external address for back-links, with trailing
// slashes removed.
func (n *Notifier) publicBaseURL() string {
	v, ok, err := n.pg.GetSetting(settingNotifyPublicBaseURL)
	if err != nil || !ok {
		return ""
	}
	return trimTrailingSlash(v)
}

// digestInterval returns the digest period, falling back to the default when the
// value is invalid or not configured.
func (n *Notifier) digestInterval() time.Duration {
	v, ok, err := n.pg.GetSetting(settingNotifyDigestMinutes)
	if err != nil || !ok {
		return time.Duration(notifyDefaultDigestMinutes) * time.Minute
	}
	m := 0
	if _, err := fmt.Sscanf(v, "%d", &m); err != nil || m <= 0 {
		return time.Duration(notifyDefaultDigestMinutes) * time.Minute
	}
	return time.Duration(m) * time.Minute
}

// notifyLimits reads the summary/asset render limits from the settings.
func notifyLimits(pg *db.DB) notify.Limits {
	summary, sOK, _ := pg.GetSetting(settingNotifySummaryMaxRunes)
	assets, aOK, _ := pg.GetSetting(settingNotifyAssetsMaxShown)
	return notify.Limits{
		SummaryRunes: notifyLimitValue(summary, sOK, notify.DefaultMaxSummaryRunes, notifySummaryMaxRunesCap),
		AssetsShown:  notifyLimitValue(assets, aOK, notify.DefaultMaxAssetsShown, notifyAssetsMaxShownCap),
	}
}

// notifyLimitValue resolves one stored render limit: def when the key is unset,
// unparseable, or outside [0, max]. 0 is a valid value (no truncation), which is
// why "unset" is carried by ok and not by the number.
func notifyLimitValue(v string, ok bool, def, max int) int {
	if !ok {
		return def
	}
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil || n < 0 || n > max {
		return def
	}
	return n
}

// parseSnapshot parses the snapshot of the event a delivery corresponds to.
func parseSnapshot(dl *db.NotificationDelivery) (notify.Snapshot, error) {
	var snap notify.Snapshot
	if len(dl.Snapshot) == 0 {
		return snap, fmt.Errorf("event snapshot of delivery %d is empty", dl.ID)
	}
	if err := json.Unmarshal(dl.Snapshot, &snap); err != nil {
		return snap, fmt.Errorf("failed to parse event snapshot of delivery %d: %w", dl.ID, err)
	}
	if snap.Kind == "" {
		// The event kind is authoritative on the event row; the copy in the
		// snapshot may have been written by an older version.
		snap.Kind = dl.EventKind
	}
	return snap, nil
}

func deliveryIDs(deliveries []*db.NotificationDelivery) []int64 {
	out := make([]int64, 0, len(deliveries))
	for _, dl := range deliveries {
		out = append(out, dl.ID)
	}
	return out
}

func trimTrailingSlash(s string) string {
	for len(s) > 0 && s[len(s)-1] == '/' {
		s = s[:len(s)-1]
	}
	return s
}

func minF(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
