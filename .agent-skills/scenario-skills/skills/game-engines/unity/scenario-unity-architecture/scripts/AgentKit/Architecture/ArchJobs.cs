// AgentKit.Architecture (scenario-unity-architecture skill, 2026-09-24): project setup and architecture
// audits as batch jobs. Generic: no dependency on the Game.* templates (reflection and type names).
// Install: ut_env.install_agentkit(P, src="<skills>/scenario-unity-architecture/scripts/AgentKit").
// Every job ran in Unity 6000.3.21f1 on 2026-09-24 (tests/code/unity-architecture/, procedures.md).
//
//   ProjectFacts      Enter Play Mode, serialization, VCS mode, input handler, project-wide actions, assemblies
//   SetEnterPlayMode  {"mode": "reload_all"|"reload_scene_only"|"reload_domain_only"|"no_reload"}
//   SetVcsSettings    Force Text + Visible Meta Files (+ reads them back from ProjectSettings/*.asset)
//   AssemblyGraph     {"prefix": "Game."} assemblies, references, engine refs, editor flags, violations
//   StaticStateAudit  {"assemblies": ["Game.", "Assembly-CSharp"]} static state without a Play-mode reset
//   CreateAssets      {"specs": [{type, path, fields, refs, ref_lists}]} idempotent ScriptableObject authoring
//   SnapshotAssets    {"folders": [...], "out": path, "compare_to": path} SO hashes (memory, disk) of ONE process:
//                     catches editor tools that save assets; a Play-mode write needs ArchPlayMode "so_guard"
//   InspectAsset      {"path": "Assets/X.prefab"|".unity"} objects, components, simple serialized values
//   ImportSample      {"package": "com.unity.inputsystem", "sample": "Rebinding UI"} Package Manager sample import
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Compilation;
using UnityEditor.SceneManagement;
using UnityEngine;
using Object = UnityEngine.Object;

namespace AgentKit.Architecture
{
    public static class ArchJobs
    {
        // ------------------------------------------------------------------ facts and settings
        public static void ProjectFacts()
        {
            AgentJob.Run(() => new Dictionary<string, object>
            {
                { "enter_play_mode", EnterPlayModeName() },
                { "enter_play_mode_options_enabled", EditorSettings.enterPlayModeOptionsEnabled },
                { "enter_play_mode_options", EditorSettings.enterPlayModeOptions.ToString() },
                { "serialization_mode", EditorSettings.serializationMode.ToString() },
                { "version_control_mode", VersionControlSettings.mode },
                { "input_handler", ReadActiveInputHandler() },
                { "project_wide_actions", ProjectWideActionsPath() },
                { "assemblies", CompilationPipeline.GetAssemblies(AssembliesType.PlayerWithoutTestAssemblies).Select(a => a.name).OrderBy(n => n).ToList() },
                { "scripting_defines_standalone", PlayerSettings.GetScriptingDefineSymbols(UnityEditor.Build.NamedBuildTarget.Standalone) },
                { "api_compatibility", PlayerSettings.GetApiCompatibilityLevel(UnityEditor.Build.NamedBuildTarget.Standalone).ToString() },
            });
        }

        /// <summary>The 6.3 dropdown name for the current Enter Play Mode setting.</summary>
        public static string EnterPlayModeName()
        {
            if (!EditorSettings.enterPlayModeOptionsEnabled) return "reload_all";
            var o = EditorSettings.enterPlayModeOptions;
            bool noDomain = (o & EnterPlayModeOptions.DisableDomainReload) != 0;
            bool noScene = (o & EnterPlayModeOptions.DisableSceneReload) != 0;
            if (noDomain && noScene) return "no_reload";
            if (noDomain) return "reload_scene_only";
            if (noScene) return "reload_domain_only";
            return "reload_all";
        }

        public static void ApplyEnterPlayMode(string mode)
        {
            switch (mode)
            {
                case "reload_all":
                    EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.None;
                    EditorSettings.enterPlayModeOptionsEnabled = false; break;
                case "reload_scene_only":
                    EditorSettings.enterPlayModeOptionsEnabled = true;
                    EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload; break;
                case "reload_domain_only":
                    EditorSettings.enterPlayModeOptionsEnabled = true;
                    EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableSceneReload; break;
                case "no_reload":
                    EditorSettings.enterPlayModeOptionsEnabled = true;
                    EditorSettings.enterPlayModeOptions = EnterPlayModeOptions.DisableDomainReload | EnterPlayModeOptions.DisableSceneReload; break;
                default: throw new ArgumentException("mode must be reload_all, reload_scene_only, reload_domain_only or no_reload: " + mode);
            }
        }

        public static void SetEnterPlayMode()
        {
            AgentJob.Run(() =>
            {
                string before = EnterPlayModeName();
                ApplyEnterPlayMode(AgentJob.Str("mode", "reload_all"));
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "before", before }, { "after", EnterPlayModeName() },
                    { "editor_settings_asset", ReadSetting("ProjectSettings/EditorSettings.asset", "m_EnterPlayModeOptions") },
                    { "editor_settings_enabled", ReadSetting("ProjectSettings/EditorSettings.asset", "m_EnterPlayModeOptionsEnabled") },
                };
            });
        }

        public static void SetVcsSettings()
        {
            AgentJob.Run(() =>
            {
                var before = new Dictionary<string, object> { { "serialization", EditorSettings.serializationMode.ToString() }, { "vcs_mode", VersionControlSettings.mode } };
                if (EditorSettings.serializationMode != SerializationMode.ForceText) EditorSettings.serializationMode = SerializationMode.ForceText;
                if (VersionControlSettings.mode != "Visible Meta Files") VersionControlSettings.mode = "Visible Meta Files";
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "before", before },
                    { "after", new Dictionary<string, object> { { "serialization", EditorSettings.serializationMode.ToString() }, { "vcs_mode", VersionControlSettings.mode } } },
                    { "editor_settings_serialization", ReadSetting("ProjectSettings/EditorSettings.asset", "m_SerializationMode") },
                    { "version_control_settings_mode", ReadSetting("ProjectSettings/VersionControlSettings.asset", "m_Mode") },
                };
            });
        }

        static string ReadSetting(string rel, string key)
        {
            var p = Path.Combine(AgentJob.ProjectRoot, rel);
            if (!File.Exists(p)) return null;
            var m = Regex.Match(File.ReadAllText(p), "^\\s*" + Regex.Escape(key) + ":\\s*(.*)$", RegexOptions.Multiline);
            return m.Success ? m.Groups[1].Value.Trim() : null;
        }

        static string ReadActiveInputHandler()
        {
            // 0 = Input Manager (old), 1 = Input System package (new), 2 = both
            var v = ReadSetting("ProjectSettings/ProjectSettings.asset", "activeInputHandler");
            return v == "0" ? "InputManager" : v == "1" ? "InputSystemPackage" : v == "2" ? "Both" : v;
        }

        static string ProjectWideActionsPath()
        {
#if ENABLE_INPUT_SYSTEM
            var a = UnityEngine.InputSystem.InputSystem.actions;
            return a != null ? AssetDatabase.GetAssetPath(a) : null;
#else
            return null;
#endif
        }

        // ------------------------------------------------------------------ assemblies
        public static void AssemblyGraph()
        {
            AgentJob.Run(() =>
            {
                string prefix = AgentJob.Str("prefix", "");
                var editorNames = new HashSet<string>(CompilationPipeline.GetAssemblies(AssembliesType.Editor)
                    .Where(a => (a.flags & AssemblyFlags.EditorAssembly) != 0).Select(a => a.name));
                var all = CompilationPipeline.GetAssemblies(AssembliesType.Editor);
                var rows = new List<object>();
                var violations = new List<string>();
                foreach (var a in all.Where(x => x.name.StartsWith(prefix, StringComparison.Ordinal)).OrderBy(x => x.name))
                {
                    bool isEditor = (a.flags & AssemblyFlags.EditorAssembly) != 0;
                    var refs = a.assemblyReferences.Select(r => r.name).OrderBy(n => n).ToList();
                    int engineRefs = a.compiledAssemblyReferences.Count(p => Path.GetFileName(p).StartsWith("UnityEngine", StringComparison.Ordinal));
                    string asmdef = CompilationPipeline.GetAssemblyDefinitionFilePathFromAssemblyName(a.name);
                    bool noEngine = false, autoRef = true, isTest = false;
                    var explicitRefs = new List<string>();
                    if (!string.IsNullOrEmpty(asmdef) && File.Exists(asmdef))
                    {
                        var j = AgentJson.ParseObject(File.ReadAllText(asmdef));
                        noEngine = j.TryGetValue("noEngineReferences", out var ne) && ne is bool nb && nb;
                        autoRef = !(j.TryGetValue("autoReferenced", out var ar) && ar is bool ab && !ab);
                        isTest = j.TryGetValue("defineConstraints", out var dc) && dc is IList dl && dl.Cast<object>().Any(o => (o as string) == "UNITY_INCLUDE_TESTS");
                        if (j.TryGetValue("references", out var rl) && rl is IList rlist)
                            foreach (var o in rlist) explicitRefs.Add(ResolveAsmdefRef(o as string));
                    }
                    // Only EXPLICIT asmdef references count: in the Editor compilation every runtime assembly
                    // also lists auto-referenced editor-only assemblies (UnityEditor.UI was observed on
                    // Game.Runtime), which the player build drops.
                    bool own = asmdef != null && asmdef.StartsWith("Assets/", StringComparison.Ordinal);   // packages are not ours to fix
                    if (own && !isEditor && !isTest)
                        foreach (var r in explicitRefs) if (editorNames.Contains(r)) violations.Add(a.name + " (runtime) references editor assembly " + r + " in its asmdef");
                    if (own && noEngine && engineRefs > 0) violations.Add(a.name + " declares noEngineReferences but compiles against UnityEngine");
                    rows.Add(new Dictionary<string, object>
                    {
                        { "name", a.name }, { "asmdef", asmdef }, { "editor_only", isEditor }, { "test", isTest },
                        { "auto_referenced", autoRef }, { "no_engine_references", noEngine }, { "engine_refs", engineRefs },
                        { "explicit_references", explicitRefs }, { "references", refs }, { "source_files", a.sourceFiles.Length },
                    });
                }
                var csharp = all.FirstOrDefault(x => x.name == "Assembly-CSharp");
                return new Dictionary<string, object>
                {
                    { "assemblies", rows }, { "violations", violations },
                    { "assembly_csharp_files", csharp != null ? csharp.sourceFiles.Length : 0 },
                };
            });
        }

        static string ResolveAsmdefRef(string r)
        {
            if (r == null || !r.StartsWith("GUID:", StringComparison.Ordinal)) return r;
            var path = AssetDatabase.GUIDToAssetPath(r.Substring(5));
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return r;
            var j = AgentJson.ParseObject(File.ReadAllText(path));
            return j.TryGetValue("name", out var n) ? n as string : r;
        }

        // ------------------------------------------------------------------ static state audit
        /// <summary>Static fields, static auto-properties, static events and static readonly collections in
        /// user assemblies, and whether their type resets them for Play mode with domain reload disabled.</summary>
        public static void StaticStateAudit()
        {
            AgentJob.Run(() =>
            {
                var prefixes = AgentJob.List("assemblies").Select(o => o as string).Where(s => !string.IsNullOrEmpty(s)).ToList();
                if (prefixes.Count == 0) prefixes = new List<string> { "Assembly-CSharp" };
                var f = new AgentAudit.Findings();
                int scanned = 0;
                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    var an = asm.GetName().Name;
                    if (!prefixes.Any(p => an.StartsWith(p, StringComparison.Ordinal))) continue;
                    if (an.EndsWith("-Editor", StringComparison.Ordinal) || an.Contains(".Tests")) continue;
                    foreach (var t in SafeTypes(asm))
                    {
                        if (t.Name.Contains("<") || t.IsDefined(typeof(CompilerGeneratedAttribute), false)) continue;
                        if (t.IsGenericTypeDefinition && t.IsAbstract && t.IsSealed) continue;
                        scanned++;
                        var resets = ResetMethods(t);
                        var events = new HashSet<string>(t.GetEvents(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly).Select(e => e.Name));
                        foreach (var e in events) Report(f, t, e, "static event", resets);
                        foreach (var fi in t.GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly))
                        {
                            if (fi.IsLiteral || events.Contains(fi.Name)) continue;
                            string kind;
                            if (fi.Name.EndsWith(">k__BackingField", StringComparison.Ordinal)) kind = "static auto-property";
                            else if (!fi.IsInitOnly) kind = "static field";
                            else if (IsMutableCollection(fi.FieldType)) kind = "static readonly collection";
                            else continue;
                            string name = kind == "static auto-property" ? fi.Name.Substring(1, fi.Name.IndexOf('>') - 1) : fi.Name;
                            Report(f, t, name, kind, resets);
                        }
                    }
                }
                return new Dictionary<string, object>
                {
                    { "enter_play_mode", EnterPlayModeName() }, { "types_scanned", scanned },
                    { "findings", f.items }, { "counts", f.Counts() },
                };
            });
        }

        static void Report(AgentAudit.Findings f, Type t, string member, string kind, List<string> resets)
        {
            string path = t.FullName + "." + member;
            if (resets.Count == 0)
                f.Add("warn", "arch.static_without_reset", path,
                    kind + " keeps its value between Play sessions when domain reload is disabled (6.3 option, 6.6 default for new projects)",
                    "add [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)] static void ResetStatics() to " + t.Name);
            else if (resets.All(r => r.Contains("exit hook")))
                f.Add("info", "arch.static_reset_exit_hook", path, kind + " has an editor hook (" + string.Join(", ", resets) + "): unregistering on ExitingPlayMode is the Manual's best practice for handlers",
                    "prove it with ArchPlayMode.DoublePlay in the project's Enter Play Mode setting; add a SubsystemRegistration reset for values");
            else if (resets.All(r => !r.Contains("SubsystemRegistration") && !r.Contains("InitializeOnEnterPlayMode") && !r.Contains("AfterAssembliesLoaded")))
                f.Add("info", "arch.static_reset_late", path, kind + " is reset by " + string.Join(", ", resets) + ", which runs after scene objects may have used it",
                    "use RuntimeInitializeLoadType.SubsystemRegistration");
            else
                f.Add("info", "arch.static_reset_ok", path, kind + " reset by " + string.Join(", ", resets));
        }

        static List<string> ResetMethods(Type t)
        {
            var list = new List<string>();
            for (var c = t; c != null; c = c.DeclaringType)
                foreach (var m in c.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly))
                {
                    var r = m.GetCustomAttribute<RuntimeInitializeOnLoadMethodAttribute>();
                    if (r != null) list.Add(c.Name + "." + m.Name + "(" + r.loadType + ")");
                    if (m.GetCustomAttributes(false).Any(a => a.GetType().Name == "InitializeOnEnterPlayModeAttribute")) list.Add(c.Name + "." + m.Name + "(InitializeOnEnterPlayMode)");
                    // The Manual's best practice for static HANDLERS: unregister on ExitingPlayMode from an editor hook
                    // (#if UNITY_EDITOR [InitializeOnLoadMethod] + EditorApplication.playModeStateChanged). Reflection
                    // cannot read the body: reported as an exit hook to prove with DoublePlay.
                    if (m.GetCustomAttributes(false).Any(a => a.GetType().Name == "InitializeOnLoadMethodAttribute")) list.Add(c.Name + "." + m.Name + "(InitializeOnLoadMethod exit hook)");
                }
            return list;
        }

        static bool IsMutableCollection(Type ft)
        {
            if (ft == typeof(string) || ft.IsArray) return false;       // static readonly arrays are usually lookup tables
            if (typeof(ICollection).IsAssignableFrom(ft)) return true;   // List, Dictionary, Queue...
            return ft.GetInterfaces().Any(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(ICollection<>));
        }

        static IEnumerable<Type> SafeTypes(System.Reflection.Assembly a)
        {
            try { return a.GetTypes(); }
            catch (ReflectionTypeLoadException e) { return e.Types.Where(x => x != null); }
        }

        // ------------------------------------------------------------------ asset authoring
        public static Type FindType(string fullName)
        {
            foreach (var a in AppDomain.CurrentDomain.GetAssemblies())
            {
                var t = a.GetType(fullName, false);
                if (t != null) return t;
            }
            return null;
        }

        public static void EnsureFolder(string assetFolder)
        {
            assetFolder = assetFolder.Replace('\\', '/').TrimEnd('/');
            if (AssetDatabase.IsValidFolder(assetFolder)) return;
            var parent = Path.GetDirectoryName(assetFolder).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(assetFolder));
        }

        /// <summary>Creates or updates ScriptableObject assets from data. Idempotent: an existing asset
        /// is updated in place (GUID kept); an unchanged asset is not dirtied (no spurious VCS diff).</summary>
        public static void CreateAssets()
        {
            AgentJob.Run(() =>
            {
                var created = new List<string>(); var updated = new List<string>(); var unchanged = new List<string>();
                foreach (var o in AgentJob.List("specs"))
                {
                    var spec = o as Dictionary<string, object> ?? throw new ArgumentException("each spec must be an object");
                    string typeName = spec["type"] as string, path = spec["path"] as string;
                    var type = FindType(typeName) ?? throw new ArgumentException("type not found: " + typeName);
                    if (!typeof(ScriptableObject).IsAssignableFrom(type)) throw new ArgumentException(typeName + " is not a ScriptableObject");
                    var asset = AssetDatabase.LoadAssetAtPath(path, type) as ScriptableObject;
                    bool isNew = asset == null;
                    if (isNew)
                    {
                        if (File.Exists(Path.Combine(AgentJob.ProjectRoot, path))) throw new InvalidOperationException(path + " exists with another type");
                        EnsureFolder(Path.GetDirectoryName(path));
                        asset = ScriptableObject.CreateInstance(type);
                        AssetDatabase.CreateAsset(asset, path);
                    }
                    var so = new SerializedObject(asset);
                    if (spec.TryGetValue("fields", out var fo) && fo is Dictionary<string, object> fields)
                        foreach (var kv in fields) SetValue(Require(so, kv.Key, path), kv.Value);
                    if (spec.TryGetValue("refs", out var ro) && ro is Dictionary<string, object> refs)
                        foreach (var kv in refs) Require(so, kv.Key, path).objectReferenceValue = LoadRequired(kv.Value as string);
                    if (spec.TryGetValue("ref_lists", out var lo) && lo is Dictionary<string, object> lists)
                        foreach (var kv in lists)
                        {
                            var prop = Require(so, kv.Key, path);
                            var items = (kv.Value as IList ?? new List<object>()).Cast<object>().Select(x => LoadRequired(x as string)).ToList();
                            prop.arraySize = items.Count;
                            for (int i = 0; i < items.Count; i++) prop.GetArrayElementAtIndex(i).objectReferenceValue = items[i];
                        }
                    if (spec.TryGetValue("managed_refs", out var mo) && mo is Dictionary<string, object> managed)
                        foreach (var kv in managed) SetManagedList(Require(so, kv.Key, path), kv.Value as IList ?? new List<object>(), path);
                    bool changed = so.ApplyModifiedPropertiesWithoutUndo();
                    if (changed) EditorUtility.SetDirty(asset);
                    (isNew ? created : changed ? updated : unchanged).Add(path);
                }
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object> { { "created", created }, { "updated", updated }, { "unchanged", unchanged } };
            });
        }

        /// <summary>[SerializeReference] list: [{"type": "Ns.Class", "fields": {...}}]. An element whose concrete type
        /// already matches is kept (its managed reference id too) and only its fields are set: idempotent.</summary>
        static void SetManagedList(SerializedProperty list, IList items, string path)
        {
            if (!list.isArray) throw new ArgumentException(list.propertyPath + " is not a list (" + path + ")");
            list.arraySize = items.Count;
            for (int i = 0; i < items.Count; i++)
            {
                var item = items[i] as Dictionary<string, object> ?? throw new ArgumentException("managed_refs entries are objects");
                string typeName = item["type"] as string;
                var type = FindType(typeName) ?? throw new ArgumentException("type not found: " + typeName);
                var el = list.GetArrayElementAtIndex(i);
                if (el.propertyType != SerializedPropertyType.ManagedReference)
                    throw new ArgumentException(list.propertyPath + " is not a [SerializeReference] list (" + path + ")");
                var current = el.managedReferenceValue;
                if (current == null || current.GetType() != type) el.managedReferenceValue = Activator.CreateInstance(type);
                if (item.TryGetValue("fields", out var fo) && fo is Dictionary<string, object> fields)
                    foreach (var kv in fields)
                        SetValue(el.FindPropertyRelative(kv.Key) ?? throw new ArgumentException("no field '" + kv.Key + "' on " + typeName), kv.Value);
            }
        }

        static SerializedProperty Require(SerializedObject so, string name, string path)
        {
            return so.FindProperty(name) ?? throw new ArgumentException("no serialized field '" + name + "' on " + so.targetObject.GetType().Name + " (" + path + ")");
        }

        static Object LoadRequired(string p)
        {
            var obj = string.IsNullOrEmpty(p) ? null : AssetDatabase.LoadAssetAtPath<Object>(p);
            if (obj == null) throw new ArgumentException("referenced asset not found: " + p);
            return obj;
        }

        static void SetValue(SerializedProperty p, object v)
        {
            switch (p.propertyType)
            {
                case SerializedPropertyType.Integer: p.intValue = (int)AgentJson.ToDouble(v); return;
                case SerializedPropertyType.Float: p.floatValue = (float)AgentJson.ToDouble(v); return;
                case SerializedPropertyType.Boolean: p.boolValue = v is bool b ? b : AgentJson.ToDouble(v) != 0; return;
                case SerializedPropertyType.String: p.stringValue = v as string ?? Convert.ToString(v); return;
                case SerializedPropertyType.Enum:
                    if (v is string s) { int i = Array.IndexOf(p.enumNames, s); if (i < 0) throw new ArgumentException("enum value " + s); p.enumValueIndex = i; }
                    else p.intValue = (int)AgentJson.ToDouble(v);
                    return;
                case SerializedPropertyType.Vector2: { var q = AgentJson.ToVector3(v, Vector3.zero); p.vector2Value = new Vector2(q.x, q.y); return; }
                case SerializedPropertyType.Vector3: p.vector3Value = AgentJson.ToVector3(v, Vector3.zero); return;
                case SerializedPropertyType.Color: p.colorValue = AgentJson.ToColor(v, Color.white); return;
            }
            if (p.isArray && v is IList list)
            {
                p.arraySize = list.Count;
                for (int i = 0; i < list.Count; i++) SetValue(p.GetArrayElementAtIndex(i), list[i]);
                return;
            }
            throw new ArgumentException("unsupported field type " + p.propertyType + " for " + p.propertyPath);
        }

        // ------------------------------------------------------------------ SO mutation guard
        /// <summary>path -> hash of EditorJsonUtility.ToJson(asset): the IN-MEMORY state of every ScriptableObject
        /// under the folders. Compare two calls made in the SAME editor process (ArchPlayMode so_guard).</summary>
        public static Dictionary<string, string> SoMemoryHashes(string[] folders)
        {
            var d = new Dictionary<string, string>();
            using (var sha = SHA1.Create())
                foreach (var guid in AssetDatabase.FindAssets("t:ScriptableObject", folders))
                {
                    var path = AssetDatabase.GUIDToAssetPath(guid);
                    var so = AssetDatabase.LoadAssetAtPath<ScriptableObject>(path);
                    if (so != null) d[path] = Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(EditorJsonUtility.ToJson(so))));
                }
            return d;
        }

        public static void SnapshotAssets()
        {
            AgentJob.Run(() =>
            {
                var folders = AgentJob.List("folders").Select(o => o as string).ToArray();
                if (folders.Length == 0) folders = new[] { "Assets" };
                var snap = new Dictionary<string, object>();
                using (var sha = SHA1.Create())
                    foreach (var guid in AssetDatabase.FindAssets("t:ScriptableObject", folders))
                    {
                        var path = AssetDatabase.GUIDToAssetPath(guid);
                        var so = AssetDatabase.LoadAssetAtPath<ScriptableObject>(path);
                        if (so == null) continue;
                        string mem = EditorJsonUtility.ToJson(so);
                        string disk = File.Exists(Path.Combine(AgentJob.ProjectRoot, path)) ? File.ReadAllText(Path.Combine(AgentJob.ProjectRoot, path)) : "";
                        snap[path] = new Dictionary<string, object>
                        {
                            { "memory", Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(mem))) },
                            { "disk", Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(disk))) },
                            { "dirty", EditorUtility.IsDirty(so) },
                        };
                    }
                string outPath = AgentJob.Has("out") ? AgentJob.ResolvePath(AgentJob.Str("out")) : Path.Combine(AgentJob.OutDir(), "so_snapshot.json");
                Directory.CreateDirectory(Path.GetDirectoryName(outPath));
                File.WriteAllText(outPath, AgentJson.Serialize(snap, true));
                var result = new Dictionary<string, object> { { "count", snap.Count }, { "snapshot", outPath } };
                if (AgentJob.Has("compare_to"))
                {
                    var prev = AgentJson.ParseObject(File.ReadAllText(AgentJob.ResolvePath(AgentJob.Str("compare_to"))));
                    var changedMem = new List<string>(); var changedDisk = new List<string>();
                    foreach (var kv in snap)
                    {
                        if (!prev.TryGetValue(kv.Key, out var po) || !(po is Dictionary<string, object> p)) continue;
                        var c = (Dictionary<string, object>)kv.Value;
                        if ((string)c["memory"] != (string)p["memory"]) changedMem.Add(kv.Key);
                        if ((string)c["disk"] != (string)p["disk"]) changedDisk.Add(kv.Key);
                    }
                    result["changed_in_memory"] = changedMem;
                    result["changed_on_disk"] = changedDisk;
                    result["added"] = snap.Keys.Where(k => !prev.ContainsKey(k)).ToList();
                    result["removed"] = prev.Keys.Where(k => !snap.ContainsKey(k)).ToList();
                }
                return result;
            });
        }

        static string Hex(byte[] b) => BitConverter.ToString(b).Replace("-", "").ToLowerInvariant().Substring(0, 16);

        // ------------------------------------------------------------------ package samples
        /// <summary>Imports a Package Manager sample headlessly (the GUI path is Package Manager > package > Samples >
        /// Import). Returns the import path and the available sample names. Unity compiles the imported scripts on
        /// the next domain reload: check the next job's compile errors.</summary>
        public static void ImportSample()
        {
            AgentJob.Run(() =>
            {
                string pkg = AgentJob.Str("package", "com.unity.inputsystem");
                string name = AgentJob.Str("sample", "Rebinding UI");
                var samples = UnityEditor.PackageManager.UI.Sample.FindByPackage(pkg, null).ToList();
                var names = samples.Select(x => x.displayName).ToList();
                var match = samples.Where(x => x.displayName == name).ToList();
                if (match.Count == 0) throw new ArgumentException("sample '" + name + "' not found in " + pkg + ": " + string.Join(", ", names));
                var sample = match[0];
                bool wasImported = sample.isImported;
                bool ok = sample.Import(UnityEditor.PackageManager.UI.Sample.ImportOptions.OverridePreviousImports | UnityEditor.PackageManager.UI.Sample.ImportOptions.HideImportWindow);
                AssetDatabase.Refresh();
                string rel = sample.importPath.Replace('\\', '/');
                string root = AgentJob.ProjectRoot.Replace('\\', '/').TrimEnd('/') + "/";
                if (rel.StartsWith(root, StringComparison.Ordinal)) rel = rel.Substring(root.Length);
                return new Dictionary<string, object>
                {
                    { "imported", ok }, { "was_imported", wasImported }, { "import_path", rel }, { "resolved_path", sample.resolvedPath },
                    { "samples", names },
                };
            });
        }

        // ------------------------------------------------------------------ inspect (merge verification)
        public static void InspectAsset()
        {
            AgentJob.Run(() =>
            {
                string path = AgentJob.Str("path") ?? throw new ArgumentException("path required");
                var objects = new List<object>();
                if (path.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase))
                {
                    var root = PrefabUtility.LoadPrefabContents(path);
                    try { Walk(root.transform, "", objects); }
                    finally { PrefabUtility.UnloadPrefabContents(root); }
                }
                else if (path.EndsWith(".unity", StringComparison.OrdinalIgnoreCase))
                {
                    var scene = EditorSceneManager.OpenScene(path, OpenSceneMode.Single);
                    foreach (var r in scene.GetRootGameObjects()) Walk(r.transform, "", objects);
                }
                else throw new ArgumentException("path must be a .prefab or .unity");
                return new Dictionary<string, object> { { "path", path }, { "objects", objects } };
            });
        }

        static void Walk(Transform t, string parent, List<object> outList)
        {
            string hp = parent.Length == 0 ? t.name : parent + "/" + t.name;
            var comps = new List<object>();
            foreach (var c in t.GetComponents<Component>())
            {
                if (c == null) { comps.Add(new Dictionary<string, object> { { "type", "MISSING SCRIPT" } }); continue; }
                comps.Add(new Dictionary<string, object> { { "type", c.GetType().Name }, { "values", SimpleValues(c) } });
            }
            outList.Add(new Dictionary<string, object> { { "path", hp }, { "active", t.gameObject.activeSelf }, { "components", comps } });
            foreach (Transform ch in t) Walk(ch, hp, outList);
        }

        static Dictionary<string, object> SimpleValues(Object o)
        {
            var d = new Dictionary<string, object>();
            var so = new SerializedObject(o);
            var it = so.GetIterator();
            bool enter = true;
            int n = 0;
            while (it.NextVisible(enter) && n < 40)
            {
                enter = false;
                if (it.propertyPath == "m_Script") continue;
                object v = null;
                switch (it.propertyType)
                {
                    case SerializedPropertyType.Integer: v = it.intValue; break;
                    case SerializedPropertyType.Float: v = Math.Round(it.floatValue, 4); break;
                    case SerializedPropertyType.Boolean: v = it.boolValue; break;
                    case SerializedPropertyType.String: v = it.stringValue; break;
                    case SerializedPropertyType.Enum: v = it.enumValueIndex >= 0 && it.enumValueIndex < it.enumNames.Length ? it.enumNames[it.enumValueIndex] : (object)it.intValue; break;
                    case SerializedPropertyType.Vector3: v = it.vector3Value; break;
                    case SerializedPropertyType.Vector2: v = it.vector2Value; break;
                    case SerializedPropertyType.Quaternion: v = it.quaternionValue.eulerAngles; break;
                    case SerializedPropertyType.Color: v = it.colorValue; break;
                    case SerializedPropertyType.ObjectReference: v = it.objectReferenceValue != null ? AssetDatabase.GetAssetPath(it.objectReferenceValue) + "#" + it.objectReferenceValue.name : null; break;
                    default: continue;
                }
                d[it.propertyPath] = v;
                n++;
            }
            return d;
        }
    }
}
