// PlayMode test of local multiplayer input: two PlayerInput players, one gamepad each. The second
// player gets its OWN COPY of the actions asset, so each player must read playerInput.actions, never
// InputSystem.actions (1.20 manual, using-playerinput-workflow).
// Learned live (2026-09-24): v1 looked up "the first InputActionAsset" and started failing once another
// .inputactions file existed in the project (a JSON-edited copy without gamepad Jump): no control
// resolved and no player reacted. Read the CONFIGURED project-wide asset instead. TearDown destroys the
// players before the fixture restores the input system (a PlayerInput left alive by a failed run threw
// ArgumentOutOfRangeException in OnDisable at Play-mode exit).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A5).
using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.TestTools;

namespace Game.Tests
{
    public class LocalMultiplayerTests : InputTestFixture
    {
        static string s_Json;
        readonly List<GameObject> m_Spawned = new List<GameObject>();

        public override void Setup()
        {
            s_Json ??= UnityEditorBridge.FindActionsJson();   // before the fixture resets the input system
            base.Setup();
        }

        public override void TearDown()
        {
            foreach (var go in m_Spawned) if (go != null) Object.DestroyImmediate(go);   // OnDisable before the restore
            m_Spawned.Clear();
            base.TearDown();
        }

        [UnityTest]
        public IEnumerator TwoGamepads_TwoPlayers_EachReadsItsOwnCopy()
        {
            var pad1 = InputSystem.AddDevice<Gamepad>();
            var pad2 = InputSystem.AddDevice<Gamepad>();
            var asset = InputActionAsset.FromJson(s_Json);

            var prefab = new GameObject("PlayerPrefab");
            m_Spawned.Add(prefab);
            prefab.SetActive(false);
            var pi = prefab.AddComponent<PlayerInput>();
            pi.actions = asset;
            pi.defaultActionMap = "Player";
            pi.neverAutoSwitchControlSchemes = true;        // local multiplayer: devices stay with their player
            pi.notificationBehavior = PlayerNotifications.InvokeCSharpEvents;

            var p1 = PlayerInput.Instantiate(prefab, controlScheme: "Gamepad", pairWithDevice: pad1);
            m_Spawned.Add(p1.gameObject);
            var p2 = PlayerInput.Instantiate(prefab, controlScheme: "Gamepad", pairWithDevice: pad2);
            m_Spawned.Add(p2.gameObject);
            yield return null;

            Assert.AreNotSame(p1.actions, p2.actions, "each player owns an actions instance");
            CollectionAssert.AreEqual(new InputDevice[] { pad1 }, p1.devices.ToArray());
            CollectionAssert.AreEqual(new InputDevice[] { pad2 }, p2.devices.ToArray());
            var jump1 = p1.actions.FindAction("Player/Jump");
            var jump2 = p2.actions.FindAction("Player/Jump");

            Press(pad2.buttonSouth, queueEventOnly: true);
            yield return null;                                // processed by the player loop's input update
            yield return null;
            string state = "p1 enabled=" + jump1.enabled + " scheme=" + p1.currentControlScheme +
                           ", p2 enabled=" + jump2.enabled + " scheme=" + p2.currentControlScheme + ", pad2.south=" + pad2.buttonSouth.isPressed + ", controls p2=" + jump2.controls.Count;
            Assert.IsTrue(jump2.IsPressed(), "player 2 must see its pad: " + state);
            Assert.IsFalse(jump1.IsPressed(), "player 1 must not react to pad 2: " + state);

            Release(pad2.buttonSouth, queueEventOnly: true);
            Press(pad1.buttonSouth, queueEventOnly: true);
            yield return null;
            yield return null;
            Assert.IsTrue(jump1.IsPressed(), "player 1 sees pad 1");
            Assert.IsFalse(jump2.IsPressed(), "player 2 ignores pad 1");
        }
    }

    static class UnityEditorBridge
    {
        /// <summary>The project's .inputactions JSON. PlayMode tests also run in players, where
        /// AssetDatabase does not exist: read the file only in the Editor.</summary>
        public static string FindActionsJson()
        {
#if UNITY_EDITOR
            // the asset Project Settings assigns, never "the first .inputactions found" (see header)
            UnityEditor.EditorBuildSettings.TryGetConfigObject("com.unity.input.settings.actions", out InputActionAsset configured);
            Assert.IsNotNull(configured, "no project-wide actions configured");
            return System.IO.File.ReadAllText(UnityEditor.AssetDatabase.GetAssetPath(configured));
#else
            Assert.Ignore("needs the Editor to read the actions asset");
            return null;
#endif
        }
    }
}
