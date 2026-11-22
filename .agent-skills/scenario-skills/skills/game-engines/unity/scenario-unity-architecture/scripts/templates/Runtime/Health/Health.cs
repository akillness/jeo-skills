// Game.Runtime: thin MonoBehaviour adapter over Game.Core.HealthModel. It raises a C# event for
// its own GameObject's components and, optionally, an event channel asset for systems that must not
// reference it (UI, audio). Death is an event, never a Destroy (Weimann, 8TIkManpEu4 [00:12:02]).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System;
using Game.Core;
using UnityEngine;

namespace Game.Runtime
{
    public sealed class Health : MonoBehaviour, IDamageable
    {
        [SerializeField] HealthConfig config;
        [SerializeField] FloatEventChannel changedChannel;   // optional: current/max ratio for HUDs
        [SerializeField] VoidEventChannel diedChannel;       // optional

        HealthModel m_Model;
        public HealthModel Model => m_Model ??= Build();

        public event Action Died;

        HealthModel Build()
        {
            var m = config != null ? config.CreateModel() : new HealthModel(100f);
            m.Changed += (cur, max) => { if (changedChannel != null) changedChannel.Raise(cur / max); };
            m.Died += () => { Died?.Invoke(); if (diedChannel != null) diedChannel.Raise(); };
            return m;
        }

        public void Configure(HealthConfig cfg, FloatEventChannel changed = null, VoidEventChannel died = null)
        {
            config = cfg; changedChannel = changed; diedChannel = died; m_Model = null;
        }

        public float ApplyDamage(in DamageInfo info) => Model.Apply(info, Time.timeAsDouble);
        public float Heal(float amount) => Model.Heal(amount);
    }
}
