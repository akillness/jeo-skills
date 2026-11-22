// Game.Core: health and damage rules as pure C#. The MonoBehaviour (Game.Runtime.Health) is a thin
// adapter, so the rules are tested once, in EditMode, without a scene.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (see procedures.md A2).
using System;

namespace Game.Core
{
    // Explicit values: a serialized enum is stored as its number, so inserting or reordering members
    // silently changes every saved or serialized value (Ryan Hipple, raQ3iHhE_Kk [00:46:39]).
    public enum DamageKind { Physical = 0, Fire = 1, Poison = 2 }

    public readonly struct DamageInfo
    {
        public readonly float Amount;
        public readonly DamageKind Kind;
        public DamageInfo(float amount, DamageKind kind) { Amount = amount; Kind = kind; }
    }

    public interface IDamageable
    {
        /// <summary>Returns the damage actually applied after invulnerability and resistance.</summary>
        float ApplyDamage(in DamageInfo info);
    }

    public sealed class HealthModel
    {
        readonly Func<DamageKind, float> m_Multiplier;
        readonly double m_InvulnerableSeconds;
        double m_InvulnerableUntil = double.MinValue;

        public float Max { get; }
        public float Current { get; private set; }
        public bool IsDead => Current <= 0f;

        /// <summary>(current, max) after any change.</summary>
        public event Action<float, float> Changed;
        /// <summary>Raised exactly once. Owners decide what death means (pool, ragdoll, UI); the model
        /// never destroys anything (Jason Weimann, 8TIkManpEu4 [00:12:02]).</summary>
        public event Action Died;

        public HealthModel(float max, double invulnerableSeconds = 0, Func<DamageKind, float> multiplier = null)
        {
            if (max <= 0) throw new ArgumentOutOfRangeException(nameof(max));
            Max = max;
            Current = max;
            m_InvulnerableSeconds = Math.Max(0, invulnerableSeconds);
            m_Multiplier = multiplier ?? (_ => 1f);
        }

        /// <summary>Order: dead or invulnerable check, resistance multiplier, clamp, apply, events.
        /// `now` is passed in (Time.timeAsDouble at runtime, any number in tests).</summary>
        public float Apply(in DamageInfo info, double now)
        {
            if (IsDead || info.Amount <= 0f || now < m_InvulnerableUntil) return 0f;
            float amount = Math.Max(0f, info.Amount * m_Multiplier(info.Kind));
            float applied = Math.Min(amount, Current);
            if (applied <= 0f) return 0f;
            Current -= applied;
            m_InvulnerableUntil = now + m_InvulnerableSeconds;
            Changed?.Invoke(Current, Max);
            if (IsDead) Died?.Invoke();
            return applied;
        }

        public float Heal(float amount)
        {
            if (IsDead || amount <= 0f) return 0f;
            float healed = Math.Min(amount, Max - Current);
            if (healed <= 0f) return 0f;
            Current += healed;
            Changed?.Invoke(Current, Max);
            return healed;
        }

        public HealthState Capture() => new HealthState { current = Current, max = Max };

        public void Restore(HealthState s)
        {
            if (s == null) return;
            Current = Math.Max(0f, Math.Min(s.current, Max));
            Changed?.Invoke(Current, Max);
        }
    }
}
