// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). Store-agnostic purchase and reward logic,
// kept out of the SDK callbacks so EditMode tests can replay every ugly event order.
//
// Rules it enforces (sources in skills/scenario-unity-mobile/references/expert-notes.md):
// - IAP 5: OnPurchasePending can fire again after a crash, so fulfilment is idempotent; grant
//   first, then ConfirmPurchase; a FailedOrder from OnPurchaseConfirmed means retry with the kept
//   PendingOrder, never grant again (docs.unity.com IAP 5; Unity, szS2KMxZsl4 [00:10:32], [00:11:38]).
// - iOS gap: on a few minor iOS versions recovered purchases do not fire OnPurchasePending, so
//   pending orders from OnPurchasesFetched go through the same HandlePending (szS2KMxZsl4 [00:07:27]).
// - Two dedupe layers: an in-flight set (checked before grant, [added]: closes the gap the video
//   leaves between two pending callbacks) and a persistent granted store (server or disk).
// - Reset the in-progress flag on EVERY terminal event, including deferred (Ask to Buy, SCA).
// - Never revoke on an empty Google Play fetch without checking fetch failures, disconnects and
//   the "product details ... were not found" warning (IAP 5.4.1 known limitation).
// - LevelPlay rewarded: OnAdRewarded and OnAdClosed have no guaranteed order; grant in
//   OnAdRewarded whenever it arrives, exactly once per show; never grant in OnAdClosed.
// - Receipt check before the grant: an invalid receipt is neither granted nor confirmed (Google:
//   CrossPlatformValidator; Apple receipts arrive validated by StoreKit 2; server validation for
//   server-granted currency) (Unity, szS2KMxZsl4 [00:08:00], [00:10:00]; IAP 5 docs, Validation methods).
// - Pacing: nothing monetized in the first 10 to 15 minutes, offers when the player is stuck
//   (Creauctopus, ILv7GzDgteQ [00:01:58], [00:09:00]); ad SDK init only once consent is answered and
//   the first milestone is reached (ANR talk: stagger SDK init, pezwIhA0e04 [00:25:12]) [added: the gate].
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-mobile/test_live_monetization.py (EditMode).
using System;
using System.Collections.Generic;

namespace AgentKit.Mobile
{
    /// <summary>Persistent record of granted transactions (your server, or a local save for
    /// non-consumables only: consumables are not returned by the store after confirmation).</summary>
    public interface IGrantStore
    {
        bool IsGranted(string transactionId);
        void MarkGranted(string transactionId, string productId);
    }

    public sealed class MemoryGrantStore : IGrantStore
    {
        public readonly Dictionary<string, string> Granted = new Dictionary<string, string>();
        public bool IsGranted(string tx) => Granted.ContainsKey(tx);
        public void MarkGranted(string tx, string product) => Granted[tx] = product;
    }

    public enum PendingOutcome { Granted, ConfirmedWithoutRegrant, DuplicateIgnored, AlreadyConfirmed, GrantFailed, Rejected, InvalidReceipt }

    public sealed class PurchaseLedger
    {
        readonly IGrantStore m_Store;
        readonly HashSet<string> m_InFlight = new HashSet<string>();
        readonly HashSet<string> m_Confirmed = new HashSet<string>();
        public readonly List<string> RetryConfirm = new List<string>();
        public bool PurchaseInProgress { get; private set; }
        public int Grants { get; private set; }
        public int InvalidReceipts { get; private set; }

        public PurchaseLedger(IGrantStore store) { m_Store = store ?? throw new ArgumentNullException(nameof(store)); }

        /// <summary>Buy buttons: enabled only when the store is connected and nothing is in flight.</summary>
        public bool CanStartPurchase(bool storeConnected) => storeConnected && !PurchaseInProgress;

        public void BeginPurchase() => PurchaseInProgress = true;

        /// <summary>Call from OnPurchasePending AND for each pending order of OnPurchasesFetched.
        /// grant(productId) returns true once the item is persisted; confirm() calls ConfirmPurchase;
        /// validate() (optional) checks the receipt before anything is granted.</summary>
        public PendingOutcome HandlePending(string transactionId, string productId, Func<string, bool> grant, Action confirm, Func<bool> validate = null)
        {
            if (string.IsNullOrEmpty(transactionId) || string.IsNullOrEmpty(productId)) return PendingOutcome.Rejected;
            if (m_Confirmed.Contains(transactionId)) return PendingOutcome.AlreadyConfirmed;
            if (!m_InFlight.Add(transactionId)) return PendingOutcome.DuplicateIgnored;
            if (m_Store.IsGranted(transactionId))
            {
                confirm();   // redelivery after a crash between grant and confirm: confirm only
                return PendingOutcome.ConfirmedWithoutRegrant;
            }
            bool valid;
            try { valid = validate == null || validate(); }
            catch (Exception) { valid = false; }
            if (!valid)
            {
                // Invalid receipt: no grant, no confirm (an unacknowledged Google purchase is refunded
                // after three days); tell the UI the purchase failed.
                m_InFlight.Remove(transactionId);
                PurchaseInProgress = false;
                InvalidReceipts++;
                return PendingOutcome.InvalidReceipt;
            }
            bool ok;
            try { ok = grant(productId); }
            catch (Exception) { ok = false; }
            if (!ok)
            {
                // Do not confirm: the store redelivers the order next session.
                m_InFlight.Remove(transactionId);
                PurchaseInProgress = false;
                return PendingOutcome.GrantFailed;
            }
            m_Store.MarkGranted(transactionId, productId);
            Grants++;
            confirm();       // grant first, then confirm
            return PendingOutcome.Granted;
        }

        /// <summary>OnPurchaseConfirmed with a ConfirmedOrder.</summary>
        public void OnConfirmed(string transactionId)
        {
            m_InFlight.Remove(transactionId);
            m_Confirmed.Add(transactionId);
            RetryConfirm.Remove(transactionId);
            PurchaseInProgress = false;
        }

        /// <summary>OnPurchaseConfirmed with a FailedOrder: keep the PendingOrder, retry the
        /// confirmation later; the grant stays (a failed confirmation does not reverse the purchase).</summary>
        public void OnConfirmFailed(string transactionId)
        {
            m_InFlight.Remove(transactionId);
            if (!RetryConfirm.Contains(transactionId)) RetryConfirm.Add(transactionId);
            PurchaseInProgress = false;
        }

        public void OnPurchaseFailed() => PurchaseInProgress = false;   // cancel, decline, store not connected
        public void OnPurchaseDeferred() => PurchaseInProgress = false; // may be the last event for this purchase

        /// <summary>Only revoke entitlements when the fetch is trustworthy.</summary>
        public static bool SafeToRevokeOnMissing(bool productsFetchFailed, bool purchasesFetchFailed, bool storeDisconnected,
                                                 bool productDetailsNotFoundWarning)
            => !productsFetchFailed && !purchasesFetchFailed && !storeDisconnected && !productDetailsNotFoundWarning;
    }

    /// <summary>Rewarded ad: one grant per show, whatever the callback order.</summary>
    public sealed class RewardGate
    {
        int m_Show;
        bool m_Rewarded, m_Closed;
        public int Show => m_Show;
        public bool Closed => m_Closed;
        public int Grants { get; private set; }

        public void BeginShow() { m_Show++; m_Rewarded = false; m_Closed = false; }

        /// <summary>OnAdRewarded: grants once, even after OnAdClosed.</summary>
        public bool OnAdRewarded(Action grant)
        {
            if (m_Show == 0 || m_Rewarded) return false;
            m_Rewarded = true;
            Grants++;
            grant?.Invoke();
            return true;
        }

        /// <summary>OnAdClosed: never grants; reload the ad here.</summary>
        public void OnAdClosed() => m_Closed = true;
    }

    /// <summary>Pacing: no store, ads or offers during the first minutes of play, then interstitials
    /// only after a gameplay milestone with a minimum interval (Creauctopus, ILv7GzDgteQ [00:01:58],
    /// [00:04:46]: first 10 to 15 minutes monetization-free, every 3 minutes, first after a milestone;
    /// a solo developer's heuristics, not measured data). Also requires IsAdReady() and
    /// !IsPlacementCapped (LevelPlay docs). Help offers when the player is stuck, not when winning
    /// (ILv7GzDgteQ [00:09:00]: e.g. boosts after five failures on a level).</summary>
    public sealed class AdPacing
    {
        public float MinIntervalSeconds = 180f;
        public float MonetizationFreeSeconds = 600f;   // 10 minutes of play before the store, ads and offers
        public int StuckFailures = 5;
        public bool MilestoneReached;
        double m_LastShown = double.NegativeInfinity;

        public bool InMonetizationFreeWindow(double playSeconds) => playSeconds < MonetizationFreeSeconds;

        public bool CanShowStore(double playSeconds) => !InMonetizationFreeWindow(playSeconds);

        public bool CanShowInterstitial(double now, bool adReady, bool placementCapped, double playSeconds = double.MaxValue)
            => MilestoneReached && adReady && !placementCapped && !InMonetizationFreeWindow(playSeconds) && now - m_LastShown >= MinIntervalSeconds;

        /// <summary>Rewarded offer (player's choice): outside the monetization-free window, or when stuck.</summary>
        public bool CanOfferRewarded(double playSeconds, int consecutiveFailures, bool adReady)
            => adReady && (!InMonetizationFreeWindow(playSeconds) || IsStuck(consecutiveFailures));

        public bool IsStuck(int consecutiveFailures) => consecutiveFailures >= StuckFailures;

        public void MarkShown(double now) => m_LastShown = now;
    }

    /// <summary>When the ad SDK may start: once the consent answer (either way) is known and the first
    /// milestone is reached. Privacy flags go to the SDK before its init so the first request carries
    /// them [added]; LevelPlay 9.5.1: LevelPlayPrivacySettings.SetGDPRConsent/SetCCPA/SetCOPPA
    /// (LevelPlay.SetConsent is obsolete in 9.5.1, read from the package source).</summary>
    public enum ConsentState { Unknown, Granted, Denied }

    public static class AdsInitGate
    {
        public static bool CanInitAds(ConsentState consent, bool consentRequired, bool milestoneReached)
            => milestoneReached && (!consentRequired || consent != ConsentState.Unknown);
    }
}
