// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). A change-tracked data source for UI
// Toolkit runtime binding (6000.0+).
// - [CreateProperty] on every bound member; the binding id in UXML/C# is the TARGET property name
//   ("text", "value"), the data-source-path is this member's name (6.3 Manual, runtime binding).
// - [GeneratePropertyBag] (+ the assembly attribute below) avoids reflection property bags;
//   INotifyBindablePropertyChanged + IDataSourceViewHashProvider make bindings update only on change
//   (Nicolas Borromeo, Unity, bECmaYIvZJg [00:33:15]-[00:34:53]).
// - Strings are built once per change, never in a getter, so an unchanged HUD allocates nothing per
//   frame (git-amend's getter-built string allocates on every read: note on g2a4ZK8cEso).
using System;
using Unity.Properties;
using UnityEngine;
using UnityEngine.UIElements;

[assembly: GeneratePropertyBagsForAssembly]

namespace AgentUI
{
    [GeneratePropertyBag]
    public partial class HudModel : INotifyBindablePropertyChanged, IDataSourceViewHashProvider
    {
        public event EventHandler<BindablePropertyChangedEventArgs> propertyChanged;

        long m_Version;
        int m_Health = 100, m_MaxHealth = 100, m_Ammo = 30, m_Reserve = 90;
        string m_HealthText = "100 / 100", m_AmmoText = "30", m_ReserveText = "/ 90";

        [CreateProperty]
        public int Health
        {
            get => m_Health;
            set
            {
                value = Mathf.Clamp(value, 0, m_MaxHealth);
                if (value == m_Health) return;
                m_Health = value;
                m_HealthText = m_Health + " / " + m_MaxHealth;
                Notify(nameof(Health)); Notify(nameof(Health01)); Notify(nameof(HealthText));
            }
        }

        [CreateProperty]
        public int MaxHealth
        {
            get => m_MaxHealth;
            set
            {
                value = Mathf.Max(1, value);
                if (value == m_MaxHealth) return;
                m_MaxHealth = value;
                m_Health = Mathf.Min(m_Health, m_MaxHealth);
                m_HealthText = m_Health + " / " + m_MaxHealth;
                Notify(nameof(MaxHealth)); Notify(nameof(Health01)); Notify(nameof(HealthText));
            }
        }

        [CreateProperty] public float Health01 => (float)m_Health / m_MaxHealth;
        [CreateProperty] public string HealthText => m_HealthText;

        [CreateProperty]
        public int Ammo
        {
            get => m_Ammo;
            set
            {
                value = Mathf.Max(0, value);
                if (value == m_Ammo) return;
                m_Ammo = value;
                m_AmmoText = m_Ammo.ToString();
                Notify(nameof(Ammo)); Notify(nameof(AmmoText));
            }
        }

        [CreateProperty]
        public int Reserve
        {
            get => m_Reserve;
            set
            {
                value = Mathf.Max(0, value);
                if (value == m_Reserve) return;
                m_Reserve = value;
                m_ReserveText = "/ " + m_Reserve;
                Notify(nameof(Reserve)); Notify(nameof(ReserveText));
            }
        }

        [CreateProperty] public string AmmoText => m_AmmoText;
        [CreateProperty] public string ReserveText => m_ReserveText;

        public long Version => m_Version;
        public long GetViewHashCode() => m_Version;

        void Notify(string property)
        {
            m_Version++;
            propertyChanged?.Invoke(this, new BindablePropertyChangedEventArgs(property));
        }
    }
}
