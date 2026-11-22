// scenario-unity-mobile v0.2 (Unity Expert Skills, 2026-09-24). LevelPlay 9 (com.unity.services.levelplay)
// rewarded and interstitial ads wired to RewardGate and AdPacing. Compiles only when LevelPlay
// >= 9.0.0 is installed (asmdef versionDefines -> AGENTKIT_LEVELPLAY9): 6000.3.21f1 defaults to
// 8.10.1, so add "com.unity.services.levelplay": "9.5.1" (from below 9.0.0, first move
// Assets/LevelPlay and Assets/Mobile Dependency Resolver to an archive folder, per the upgrade guide).
//
// Rules (LevelPlay docs): register OnInitSuccess/OnInitFailed BEFORE LevelPlay.Init; create ad
// objects only after OnInitSuccess; LoadAd, then IsAdReady() and !IsPlacementCapped before ShowAd;
// reload after close and after load failure; grant in OnAdRewarded even when it arrives after
// OnAdClosed. Remove ValidateIntegration and the test suite before release (YT Code Master,
// GvIpY8yE4UY [00:44:32]). Android API 33+ needs the AD_ID permission; iOS needs SKAdNetworkItems
// (automatic on fresh 9.1.0+ installs) and the SDK privacy manifests. Privacy (read from the 9.5.1
// source): LevelPlayPrivacySettings.SetGDPRConsent / SetCCPA / SetCOPPA; LevelPlay.SetConsent is
// [Obsolete] in 9.5.1. Init only after the consent answer and the first milestone (AdsInitGate);
// the flags are set before LevelPlay.Init so the first ad request carries them [added].
// AD_ID: LevelPlay 9.5.1 adds it to the manifest from its own IPostGenerateGradleAndroidProject hook
// when Developer Settings > Declare AD_ID Permission is on (read from the source): check the built
// AAB with ut_mobile.aab_facts(...)["permissions"], and clean-build after changing that setting.
// Compiled against LevelPlay 9.5.1 in Unity 6000.3.21f1 on 2026-09-24 (tests/code/unity-mobile/test_live_packages.py).
// Not run against the ad network: needs an app key, a device and registered test devices.
using System;
using Unity.Services.LevelPlay;

namespace AgentKit.Mobile
{
    public sealed class LevelPlayAds
    {
        readonly string m_AppKey, m_RewardedUnit, m_InterstitialUnit;
        readonly Action<string, int> m_GrantReward;   // (reward name, amount) from the dashboard config
        public readonly RewardGate Rewards = new RewardGate();
        public readonly AdPacing Pacing = new AdPacing();
        LevelPlayRewardedAd m_Rewarded;
        LevelPlayInterstitialAd m_Interstitial;
        public bool Initialized { get; private set; }
        public string LastError { get; private set; }

        public LevelPlayAds(string appKey, string rewardedAdUnitId, string interstitialAdUnitId, Action<string, int> grantReward)
        {
            m_AppKey = appKey; m_RewardedUnit = rewardedAdUnitId; m_InterstitialUnit = interstitialAdUnitId;
            m_GrantReward = grantReward ?? throw new ArgumentNullException(nameof(grantReward));
        }

        /// <summary>Call late (after onboarding and the consent answer), not in the first scene's Awake:
        /// SDK init at boot is an ANR source. gdprConsent null = no GDPR answer needed (outside the EEA/UK);
        /// ccpaOptOut/coppaChild as answered by your consent flow. testSuite only in development builds.</summary>
        public void Init(bool? gdprConsent = null, bool? ccpaOptOut = null, bool? coppaChild = null, bool testSuite = false)
        {
            if (gdprConsent.HasValue) LevelPlayPrivacySettings.SetGDPRConsent(gdprConsent.Value);
            if (ccpaOptOut.HasValue) LevelPlayPrivacySettings.SetCCPA(ccpaOptOut.Value);
            if (coppaChild.HasValue) LevelPlayPrivacySettings.SetCOPPA(coppaChild.Value);
            LevelPlay.OnInitSuccess += OnInitSuccess;      // listeners first
            LevelPlay.OnInitFailed += e => LastError = "init " + e.ErrorCode + ": " + e.ErrorMessage;   // retry later (connectivity)
            if (testSuite) LevelPlay.SetMetaData("is_test_suite", "enable");
            LevelPlay.Init(m_AppKey);
        }

        void OnInitSuccess(LevelPlayConfiguration config)
        {
            Initialized = true;
            m_Rewarded = new LevelPlayRewardedAd(m_RewardedUnit);          // ad objects only after init success
            m_Rewarded.OnAdRewarded += (info, reward) => Rewards.OnAdRewarded(() => m_GrantReward(reward.Name, reward.Amount));
            m_Rewarded.OnAdClosed += info => { Rewards.OnAdClosed(); m_Rewarded.LoadAd(); };
            m_Rewarded.OnAdLoadFailed += err => LastError = "rewarded load " + err.ErrorCode;
            m_Rewarded.LoadAd();
            m_Interstitial = new LevelPlayInterstitialAd(m_InterstitialUnit);
            m_Interstitial.OnAdClosed += info => m_Interstitial.LoadAd();
            m_Interstitial.OnAdLoadFailed += err => LastError = "interstitial load " + err.ErrorCode;
            m_Interstitial.LoadAd();
        }

        public bool CanShowRewarded(string placement = null)
            => m_Rewarded != null && m_Rewarded.IsAdReady() && (placement == null || !LevelPlayRewardedAd.IsPlacementCapped(placement));

        public bool ShowRewarded(string placement = null)
        {
            if (!CanShowRewarded(placement)) return false;
            Rewards.BeginShow();
            m_Rewarded.ShowAd(placement);
            return true;
        }

        public bool ShowInterstitial(double now, string placement = null)
        {
            if (m_Interstitial == null) return false;
            bool capped = placement != null && LevelPlayInterstitialAd.IsPlacementCapped(placement);
            if (!Pacing.CanShowInterstitial(now, m_Interstitial.IsAdReady(), capped)) return false;
            Pacing.MarkShown(now);
            m_Interstitial.ShowAd(placement);
            return true;
        }
    }
}
