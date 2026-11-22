// EditMode tests of the service registry: fail loudly on a missing service, and a reset that runs at
// SubsystemRegistration (checked by reflection, since EditMode tests do not enter Play mode).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A8).
using System;
using System.Linq;
using System.Reflection;
using Game.Runtime;
using NUnit.Framework;
using UnityEngine;

namespace Game.Tests
{
    public class ServicesTests
    {
        interface IClock { double Now { get; } }
        sealed class FakeClock : IClock { public double Now => 42; }

        static void InvokeReset()
        {
            var m = typeof(Services).GetMethods(BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public)
                .Single(x => x.GetCustomAttribute<RuntimeInitializeOnLoadMethodAttribute>() != null);
            Assert.AreEqual(RuntimeInitializeLoadType.SubsystemRegistration, m.GetCustomAttribute<RuntimeInitializeOnLoadMethodAttribute>().loadType);
            m.Invoke(null, null);
        }

        [TearDown] public void TearDown() => InvokeReset();

        [Test]
        public void Get_ThrowsWithTheMissingType_RegisterThenGetWorks()
        {
            InvokeReset();
            var ex = Assert.Throws<InvalidOperationException>(() => Services.Get<IClock>());
            StringAssert.Contains("IClock", ex.Message);
            Services.Register<IClock>(new FakeClock());
            Assert.AreEqual(42, Services.Get<IClock>().Now);
        }

        [Test]
        public void Reset_ClearsTheRegistry_LikeANewPlaySessionWithDomainReloadOff()
        {
            Services.Register<IClock>(new FakeClock());
            Assert.AreEqual(1, Services.Count);
            InvokeReset();
            Assert.AreEqual(0, Services.Count);
            Assert.IsFalse(Services.TryGet<IClock>(out _));
        }
    }
}
