// Game.Runtime: health tuning as data (designers edit it, code reads it). Runtime code reads Stats (a struct
// copy) and modifies the copy, never these fields.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using Game.Core;
using UnityEngine;

namespace Game.Runtime
{
    [CreateAssetMenu(menuName = "Game/Health Config", fileName = "HealthConfig")]
    public sealed class HealthConfig : ScriptableObject
    {
        [Min(1)] public float maxHealth = 100f;
        [Min(0)] public float invulnerableSeconds = 0.5f;
        [Tooltip("Damage multiplier per DamageKind (index = enum value).")]
        public float[] multipliers = { 1f, 1f, 1f };

        public float Multiplier(DamageKind kind)
        {
            int i = (int)kind;
            return multipliers != null && i >= 0 && i < multipliers.Length ? multipliers[i] : 1f;
        }

        /// <summary>A COPY of the tuning values: apply runtime modifiers to it, never to this asset.</summary>
        public HealthStats Stats => new HealthStats { maxHealth = maxHealth, invulnerableSeconds = invulnerableSeconds };

        public HealthModel CreateModel() => CreateModel(Stats);
        public HealthModel CreateModel(HealthStats stats) => new HealthModel(stats.maxHealth, stats.invulnerableSeconds, Multiplier);
    }
}
