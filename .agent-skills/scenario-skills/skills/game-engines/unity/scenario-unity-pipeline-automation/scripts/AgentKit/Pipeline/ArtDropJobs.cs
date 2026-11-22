// AgentKit.Pipeline v0.2 (scenario-unity-pipeline-automation, 2026-09-24). Art drop -> project: plan, copy,
// import, audit (ImportDrop); materials, FBX remap, Prefab Variants (BuildPrefabs); audit (AuditProps).
//
//   ut_pipeline.import_drop(P, "/abs/drop")   -> AgentKit.Pipeline.ArtDropJobs.ImportDrop    {drop, rules?, dry_run?}
//   ut_pipeline.build_prefabs(P)              -> AgentKit.Pipeline.ArtDropJobs.BuildPrefabs  {rules?}
//   ut_pipeline.audit(P)                      -> AgentKit.Pipeline.ArtDropJobs.AuditProps    {rules?}
//
// Contract: idempotent (a second run copies 0 files and rewrites 0 prefabs), deterministic order
// (ordinal sorts), never guesses an ambiguous name (rejects it with a reason), one AssetDatabase
// batch per stage (StartAssetEditing / StopAssetEditing in try/finally), never touches the user's
// open scene (prefabs are assembled in a preview scene). The durable record of each prop (name,
// category, loading-condition labels, shared detail texture, prefab path, status) is
// Assets/Settings/Pipeline/props_manifest.json: versioned, diffable, read by AssignGroups and tests.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-pipeline-automation/test_live_pipeline.py.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using Object = UnityEngine.Object;

namespace AgentKit.Pipeline
{
    public class PropRecord
    {
        public string name, category, source, dir, fbx, prefab, material, detail, status = "planned";
        public List<string> labels = new List<string>();
        public Dictionary<string, string> textures = new Dictionary<string, string>();   // role -> asset path
        public List<string> warnings = new List<string>();

        public Dictionary<string, object> ToDict() => new Dictionary<string, object>
        {
            { "name", name }, { "category", category }, { "source", source }, { "dir", dir }, { "fbx", fbx },
            { "prefab", prefab }, { "material", material }, { "detail", detail }, { "status", status },
            { "labels", labels }, { "textures", textures.OrderBy(k => k.Key, StringComparer.Ordinal).ToDictionary(k => k.Key, k => (object)k.Value) },
            { "warnings", warnings },
        };

        public static PropRecord FromDict(Dictionary<string, object> d)
        {
            string S(string k) => d.TryGetValue(k, out var v) && v != null ? Convert.ToString(v) : null;
            var p = new PropRecord
            {
                name = S("name"), category = S("category"), source = S("source"), dir = S("dir"), fbx = S("fbx"),
                prefab = S("prefab"), material = S("material"), detail = S("detail"), status = S("status") ?? "planned",
            };
            if (d.TryGetValue("labels", out var l) && l is List<object> ll) p.labels = ll.Select(Convert.ToString).ToList();
            if (d.TryGetValue("textures", out var t) && t is Dictionary<string, object> td)
                p.textures = td.ToDictionary(k => k.Key, k => Convert.ToString(k.Value));
            if (d.TryGetValue("warnings", out var w) && w is List<object> wl) p.warnings = wl.Select(Convert.ToString).ToList();
            return p;
        }
    }

    public static class PropsManifest
    {
        public static List<PropRecord> Load(string path = PipelineRules.ManifestPath)
        {
            if (!File.Exists(path)) return new List<PropRecord>();
            var d = AgentJson.ParseObject(File.ReadAllText(path));
            return d.TryGetValue("props", out var p) && p is List<object> l
                ? l.OfType<Dictionary<string, object>>().Select(PropRecord.FromDict).ToList()
                : new List<PropRecord>();
        }

        /// <summary>Writes only when the content changes (keeps reruns free of diffs).</summary>
        public static bool Save(List<PropRecord> props, string path = PipelineRules.ManifestPath)
        {
            var sorted = props.OrderBy(p => p.name, StringComparer.Ordinal).Select(p => (object)p.ToDict()).ToList();
            var text = AgentJson.Serialize(new Dictionary<string, object> { { "version", 1 }, { "props", sorted } }, true) + "\n";
            if (File.Exists(path) && File.ReadAllText(path) == text) return false;
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, text);
            AssetDatabase.ImportAsset(path);
            return true;
        }
    }

    public static class ArtDropJobs
    {
        static readonly string[] ModelExts = { ".fbx" };
        static readonly string[] TextureExts = { ".png", ".tga", ".jpg", ".jpeg", ".psd", ".exr" };
        const string DropSharedFolder = "Shared";
        const string UrpLit = "Universal Render Pipeline/Lit";

        // ================================================================ ImportDrop
        public static void ImportDrop()
        {
            AgentJob.Run(() => ImportDropCore(AgentJob.Str("drop"), AgentJob.Str("rules", PipelineRules.DefaultPath), AgentJob.Bool("dry_run")));
        }

        public static Dictionary<string, object> ImportDropCore(string drop, string rulesPath, bool dryRun)
        {
            if (string.IsNullOrEmpty(drop) || !Directory.Exists(drop)) throw new DirectoryNotFoundException("drop folder not found: " + drop);
            var rules = PipelineRules.Load(rulesPath) ?? throw new FileNotFoundException("rules JSON not found: " + rulesPath + " (ut_pipeline.install writes it)");
            var sw = Stopwatch.StartNew();
            var manifestRows = ReadDropManifest(Path.Combine(drop, "manifest.csv"));
            var existing = PropsManifest.Load().ToDictionary(p => p.name, StringComparer.Ordinal);

            // ---- 1. plan (no project change yet)
            var plan = new List<PropRecord>();
            var rejects = new List<object>();
            var renamed = new List<object>();
            var ignored = new List<string>();
            var categoryRx = new System.Text.RegularExpressions.Regex("^[A-Z][A-Za-z0-9]*$");
            int found = 0;
            foreach (var catDir in Directory.GetDirectories(drop).OrderBy(x => x, StringComparer.Ordinal))
            {
                var cat = Path.GetFileName(catDir);
                if (cat.StartsWith("_") || cat.StartsWith(".") || cat == DropSharedFolder) continue;
                var files = Directory.GetFiles(catDir).OrderBy(x => x, StringComparer.Ordinal).ToList();
                var textures = files.Where(f => TextureExts.Contains(Path.GetExtension(f).ToLowerInvariant())).ToList();
                foreach (var f in files)
                {
                    var ext = Path.GetExtension(f).ToLowerInvariant();
                    if (!ModelExts.Contains(ext))
                    {
                        if (!TextureExts.Contains(ext)) ignored.Add(cat + "/" + Path.GetFileName(f));
                        continue;
                    }
                    found++;
                    var stem = Path.GetFileNameWithoutExtension(f);
                    var name = PipelineRules.Normalize(stem);
                    var rel = cat + "/" + Path.GetFileName(f);
                    var reasons = new List<string>();
                    if (!categoryRx.IsMatch(cat)) reasons.Add("category folder '" + cat + "' is not PascalCase");
                    if (!rules.NamePattern.IsMatch(name)) reasons.Add("name '" + name + "' does not match " + rules.NamePattern + " after normalization");
                    var p = new PropRecord { name = name, category = cat, source = rel, dir = rules.PropFolder(cat, name) };
                    foreach (var t in textures)
                    {
                        var role = rules.RoleOf(Path.GetFileNameWithoutExtension(t), out var baseName);
                        if (role == "Unknown" || PipelineRules.Normalize(baseName) != name) continue;
                        if (p.textures.ContainsKey(role)) { reasons.Add("two " + role + " textures"); continue; }
                        p.textures[role] = t;                                             // absolute source path for now
                    }
                    foreach (var req in rules.RequiredRoles.OrderBy(x => x, StringComparer.Ordinal))
                        if (!p.textures.ContainsKey(req)) reasons.Add("missing " + req + " texture");
                    if (reasons.Count > 0)
                    {
                        rejects.Add(new Dictionary<string, object> { { "file", rel }, { "name", name }, { "reasons", reasons } });
                        continue;
                    }
                    if (name != stem) renamed.Add(new Dictionary<string, object> { { "from", rel }, { "to", name } });
                    p.labels.Add(rules.CategoryLabelPrefix + cat.ToLowerInvariant());
                    if (manifestRows.TryGetValue(rel, out var row))
                    {
                        foreach (var l in row.Key) if (!p.labels.Contains(l)) p.labels.Add(l);
                        p.detail = string.IsNullOrEmpty(row.Value) ? null : PipelineRules.Normalize(row.Value);
                    }
                    p.labels.Sort(StringComparer.Ordinal);
                    p.fbx = p.dir + "/SM_" + name + ".fbx";
                    p.material = p.dir + "/M_" + name + ".mat";
                    p.prefab = p.dir + "/P_" + name + ".prefab";
                    plan.Add(p);
                }
            }
            // a name delivered twice is ambiguous: reject every copy, never pick one
            foreach (var g in plan.GroupBy(p => p.name, StringComparer.Ordinal).Where(g => g.Count() > 1).ToList())
            {
                var files = g.Select(p => p.source).ToList();
                foreach (var p in g)
                {
                    rejects.Add(new Dictionary<string, object> { { "file", p.source }, { "name", p.name }, { "reasons", new List<string> { "duplicate name (" + string.Join(", ", files) + ")" } } });
                    renamed.RemoveAll(o => ((Dictionary<string, object>)o)["from"].Equals(p.source));
                }
                plan.RemoveAll(p => p.name == g.Key);
            }
            rejects = rejects.OrderBy(o => (string)((Dictionary<string, object>)o)["file"], StringComparer.Ordinal).ToList();
            var shared = new List<KeyValuePair<string, string>>();   // source -> asset path
            var sharedDir = Path.Combine(drop, DropSharedFolder);
            if (Directory.Exists(sharedDir))
                foreach (var t in Directory.GetFiles(sharedDir).Where(f => TextureExts.Contains(Path.GetExtension(f).ToLowerInvariant())).OrderBy(x => x, StringComparer.Ordinal))
                {
                    var role = rules.RoleOf(Path.GetFileNameWithoutExtension(t), out var baseName);
                    shared.Add(new KeyValuePair<string, string>(t, rules.SharedPath + "/T_" + PipelineRules.Normalize(baseName) + "_" + role + Path.GetExtension(t).ToLowerInvariant()));
                }
            var missingDetails = plan.Where(p => p.detail != null && !shared.Any(s => Path.GetFileNameWithoutExtension(s.Value).StartsWith("T_" + p.detail + "_", StringComparison.Ordinal)))
                .Select(p => p.name + " -> " + p.detail).ToList();

            var result = new Dictionary<string, object>
            {
                { "found", found }, { "accepted", plan.Count }, { "rejected", rejects }, { "renamed", renamed },
                { "ignored_files", ignored }, { "shared_textures", shared.Count }, { "missing_details", missingDetails },
                { "plan_seconds", Math.Round(sw.Elapsed.TotalSeconds, 2) }, { "dry_run", dryRun },
            };
            if (dryRun) return result;

            // ---- 2. copy changed files, one import batch
            int copied = 0, unchanged = 0;
            var imported = new List<string>();
            foreach (var p in plan) EnsureFolder(p.dir);
            if (shared.Count > 0) EnsureFolder(rules.SharedPath);
            var tImport = Stopwatch.StartNew();
            var adbBefore = PipelineChecks.Read();                  // AssetDatabase counters: the batch must cost ONE refresh
            AssetDatabase.StartAssetEditing();
            try
            {
                foreach (var p in plan)
                {
                    CopyIfChanged(Path.Combine(drop, p.source), p.fbx, ref copied, ref unchanged, imported);
                    var assetTex = new Dictionary<string, string>();
                    foreach (var kv in p.textures.OrderBy(k => k.Key, StringComparer.Ordinal))
                    {
                        var dst = p.dir + "/T_" + p.name + "_" + kv.Key + Path.GetExtension(kv.Value).ToLowerInvariant();
                        CopyIfChanged(kv.Value, dst, ref copied, ref unchanged, imported);
                        assetTex[kv.Key] = dst;
                    }
                    p.textures = assetTex;
                }
                foreach (var s in shared) CopyIfChanged(s.Key, s.Value, ref copied, ref unchanged, imported);
            }
            finally
            {
                AssetDatabase.StopAssetEditing();      // in finally: an exception here would freeze the AssetDatabase
            }
            var importSeconds = tImport.Elapsed.TotalSeconds;
            var importCounters = PipelineChecks.Delta(adbBefore, PipelineChecks.Read());

            // ---- 3. manifest (keep build status of props that did not change)
            foreach (var p in plan)
            {
                if (existing.TryGetValue(p.name, out var old))
                {
                    p.status = old.status == "planned" ? "imported" : old.status;
                    p.warnings = old.warnings;
                }
                else p.status = "imported";
            }
            // a prop already in the project that this drop rejects is flagged, never deleted (a human decides)
            foreach (Dictionary<string, object> rj in rejects)
                if (existing.TryGetValue((string)rj["name"], out var prev) && !plan.Any(p => p.name == prev.name))
                {
                    prev.status = "rejected";
                    prev.warnings = ((List<string>)rj["reasons"]).ToList();
                }
            var merged = existing.Values.Where(o => !plan.Any(p => p.name == o.name)).Concat(plan).ToList();
            bool manifestChanged = PropsManifest.Save(merged);

            // ---- 4. audit what was imported, against the rules
            var audit = AuditCore(rules, merged);
            result["copied"] = copied;
            result["unchanged"] = unchanged;
            result["import_seconds"] = Math.Round(importSeconds, 2);
            result["import_assetdb"] = importCounters;             // {imports, refreshes, domain_reloads} of the batch
            result["seconds"] = Math.Round(sw.Elapsed.TotalSeconds, 2);
            result["manifest_changed"] = manifestChanged;
            result["audit"] = audit;
            return result;
        }

        static Dictionary<string, KeyValuePair<List<string>, string>> ReadDropManifest(string path)
        {
            var d = new Dictionary<string, KeyValuePair<List<string>, string>>(StringComparer.Ordinal);
            if (!File.Exists(path)) return d;
            var lines = File.ReadAllLines(path);
            for (int i = 1; i < lines.Length; i++)
            {
                var c = lines[i].Split(',');
                if (c.Length < 1 || string.IsNullOrWhiteSpace(c[0])) continue;
                var labels = c.Length > 1 ? c[1].Split(';').Select(s => s.Trim()).Where(s => s.Length > 0).ToList() : new List<string>();
                d[c[0].Trim().Replace('\\', '/')] = new KeyValuePair<List<string>, string>(labels, c.Length > 2 ? c[2].Trim() : "");
            }
            return d;
        }

        public static void EnsureFolder(string assetFolder)
        {
            if (AssetDatabase.IsValidFolder(assetFolder)) return;
            var parent = Path.GetDirectoryName(assetFolder).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(assetFolder));
        }

        static void CopyIfChanged(string src, string dst, ref int copied, ref int unchanged, List<string> imported)
        {
            if (File.Exists(dst) && SameBytes(src, dst)) { unchanged++; return; }
            File.Copy(src, dst, true);
            AssetDatabase.ImportAsset(dst, ImportAssetOptions.ForceUpdate);   // queued until StopAssetEditing
            imported.Add(dst);
            copied++;
        }

        static bool SameBytes(string a, string b)
        {
            var fa = new FileInfo(a);
            var fb = new FileInfo(b);
            if (fa.Length != fb.Length) return false;
            using (var md5 = MD5.Create())
            {
                byte[] ha, hb;
                using (var s = File.OpenRead(a)) ha = md5.ComputeHash(s);
                using (var s = File.OpenRead(b)) hb = md5.ComputeHash(s);
                return ha.SequenceEqual(hb);
            }
        }

        // ================================================================ BuildPrefabs
        public static void BuildPrefabs()
        {
            AgentJob.Run(() => BuildPrefabsCore(AgentJob.Str("rules", PipelineRules.DefaultPath), AgentJob.List("only").Select(Convert.ToString).ToList()));
        }

        public static Dictionary<string, object> BuildPrefabsCore(string rulesPath, List<string> only)
        {
            var rules = PipelineRules.Load(rulesPath) ?? throw new FileNotFoundException(rulesPath);
            var props = PropsManifest.Load();
            if (props.Count == 0) throw new InvalidOperationException("props_manifest.json is empty: run ImportDrop first");
            var work = props.Where(p => p.status != "rejected" && (only.Count == 0 || only.Contains(p.name))).OrderBy(p => p.name, StringComparer.Ordinal).ToList();
            var lit = Shader.Find(UrpLit) ?? throw new InvalidOperationException("shader '" + UrpLit + "' not found: is URP the active pipeline?");
            var sw = Stopwatch.StartNew();
            int matCreated = 0, matUpdated = 0, remapped = 0, created = 0, updated = 0, same = 0;
            var matDiffs = new List<object>();
            var errors = new List<object>();
            var warnings = new List<object>();

            // ---- 1. materials (one batch)
            AssetDatabase.StartAssetEditing();
            try
            {
                foreach (var p in work)
                {
                    var r = EnsureMaterial(p, rules, lit, matDiffs);
                    if (r == 1) matCreated++; else if (r == 2) matUpdated++;
                }
            }
            finally { AssetDatabase.StopAssetEditing(); }
            AssetDatabase.SaveAssets();

            // ---- 2. remap FBX material slots to M_<Name> (reimport only when the map changes). SaveAndReimport
            // INSIDE the batch: queued, one refresh for all FBX; outside it, one refresh per FBX (measured by
            // PipelineProbes.RemapBatchProbe; doc-editor-scripting-asset-pipeline, agent translation).
            var remapBefore = PipelineChecks.Read();
            AssetDatabase.StartAssetEditing();
            try
            {
                foreach (var p in work)
                {
                    var mi = AssetImporter.GetAtPath(p.fbx) as ModelImporter;
                    var mat = AssetDatabase.LoadAssetAtPath<Material>(p.material);
                    if (mi == null || mat == null) { errors.Add(Err(p, "missing_asset", "FBX or material not imported")); continue; }
                    var slots = AssetDatabase.LoadAllAssetsAtPath(p.fbx).OfType<Material>().Select(m => m.name).ToList();
                    var map = mi.GetExternalObjectMap();
                    foreach (var kv in map.Where(k => k.Key.type == typeof(Material))) if (!slots.Contains(kv.Key.name)) slots.Add(kv.Key.name);
                    bool changed = false;
                    foreach (var slot in slots.Distinct().OrderBy(s => s, StringComparer.Ordinal))
                    {
                        var id = new AssetImporter.SourceAssetIdentifier(typeof(Material), slot);
                        if (map.TryGetValue(id, out var cur) && cur == mat) continue;
                        mi.AddRemap(id, mat);
                        changed = true;
                    }
                    if (changed) { mi.SaveAndReimport(); remapped++; }
                }
            }
            finally { AssetDatabase.StopAssetEditing(); }
            var remapCounters = PipelineChecks.Delta(remapBefore, PipelineChecks.Read());

            // ---- 3. Prefab Variants of the model prefabs, assembled in a preview scene
            var preview = EditorSceneManager.NewPreviewScene();
            try
            {
                foreach (var p in work)
                {
                    var model = AssetDatabase.LoadAssetAtPath<GameObject>(p.fbx);
                    if (model == null) { errors.Add(Err(p, "missing_model", p.fbx)); p.status = "error"; continue; }
                    var check = CheckModel(model, rules);
                    p.warnings = check.warnings;
                    foreach (var w in check.warnings) warnings.Add(Err(p, "budget", w));
                    if (check.error != null)
                    {
                        errors.Add(Err(p, "size", check.error));
                        p.status = "error";
                        p.warnings = p.warnings.Concat(new[] { "size: " + check.error }).ToList();
                        continue;
                    }
                    var outcome = File.Exists(p.prefab) ? UpdatePrefab(p, check.localBounds) : CreatePrefab(p, model, preview, check.localBounds);
                    if (outcome == 1) created++; else if (outcome == 2) updated++; else same++;
                    p.status = "built";
                }
            }
            finally { EditorSceneManager.ClosePreviewScene(preview); }

            var all = props.ToDictionary(p => p.name);
            foreach (var p in work) all[p.name] = p;
            bool manifestChanged = PropsManifest.Save(all.Values.ToList());
            return new Dictionary<string, object>
            {
                { "props", work.Count }, { "materials_created", matCreated }, { "materials_updated", matUpdated }, { "material_diffs", matDiffs },
                { "fbx_remapped", remapped }, { "remap_assetdb", remapCounters }, { "prefabs_created", created }, { "prefabs_updated", updated },
                { "prefabs_unchanged", same }, { "errors", errors }, { "warnings", warnings },
                { "built", work.Count(p => p.status == "built") }, { "manifest_changed", manifestChanged },
                { "seconds", Math.Round(sw.Elapsed.TotalSeconds, 2) },
            };
        }

        static Dictionary<string, object> Err(PropRecord p, string code, string msg) => new Dictionary<string, object> { { "name", p.name }, { "code", code }, { "message", msg } };

        /// <summary>0 unchanged, 1 created, 2 updated. Textures assigned by script, then the keywords computed
        /// by the shader's own ShaderGUI.ValidateMaterial (what the material inspector does), so the result
        /// matches a hand-made material and a rerun changes nothing.</summary>
        static int EnsureMaterial(PropRecord p, PipelineRules rules, Shader lit, List<object> diffs)
        {
            var mat = AssetDatabase.LoadAssetAtPath<Material>(p.material);
            int outcome = 0;
            if (mat == null)
            {
                mat = new Material(lit) { name = "M_" + p.name };
                AssetDatabase.CreateAsset(mat, p.material);
                outcome = 1;
            }
            string before = Fingerprint(mat);
            if (mat.shader.name != lit.name) mat.shader = lit;
            SetTex(mat, "_BaseMap", Tex(p, "BaseColor"));
            SetTex(mat, "_BumpMap", Tex(p, "Normal"));
            Texture2D detail = null;
            if (!string.IsNullOrEmpty(p.detail))
                detail = AssetDatabase.LoadAssetAtPath<Texture2D>(rules.SharedPath + "/T_" + p.detail + "_Detail.png");
            SetTex(mat, "_DetailAlbedoMap", detail);
            float scale = detail != null ? 0.5f : 1f;
            if (mat.HasProperty("_DetailAlbedoMapScale") && !Mathf.Approximately(mat.GetFloat("_DetailAlbedoMapScale"), scale)) mat.SetFloat("_DetailAlbedoMapScale", scale);
            ValidateLikeInspector(mat);
            string after = Fingerprint(mat);
            if (outcome == 0 && after != before)
            {
                outcome = 2;
                if (diffs != null && diffs.Count < 3) diffs.Add(new Dictionary<string, object> { { "material", p.material }, { "before", before }, { "after", after } });
            }
            if (outcome != 0) EditorUtility.SetDirty(mat);     // direct material edits are not saved without SetDirty
            return outcome;
        }

        /// <summary>Runs the shader's custom ShaderGUI.ValidateMaterial (URP Lit: keywords such as _NORMALMAP,
        /// _DETAIL_MULX2, _DETAIL_SCALED) through a temporary MaterialEditor. Public API only.</summary>
        public static void ValidateLikeInspector(Material mat)
        {
            var editor = (MaterialEditor)UnityEditor.Editor.CreateEditor(mat);
            try { editor.customShaderGUI?.ValidateMaterial(mat); }
            finally { Object.DestroyImmediate(editor); }
        }

        static string Fingerprint(Material m)
        {
            string T(string n) => m.HasProperty(n) && m.GetTexture(n) ? AssetDatabase.GetAssetPath(m.GetTexture(n)) : "-";
            string F(string n) => m.HasProperty(n) ? m.GetFloat(n).ToString("F3") : "-";
            return m.shader.name + "|" + T("_BaseMap") + "|" + T("_BumpMap") + "|" + T("_DetailAlbedoMap") + "|" + F("_DetailAlbedoMapScale") + "|" +
                   string.Join(",", m.shaderKeywords.OrderBy(k => k, StringComparer.Ordinal));
        }

        static Texture2D Tex(PropRecord p, string role) => p.textures.TryGetValue(role, out var path) ? AssetDatabase.LoadAssetAtPath<Texture2D>(path) : null;

        static void SetTex(Material m, string prop, Texture tex)
        {
            if (m.HasProperty(prop) && m.GetTexture(prop) != tex) m.SetTexture(prop, tex);
            // keywords: not set by SetTexture from script; ValidateLikeInspector computes them afterwards
        }

        /// <summary>bounds: world space (size rules); localBounds: in the root's space (BoxCollider center/size).</summary>
        public struct ModelCheck { public Bounds bounds, localBounds; public int vertices; public string error; public List<string> warnings; }

        public static ModelCheck CheckModel(GameObject model, PipelineRules rules)
        {
            var c = new ModelCheck { warnings = new List<string>() };
            bool has = false;
            foreach (var mf in model.GetComponentsInChildren<MeshFilter>(true))
            {
                if (mf.sharedMesh == null) continue;
                c.vertices += mf.sharedMesh.vertexCount;
                var wb = PropImportPostprocessor.TransformBounds(mf.transform.localToWorldMatrix, mf.sharedMesh.bounds);
                var lb = PropImportPostprocessor.TransformBounds(model.transform.worldToLocalMatrix * mf.transform.localToWorldMatrix, mf.sharedMesh.bounds);
                if (!has) { c.bounds = wb; c.localBounds = lb; has = true; } else { c.bounds.Encapsulate(wb); c.localBounds.Encapsulate(lb); }
            }
            if (!has) { c.error = "no mesh"; return c; }
            float maxDim = Mathf.Max(c.bounds.size.x, c.bounds.size.y, c.bounds.size.z);
            if (maxDim > rules.MaxSizeM) c.error = maxDim.ToString("F1") + " m > " + rules.MaxSizeM + " m (centimetre export? fix the export scale, never the prefab scale)";
            else if (maxDim < rules.MinSizeM) c.error = maxDim.ToString("F3") + " m < " + rules.MinSizeM + " m (wrong unit?)";
            if (c.vertices > rules.VertexBudget) c.warnings.Add(c.vertices + " vertices > budget " + rules.VertexBudget);
            if (Mathf.Abs(c.bounds.min.y) > 0.01f * Mathf.Max(1f, maxDim)) c.warnings.Add("pivot not at the base (bounds.min.y = " + c.bounds.min.y.ToString("F3") + ")");
            foreach (var t in model.GetComponentsInChildren<Transform>(true))
            {
                if (Quaternion.Angle(t.localRotation, Quaternion.identity) > 0.5f)
                {
                    c.warnings.Add("rotation: " + t.name + " localRotation " + t.localEulerAngles + " (Blender: export with Apply Transform; bakeAxisConversion alone does not remove it)");
                    break;
                }
                if ((t.localScale - Vector3.one).sqrMagnitude > 1e-4f)
                {
                    c.warnings.Add("scale: " + t.name + " localScale " + t.localScale + " (Blender: Apply Scalings 'FBX All')");
                    break;
                }
            }
            return c;
        }

        /// <summary>Prefab Variant of the model prefab: reimporting the FBX updates the mesh and keeps the collider.</summary>
        static int CreatePrefab(PropRecord p, GameObject model, UnityEngine.SceneManagement.Scene preview, Bounds b)
        {
            var inst = (GameObject)PrefabUtility.InstantiatePrefab(model, preview);
            try
            {
                inst.name = "P_" + p.name;
                var box = inst.AddComponent<BoxCollider>();
                var so = new SerializedObject(box);                                   // serialized edit: dirtied, prefab-correct
                so.FindProperty("m_Center").vector3Value = b.center;
                so.FindProperty("m_Size").vector3Value = b.size;
                so.ApplyModifiedPropertiesWithoutUndo();                              // preview scene: no user Undo to serve
                PrefabUtility.SaveAsPrefabAsset(inst, p.prefab, out bool ok);
                if (!ok) throw new InvalidOperationException("SaveAsPrefabAsset failed for " + p.prefab);
                return 1;
            }
            finally { Object.DestroyImmediate(inst); }
        }

        /// <summary>Edits an existing prefab asset the documented way (LoadPrefabContents / SaveAsPrefabAsset /
        /// UnloadPrefabContents) and saves only when a value changed, so reruns leave the file untouched.</summary>
        static int UpdatePrefab(PropRecord p, Bounds b)
        {
            var root = PrefabUtility.LoadPrefabContents(p.prefab);
            try
            {
                var box = root.GetComponent<BoxCollider>();
                bool changed = false;
                if (box == null) { box = root.AddComponent<BoxCollider>(); changed = true; }
                if ((box.center - b.center).sqrMagnitude > 1e-8f || (box.size - b.size).sqrMagnitude > 1e-8f)
                {
                    var so = new SerializedObject(box);
                    so.FindProperty("m_Center").vector3Value = b.center;
                    so.FindProperty("m_Size").vector3Value = b.size;
                    so.ApplyModifiedPropertiesWithoutUndo();
                    changed = true;
                }
                if (!changed) return 0;
                PrefabUtility.SaveAsPrefabAsset(root, p.prefab);
                return 2;
            }
            finally { PrefabUtility.UnloadPrefabContents(root); }
        }

        // ================================================================ Status (read-only)
        public static void Status() { AgentJob.Run(StatusCore); }

        /// <summary>Props by status, Addressables groups and implicit duplicates: what an agent asks first.</summary>
        public static Dictionary<string, object> StatusCore()
        {
            var props = PropsManifest.Load();
            var byStatus = props.GroupBy(p => p.status).OrderBy(g => g.Key, StringComparer.Ordinal).ToDictionary(g => g.Key, g => (object)g.Count());
            var res = new Dictionary<string, object>
            {
                { "props", props.Count }, { "by_status", byStatus }, { "rules", PipelineRules.DefaultPath },
                { "rejected", props.Where(p => p.status == "rejected" || p.status == "error").Select(p => p.name + ": " + string.Join("; ", p.warnings)).Take(10).ToList() },
            };
            var settings = UnityEditor.AddressableAssets.AddressableAssetSettingsDefaultObject.Settings;
            if (settings != null)
            {
                res["groups"] = settings.groups.Where(g => g != null && g.entries.Count > 0).OrderBy(g => g.Name, StringComparer.Ordinal)
                    .Select(g => (object)(g.Name + " (" + g.entries.Count + ")")).ToList();
                res["implicit_duplicates"] = AddressablesJobs.ImplicitDuplicatesCore(settings)["count"];
                res["build_with_player"] = settings.BuildAddressablesWithPlayerBuild.ToString();
            }
            return res;
        }

        // ================================================================ AuditProps
        public static void AuditProps()
        {
            AgentJob.Run(() =>
            {
                var rules = PipelineRules.Load(AgentJob.Str("rules", PipelineRules.DefaultPath)) ?? throw new FileNotFoundException("rules JSON");
                return AuditCore(rules, PropsManifest.Load());
            });
        }

        /// <summary>Importer settings and model facts versus the rules. Findings in the AgentKit format.</summary>
        public static Dictionary<string, object> AuditCore(PipelineRules rules, List<PropRecord> props)
        {
            var f = new AgentAudit.Findings();
            int textures = 0, models = 0, normalMaps = 0, clamped = 0;
            var sizes = new Dictionary<string, object>();
            foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", new[] { rules.Root }).OrderBy(g => g, StringComparer.Ordinal))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (!(AssetImporter.GetAtPath(path) is TextureImporter ti)) continue;
                textures++;
                var role = rules.RoleOfImported(path);
                ti.GetSourceTextureWidthAndHeight(out int w, out int h);
                var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
                if (role == "Normal") { normalMaps++; if (ti.textureType != TextureImporterType.NormalMap) f.Add("error", "pipeline.normal_type", path, "normal map imported as " + ti.textureType, "reimport (rules postprocessor)"); }
                bool shouldBeLinear = role == "Normal" || rules.LinearRoles.Contains(role);
                if (ti.sRGBTexture == shouldBeLinear) f.Add("error", "pipeline.srgb", path, "sRGB=" + ti.sRGBTexture + " for role " + role, "reimport");
                if (ti.maxTextureSize > rules.TextureMaxSize) f.Add("error", "pipeline.max_size", path, "maxTextureSize " + ti.maxTextureSize + " > " + rules.TextureMaxSize, "reimport");
                if (tex != null && Math.Max(w, h) > rules.TextureMaxSize)
                {
                    clamped++;
                    sizes[path] = new Dictionary<string, object> { { "source", w + "x" + h }, { "imported", tex.width + "x" + tex.height } };
                }
                if (!ti.mipmapEnabled) f.Add("warn", "pipeline.mipmaps", path, "mipmaps off", null);
            }
            foreach (var guid in AssetDatabase.FindAssets("t:Model", new[] { rules.Root }).OrderBy(g => g, StringComparer.Ordinal))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (!(AssetImporter.GetAtPath(path) is ModelImporter mi)) continue;
                models++;
                if (!mi.bakeAxisConversion) f.Add("error", "pipeline.axis", path, "bakeAxisConversion off", "reimport");
                if (mi.importCameras || mi.importLights) f.Add("warn", "pipeline.extras", path, "cameras or lights imported", "reimport");
                if (mi.animationType != ModelImporterAnimationType.None) f.Add("warn", "pipeline.rig", path, "rig " + mi.animationType + " on a static prop", "reimport");
                var go = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                if (go == null) continue;
                var c = CheckModel(go, rules);
                if (c.error != null) f.Add("error", "pipeline.size", path, c.error, "re-export with FBX All scaling (Blender) / correct units");
                foreach (var w in c.warnings)
                    f.Add("warn", w.Contains("vertices") ? "pipeline.vertex_budget" : w.StartsWith("rotation") ? "pipeline.rotation" : w.StartsWith("scale") ? "pipeline.transform_scale" : "pipeline.pivot", path, w,
                          w.StartsWith("rotation") || w.StartsWith("scale") ? "re-export (scenario-blender-export): Apply Scalings FBX All + Apply Transform" : null);
            }
            return new Dictionary<string, object>
            {
                { "textures", textures }, { "normal_maps", normalMaps }, { "models", models }, { "clamped_textures", clamped },
                { "clamped", sizes }, { "counts", f.Counts() }, { "findings", f.items.Take(80).ToList() },
                { "findings_total", f.items.Count }, { "props_in_manifest", props.Count },
            };
        }
    }
}
