// Game.Core: definition values copied out of a ScriptableObject before runtime modifiers touch them
// (Tarodev, tE1qH8OxO2Y [00:06:43], [00:11:18]: "the fact that it's a struct is very important").
// A struct assignment copies, so a potion or a difficulty modifier changes the copy and the asset stays
// "set in stone". Mutating the ScriptableObject instead writes into Editor memory and silently vanishes
// in a build (Code Monkey, 5a-ztc5gcFw [00:04:17]).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A14).
using System;

namespace Game.Core
{
    [Serializable]
    public struct HealthStats
    {
        public float maxHealth;
        public float invulnerableSeconds;

        public HealthStats Scaled(float healthFactor)
        {
            var copy = this;                 // a copy: the caller's value is untouched
            copy.maxHealth *= healthFactor;
            return copy;
        }
    }
}
