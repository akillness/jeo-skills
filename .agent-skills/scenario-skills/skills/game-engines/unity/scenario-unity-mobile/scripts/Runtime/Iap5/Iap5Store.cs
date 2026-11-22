// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). Unity IAP 5 (com.unity.purchasing 5.x)
// wired to the store-agnostic PurchaseLedger. Compiles only when IAP >= 5.0.0 is installed
// (asmdef versionDefines -> AGENTKIT_IAP5): 6000.3.21f1 still defaults to IAP 4.15.1, so add
// "com.unity.purchasing": "5.4.3" to Packages/manifest.json first.
//
// Order of operations (Unity, szS2KMxZsl4; docs.unity.com IAP 5): UnityServices first, subscribe
// to EVERY StoreController event before Connect(), FetchProducts, then FetchPurchases from
// OnProductsFetched; pending orders from OnPurchasesFetched go through the same idempotent path
// (iOS versions that skip OnPurchasePending for recovered purchases); grant, then ConfirmPurchase.
// Read from the 5.4.3 source (observed): ConfirmPurchase fails fast with a FailedOrder when the
// PendingOrder's TransactionID is empty or the store is disconnected; the ConfirmedOrder raised
// right after ConfirmPurchase carries the PendingOrder's Info, but ConfirmedOrders fetched later
// may have an EMPTY TransactionID for consumables (IOrderInfo doc), so dedupe on the pending
// order's id, never on fetched confirmed orders; 5.4.3 reports an order Google already
// acknowledged as FailedOrder(DuplicateTransaction): treat it as confirmed, not as a retry.
// Receipts (IAP 5 docs, Validation methods; szS2KMxZsl4 [00:08:00]): Apple receipts arrive validated by
// StoreKit 2; Google receipts need CrossPlatformValidator (namespace UnityEngine.Purchasing.Security,
// ctor (byte[] googlePublicKey, string googleBundleId), Validate(order.Info.Receipt), key from the
// IAP obfuscator's generated GooglePlayTangle) or your server; pass it as `validate`.
// StoreKit 2 attribution gap: SDKs that read the StoreKit 1 app receipt stop seeing iOS purchases;
// OnAppleJws hands them Order.Info.Apple.jwsRepresentation (null on StoreKit 1 devices), then verify
// with a real device purchase that the SDK reports it (IAP 5 docs, Check third-party analytics).
// Prices: show product.metadata.localizedPriceString from the store, never a hardcoded "$0.99"
// (szS2KMxZsl4 [00:06:04]).
// Compiled against IAP 5.4.3 in Unity 6000.3.21f1 on 2026-09-24 (tests/code/unity-mobile/test_live_packages.py).
// Not run against a store: purchases need a device, a sandbox account and store products.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Unity.Services.Core;
using UnityEngine.Purchasing;

namespace AgentKit.Mobile
{
    public sealed class Iap5Store
    {
        readonly PurchaseLedger m_Ledger;
        readonly Func<string, bool> m_Grant;
        readonly Func<PendingOrder, bool> m_Validate;
        readonly Dictionary<string, PendingOrder> m_Pending = new Dictionary<string, PendingOrder>();
        StoreController m_Store;

        public bool Connected { get; private set; }
        public bool ProductsFetchFailed { get; private set; }
        public bool PurchasesFetchFailed { get; private set; }
        public bool WasDisconnected { get; private set; }
        public readonly HashSet<string> Entitled = new HashSet<string>();
        public event Action StateChanged;   // refresh buy buttons (enabled, Owned, price)
        public event Action InvalidReceipt; // show "purchase failed": nothing was granted or confirmed
        public event Action<string, string> OnAppleJws;   // (productId, jwsRepresentation) for attribution SDKs

        public Iap5Store(PurchaseLedger ledger, Func<string, bool> grant, Func<PendingOrder, bool> validate = null)
        {
            m_Ledger = ledger ?? throw new ArgumentNullException(nameof(ledger));
            m_Grant = grant ?? throw new ArgumentNullException(nameof(grant));
            m_Validate = validate;
        }

        /// <summary>The store's localized price ("0,99 EUR", "$0.99"...), or null before FetchProducts.</summary>
        public string PriceString(string productId) => m_Store?.GetProductById(productId)?.metadata?.localizedPriceString;

        public async Task InitializeAsync(IEnumerable<ProductDefinition> products)
        {
            await UnityServices.InitializeAsync();
            m_Store = UnityIAPServices.StoreController();
            m_Store.OnStoreConnected += () => { Connected = true; StateChanged?.Invoke(); };
            m_Store.OnStoreDisconnected += d => { Connected = false; WasDisconnected = true; StateChanged?.Invoke(); };
            m_Store.OnProductsFetched += p => { StateChanged?.Invoke(); m_Store.FetchPurchases(); };
            m_Store.OnProductsFetchFailed += f => ProductsFetchFailed = true;
            m_Store.OnPurchasesFetched += OnPurchasesFetched;
            m_Store.OnPurchasesFetchFailed += f => PurchasesFetchFailed = true;   // pending orders retry next launch
            m_Store.OnPurchasePending += Process;
            m_Store.OnPurchaseConfirmed += OnConfirmed;
            m_Store.OnPurchaseFailed += f => { m_Ledger.OnPurchaseFailed(); StateChanged?.Invoke(); };
            m_Store.OnPurchaseDeferred += d => { m_Ledger.OnPurchaseDeferred(); StateChanged?.Invoke(); };
            await m_Store.Connect();
            m_Store.FetchProducts(products.ToList());
        }

        /// <summary>Buy a FETCHED product (the string overload buys an unfetched product as unknown).</summary>
        public bool Buy(string productId)
        {
            if (m_Store == null || !m_Ledger.CanStartPurchase(Connected)) return false;
            var product = m_Store.GetProductById(productId);
            if (product == null) return false;
            m_Ledger.BeginPurchase();
            StateChanged?.Invoke();
            m_Store.PurchaseProduct(product);
            return true;
        }

        static string ProductId(Order o) => o.CartOrdered?.Items().FirstOrDefault()?.Product?.definition?.id;

        void Process(PendingOrder order)
        {
            var tx = order.Info?.TransactionID;
            if (!string.IsNullOrEmpty(tx)) m_Pending[tx] = order;
            var outcome = m_Ledger.HandlePending(tx, ProductId(order), m_Grant, () => m_Store.ConfirmPurchase(order),
                                                 m_Validate == null ? (Func<bool>)null : () => m_Validate(order));
            if (outcome == PendingOutcome.InvalidReceipt) InvalidReceipt?.Invoke();
            else if (outcome == PendingOutcome.Granted)
            {
                var jws = order.Info?.Apple?.jwsRepresentation;
                if (!string.IsNullOrEmpty(jws)) OnAppleJws?.Invoke(ProductId(order), jws);
            }
            StateChanged?.Invoke();
        }

        void OnPurchasesFetched(Orders orders)
        {
            foreach (var c in orders.ConfirmedOrders)
            {
                var id = ProductId(c);
                if (id != null && c.CartOrdered.Items().FirstOrDefault()?.Product?.definition?.type != ProductType.Consumable) Entitled.Add(id);
            }
            foreach (var p in orders.PendingOrders) Process(p);   // same idempotent path as OnPurchasePending
            StateChanged?.Invoke();
        }

        void OnConfirmed(Order order)
        {
            var tx = order.Info?.TransactionID;
            if (order is FailedOrder f && f.FailureReason != PurchaseFailureReason.DuplicateTransaction)
                m_Ledger.OnConfirmFailed(tx);          // keep the PendingOrder; RetryConfirmations() later
            else
            {
                m_Ledger.OnConfirmed(tx);
                if (!string.IsNullOrEmpty(tx)) m_Pending.Remove(tx);
            }
            StateChanged?.Invoke();
        }

        /// <summary>Retry failed confirmations with the kept PendingOrder (never grant again).</summary>
        public int RetryConfirmations()
        {
            int n = 0;
            foreach (var tx in m_Ledger.RetryConfirm.ToList())
                if (m_Pending.TryGetValue(tx, out var po)) { m_Store.ConfirmPurchase(po); n++; }
            return n;
        }

        /// <summary>Apple requires a Restore Purchases button; success only means the resync ran.</summary>
        public void Restore(Action<bool, string> done) => m_Store?.RestoreTransactions(done);

        /// <summary>Revoke entitlements only when the last fetch is trustworthy.</summary>
        public bool SafeToRevoke => PurchaseLedger.SafeToRevokeOnMissing(ProductsFetchFailed, PurchasesFetchFailed, WasDisconnected, false);
    }
}
