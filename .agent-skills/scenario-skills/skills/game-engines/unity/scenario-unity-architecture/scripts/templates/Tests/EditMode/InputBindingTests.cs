// EditMode tests of input: project-wide actions exist and cover keyboard-mouse and gamepad; rebinding
// through virtual devices (InputTestFixture) persists to a file, survives a "relaunch" (fresh asset)
// and resets; the traps (enabled action, composite, Escape on Button actions, duplicates) are pinned.
// Each test works on a COPY of the project's actions built from the .inputactions JSON, so overrides
// never touch the project asset.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A5).
using System;
using System.IO;
using Game.Runtime;
using NUnit.Framework;
using UnityEditor;
using UnityEngine.InputSystem;

namespace Game.Tests
{
    public class ProjectWideActionsTests
    {
        // The asset Project Settings assigns (and builds preload). Read it from EditorBuildSettings:
        // after any InputTestFixture test in the same run, InputSystem.actions returns null (observed
        // with Input System 1.20.0 on 6000.3.21f1), so a test that relies on it passes alone and
        // fails in the full suite.
        internal static InputActionAsset Configured()
        {
            EditorBuildSettings.TryGetConfigObject("com.unity.input.settings.actions", out InputActionAsset configured);
            return configured;
        }

        [Test]
        public void ProjectWideActions_AreAssigned_AndCoverKeyboardAndGamepad()
        {
            var asset = Configured();
            Assert.IsNotNull(asset, "no project-wide actions (Project Settings > Input System Package)");
            foreach (var name in new[] { "Player/Move", "Player/Jump", "Player/Attack", "Player/Interact" })
            {
                var a = asset.FindAction(name);
                Assert.IsNotNull(a, name);
                Assert.GreaterOrEqual(RebindFlow.BindingIndexForGroup(a, "Keyboard&Mouse"), 0, name + " has no Keyboard&Mouse binding");
                Assert.GreaterOrEqual(RebindFlow.BindingIndexForGroup(a, "Gamepad"), 0, name + " has no Gamepad binding");
            }
        }
    }

    public class InputBindingTests : InputTestFixture
    {
        string m_Path;
        Keyboard m_Kb;

        internal static InputActionAsset FreshActions()
        {
            // the configured project-wide asset, never "the first .inputactions found": a second asset in
            // the project (observed: a JSON-edited copy) silently changes what the tests exercise
            var configured = ProjectWideActionsTests.Configured();
            Assert.IsNotNull(configured, "no project-wide actions configured");
            return InputActionAsset.FromJson(File.ReadAllText(AssetDatabase.GetAssetPath(configured)));
        }

        public override void Setup()
        {
            // resolve the project asset path before the fixture resets the input system
            s_Template ??= FreshActions().ToJson();
            base.Setup();
            m_Kb = InputSystem.AddDevice<Keyboard>();
            m_Path = Path.Combine(Path.GetTempPath(), "arch-bindings-" + Guid.NewGuid().ToString("N") + ".json");
        }

        public override void TearDown()
        {
            if (File.Exists(m_Path)) File.Delete(m_Path);
            base.TearDown();
        }

        static string s_Template;
        static InputActionAsset Copy() => InputActionAsset.FromJson(s_Template);

        void Complete() { currentTime += 0.2; InputSystem.Update(); }   // past OnMatchWaitForAnother

        [Test]
        public void Rebinding_AnEnabledAction_Throws()
        {
            var jump = Copy().FindAction("Player/Jump");
            jump.Enable();
            var ex = Assert.Throws<InvalidOperationException>(() => jump.PerformInteractiveRebinding(0));
            StringAssert.Contains("while it is enabled", ex.Message);
        }

        [Test]
        public void Rebinding_ACompositeHead_Throws_PartsAreFine()
        {
            var move = Copy().FindAction("Player/Move");
            int head = -1;
            for (int i = 0; i < move.bindings.Count; i++) if (move.bindings[i].isComposite) { head = i; break; }
            Assert.GreaterOrEqual(head, 0);
            Assert.Throws<InvalidOperationException>(() => move.PerformInteractiveRebinding(head));
            Assert.Throws<ArgumentException>(() => RebindFlow.Start(move, head, RebindFlow.Options.Keyboard, null));
        }

        [Test]
        public void InteractiveRebind_Persists_SurvivesRelaunch_AndResets()
        {
            var asset = Copy();
            asset.FindActionMap("Player").Enable();
            var jump = asset.FindAction("Player/Jump");
            int kb = RebindFlow.BindingIndexForGroup(jump, "Keyboard&Mouse");
            Assert.AreEqual("<Keyboard>/space", jump.bindings[kb].effectivePath);

            RebindFlow.Result? result = null;
            var flow = RebindFlow.Start(jump, kb, RebindFlow.Options.Keyboard, r => result = r);
            Assert.IsFalse(jump.enabled, "disabled while waiting for input");
            Press(m_Kb.kKey);
            Complete();
            Assert.IsTrue(result.HasValue, "the rebind did not complete");
            Assert.AreEqual(RebindFlow.Outcome.Rebound, result.Value.outcome);
            Assert.AreEqual("<Keyboard>/k", jump.bindings[kb].effectivePath);
            Assert.IsTrue(jump.enabled, "re-enabled after the rebind");
            Assert.IsTrue(flow.OperationDisposed);
            Release(m_Kb.kKey);

            int performed = 0;
            jump.performed += _ => performed++;
            Press(m_Kb.spaceKey); Release(m_Kb.spaceKey);
            Assert.AreEqual(0, performed, "the old key no longer fires");
            Press(m_Kb.kKey); Release(m_Kb.kKey);
            Assert.AreEqual(1, performed, "the new key fires");

            BindingStore.Save(asset, m_Path);
            StringAssert.Contains("<Keyboard>/k", File.ReadAllText(m_Path));

            var relaunched = Copy();                                   // nothing survives but the file
            Assert.IsTrue(BindingStore.Load(relaunched, m_Path));
            Assert.AreEqual("<Keyboard>/k", relaunched.FindAction("Player/Jump").bindings[kb].effectivePath);

            BindingStore.ResetAll(relaunched, m_Path);
            Assert.AreEqual("<Keyboard>/space", relaunched.FindAction("Player/Jump").bindings[kb].effectivePath);
            Assert.IsFalse(File.Exists(m_Path), "reset deletes the persisted overrides");
            var third = Copy();
            Assert.IsFalse(BindingStore.Load(third, m_Path));
            Assert.AreEqual("<Keyboard>/space", third.FindAction("Player/Jump").bindings[kb].effectivePath);
        }

        [Test]
        public void Escape_CancelsTheFlow_ButIsBindable_WithoutWithCancelingThrough()
        {
            var asset = Copy();
            var jump = asset.FindAction("Player/Jump");
            int kb = RebindFlow.BindingIndexForGroup(jump, "Keyboard&Mouse");

            RebindFlow.Result? result = null;
            RebindFlow.Start(jump, kb, RebindFlow.Options.Keyboard, r => result = r);
            Press(m_Kb.escapeKey);
            Complete();
            Assert.AreEqual(RebindFlow.Outcome.Canceled, result.Value.outcome);
            Assert.AreEqual("<Keyboard>/space", jump.bindings[kb].effectivePath);
            Release(m_Kb.escapeKey);

            // control: the package default does not cancel through Escape for a Button action
            var raw = jump.PerformInteractiveRebinding(kb).Start();
            Press(m_Kb.escapeKey);
            Complete();
            Assert.AreEqual("<Keyboard>/escape", jump.bindings[kb].effectivePath);
            raw.Dispose();
        }

        [Test]
        public void MouseClick_IsIgnored_ForAKeyboardRow()
        {
            var mouse = InputSystem.AddDevice<Mouse>();
            var jump = Copy().FindAction("Player/Jump");
            int kb = RebindFlow.BindingIndexForGroup(jump, "Keyboard&Mouse");
            RebindFlow.Result? result = null;
            var flow = RebindFlow.Start(jump, kb, new RebindFlow.Options { excludeMouseButtons = true, waitForAnother = 0.05f }, r => result = r);
            Press(mouse.leftButton);
            Complete();
            Assert.IsFalse(result.HasValue, "a click must not become the binding");
            Assert.IsTrue(flow.IsRunning);
            Press(m_Kb.jKey);
            Complete();
            Assert.AreEqual("<Keyboard>/j", jump.bindings[kb].effectivePath);
        }

        [Test]
        public void Duplicate_IsRejected_AndThePreviousOverrideIsRestored()
        {
            var asset = Copy();
            var interact = asset.FindAction("Player/Interact");
            int kb = RebindFlow.BindingIndexForGroup(interact, "Keyboard&Mouse");

            RebindFlow.Result? r1 = null;
            RebindFlow.Start(interact, kb, RebindFlow.Options.Keyboard, r => r1 = r);
            Press(m_Kb.fKey); Complete(); Release(m_Kb.fKey);
            Assert.AreEqual(RebindFlow.Outcome.Rebound, r1.Value.outcome);

            RebindFlow.Result? r2 = null;
            RebindFlow.Start(interact, kb, RebindFlow.Options.Keyboard, r => r2 = r);
            Press(m_Kb.spaceKey); Complete(); Release(m_Kb.spaceKey);   // Space belongs to Jump
            Assert.AreEqual(RebindFlow.Outcome.Duplicate, r2.Value.outcome);
            Assert.AreEqual("Jump", r2.Value.conflictAction);
            Assert.AreEqual("<Keyboard>/f", interact.bindings[kb].effectivePath, "previous override kept, not the default E");
        }

        [Test]
        public void CompositeParts_ComparedOnlyWithEarlierParts()
        {
            var move = Copy().FindAction("Player/Move");
            int up = RebindFlow.BindingIndexForGroup(move, "Keyboard&Mouse", "up");
            int down = RebindFlow.BindingIndexForGroup(move, "Keyboard&Mouse", "down");
            Assert.Less(up, down);

            RebindFlow.Result? r1 = null;
            RebindFlow.Start(move, down, RebindFlow.Options.Keyboard, r => r1 = r);
            Press(m_Kb.wKey); Complete(); Release(m_Kb.wKey);          // W is the earlier "up" part
            Assert.AreEqual(RebindFlow.Outcome.Duplicate, r1.Value.outcome);

            RebindFlow.Result? r2 = null;
            RebindFlow.Start(move, up, RebindFlow.Options.Keyboard, r => r2 = r);
            Press(m_Kb.sKey); Complete(); Release(m_Kb.sKey);          // S is the LATER "down" part: allowed
            Assert.AreEqual(RebindFlow.Outcome.Rebound, r2.Value.outcome);
            Assert.AreEqual("<Keyboard>/s", move.bindings[up].effectivePath);
        }

        [Test]
        public void GamepadRow_IgnoresKeyboard_AndOneActionServesEveryDevice()
        {
            var pad = InputSystem.AddDevice<Gamepad>();
            var asset = Copy();
            var jump = asset.FindAction("Player/Jump");
            int gp = RebindFlow.BindingIndexForGroup(jump, "Gamepad");
            int kb = RebindFlow.BindingIndexForGroup(jump, "Keyboard&Mouse");

            RebindFlow.Result? result = null;
            RebindFlow.Start(jump, gp, RebindFlow.Options.Gamepad, r => result = r);
            Press(m_Kb.kKey); Complete(); Release(m_Kb.kKey);
            Assert.IsFalse(result.HasValue, "keyboard input ignored by a gamepad row");
            Press(pad.rightShoulder); Complete(); Release(pad.rightShoulder);
            Assert.AreEqual(RebindFlow.Outcome.Rebound, result.Value.outcome);
            Assert.AreEqual("<Gamepad>/rightShoulder", jump.bindings[gp].effectivePath);
            Assert.AreEqual("<Keyboard>/space", jump.bindings[kb].effectivePath, "keyboard row untouched");

            asset.FindActionMap("Player").Enable();
            int performed = 0;
            jump.performed += _ => performed++;
            Press(pad.rightShoulder); Release(pad.rightShoulder);
            Press(m_Kb.spaceKey); Release(m_Kb.spaceKey);
            Assert.AreEqual(2, performed, "one action, two devices");
        }

        [Test]
        public void LoadBindingOverridesFromJson_ReplacesUnlessToldToLayer()
        {
            var asset = Copy();
            var jump = asset.FindAction("Player/Jump");
            var interact = asset.FindAction("Player/Interact");
            int jk = RebindFlow.BindingIndexForGroup(jump, "Keyboard&Mouse");
            int ik = RebindFlow.BindingIndexForGroup(interact, "Keyboard&Mouse");
            jump.ApplyBindingOverride(jk, "<Keyboard>/k");
            BindingStore.Save(asset, m_Path);                           // file: Jump -> K only

            var target = Copy();
            target.FindAction("Player/Interact").ApplyBindingOverride(ik, "<Keyboard>/f");   // applied earlier in the session
            BindingStore.Load(target, m_Path);                          // package default: removeExisting = true
            Assert.AreEqual("<Keyboard>/k", target.FindAction("Player/Jump").bindings[jk].effectivePath);
            Assert.AreEqual("<Keyboard>/e", target.FindAction("Player/Interact").bindings[ik].effectivePath, "the earlier override was wiped");

            var layered = Copy();
            layered.FindAction("Player/Interact").ApplyBindingOverride(ik, "<Keyboard>/f");
            BindingStore.Load(layered, m_Path, removeExisting: false);
            Assert.AreEqual("<Keyboard>/k", layered.FindAction("Player/Jump").bindings[jk].effectivePath);
            Assert.AreEqual("<Keyboard>/f", layered.FindAction("Player/Interact").bindings[ik].effectivePath, "layered: kept");
        }

        static InputActionMap ShortcutMap(out InputAction b, out InputAction shiftB)
        {
            var map = new InputActionMap("Shortcuts");
            b = map.AddAction("B", InputActionType.Button, "<Keyboard>/b");
            shiftB = map.AddAction("ShiftB", InputActionType.Button);
            shiftB.AddCompositeBinding("OneModifier").With("Modifier", "<Keyboard>/shift").With("Binding", "<Keyboard>/b");
            return map;
        }

        [Test]
        public void ShiftB_ConsumesB_OnlyWithComplexityBasedShortcutResolution()
        {
            bool packageDefault = UnityEngine.ScriptableObject.CreateInstance<InputSettings>().shortcutKeysConsumeInput;
            UnityEngine.Debug.Log("[InputSettings] shortcutKeysConsumeInput default in 1.20: " + packageDefault);
            foreach (bool consume in new[] { true, false })
            {
                InputSystem.settings.shortcutKeysConsumeInput = consume;
                var map = ShortcutMap(out var b, out var shiftB);
                int nb = 0, nsb = 0;
                b.performed += _ => nb++;
                shiftB.performed += _ => nsb++;
                map.Enable();
                Press(m_Kb.leftShiftKey);
                Press(m_Kb.bKey);
                Release(m_Kb.bKey);
                Release(m_Kb.leftShiftKey);
                map.Disable();
                Assert.AreEqual(1, nsb, "Shift+B fires (consume " + consume + ")");
                Assert.AreEqual(consume ? 0 : 1, nb, "plain B " + (consume ? "consumed" : "also fires"));
            }
        }

        [Test]
        public void DuplicateCheck_ComparesModifierCombosAsAWhole_WhenShortcutsConsumeInput()
        {
            var map = new InputActionMap("Player");
            var inventory = map.AddAction("Inventory", InputActionType.Button);
            inventory.AddBinding("<Keyboard>/i", groups: "Keyboard&Mouse");
            var dropAll = map.AddAction("DropAll", InputActionType.Button);
            dropAll.AddCompositeBinding("OneModifier").With("Modifier", "<Keyboard>/shift", "Keyboard&Mouse").With("Binding", "<Keyboard>/b", "Keyboard&Mouse");
            var interact = map.AddAction("Interact", InputActionType.Button);
            interact.AddBinding("<Keyboard>/e", groups: "Keyboard&Mouse");
            int ik = RebindFlow.BindingIndexForGroup(interact, "Keyboard&Mouse");

            interact.ApplyBindingOverride(ik, "<Keyboard>/b");
            Assert.IsFalse(RebindFlow.TryFindDuplicate(interact, ik, true, out _, out _), "B is not Shift+B when shortcuts consume input");
            Assert.IsTrue(RebindFlow.TryFindDuplicate(interact, ik, false, out var other, out _), "without it, Shift+B also fires B");
            Assert.AreEqual("DropAll", other);
            interact.ApplyBindingOverride(ik, "<Keyboard>/i");
            Assert.IsTrue(RebindFlow.TryFindDuplicate(interact, ik, true, out other, out _));
            Assert.AreEqual("Inventory", other);

            // a second combo equal to Shift+B is a conflict in both modes
            var sort = map.AddAction("Sort", InputActionType.Button);
            sort.AddCompositeBinding("OneModifier").With("Modifier", "<Keyboard>/shift", "Keyboard&Mouse").With("Binding", "<Keyboard>/n", "Keyboard&Mouse");
            int sortKey = RebindFlow.BindingIndexForGroup(sort, "Keyboard&Mouse", "binding");
            sort.ApplyBindingOverride(sortKey, "<Keyboard>/b");
            Assert.IsTrue(RebindFlow.TryFindDuplicate(sort, sortKey, true, out other, out var otherPath));
            Assert.AreEqual("DropAll", other);
            StringAssert.Contains("<keyboard>/shift", otherPath);
        }

        [Test]
        public void SwitchingMaps_ChangesContext()
        {
            var asset = Copy();
            InputContext.SwitchTo(asset, "Player");
            Assert.IsTrue(asset.FindActionMap("Player").enabled);
            InputContext.SwitchTo(asset, "UI");
            Assert.IsFalse(asset.FindActionMap("Player").enabled);
            Assert.IsTrue(asset.FindActionMap("UI").enabled);
            Assert.Throws<ArgumentException>(() => InputContext.Require(asset, "Player/NoSuchAction"));
        }
    }
}
