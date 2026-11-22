// AgentKit.Animation v0.1 (Unity Expert Skills, 2026-09-24). Humanoid import rules, applied on import.
//
// The expert pattern (git-amend, V9_Z6hUOG_8): configure one reference character, then let an
// AssetPostprocessor make every later drop identical: OnPreprocessModel sets the rig and the avatar,
// OnPreprocessAnimation sets the clips. This version is data-driven: an "AnimImportRules.json" file in
// the drop folder (or a parent) scopes the processor and carries every rule, so an agent edits JSON,
// never inspector checkboxes. Files outside a folder with a rules file are left alone (a global
// processor would turn every FBX in the project Humanoid).
//
// Rules JSON (written by ut_animation.default_rules()):
//   { "character": "Hero.fbx", "animation_type": "Human", "translation_dof": false,
//     "rename_single_clip": true,
//     "role_flags": { "idle": {"loopTime": true, "lockRootPositionXZ": true, ...}, ... },
//     "role_patterns": [["(?i)idle|stance", "idle"], ...],
//     "files": { "Nav-Accelerations": {"clips": [{"name": "Walk", "first": 31, "last": 67, "role": "locomotion"}]},
//                "Stance": {"role": "idle"} } }
// Flag names are ModelImporterClipAnimation properties: lockRootRotation (rotation Bake Into Pose),
// keepOriginalOrientation (rotation Based Upon Original), lockRootHeightY (Y Bake Into Pose),
// keepOriginalPositionY, heightFromFeet (Y Based Upon Feet), lockRootPositionXZ (XZ Bake Into Pose),
// keepOriginalPositionXZ, loopTime, loopPose, mirror, cycleOffset, rotationOffset, heightOffset, plus
// "mask": an AvatarMask asset path applied at import (maskType CopyFromOther): the 6.3 Manual's cost cut for
// fingers and IK goals a Humanoid clip does not need.
// Roles come from the rules (explicit entry, or a pattern on "<file name> <clip name>"), never from the take name
// alone: every Mixamo take is named "mixamo.com", so a take-name test gives every clip the same flags.
//
// Jobs:
//   AgentKit.Animation.AnimImport.ImportDrop    args: dest, rules{}, character_src, clip_srcs[], texture_srcs[],
//                                                masks[{path, humanoid_off[]}] (built before the clips import)
//   AgentKit.Animation.AnimImport.AuditImports  args: folder
//   AgentKit.Animation.AnimImport.DuplicateClip args: source ("Assets/x.fbx::Clip" or "::*"), dest (".anim")
//   AgentKit.Animation.AnimImport.AuditClips    args: folder  (.anim assets: bone-path duplicates, scale curves)
// Unity calls: AssetPostprocessor.OnPreprocessModel / OnPreprocessAnimation, ModelImporter.animationType,
// avatarSetup (CreateFromThisModel / CopyFromOther), sourceAvatar, humanDescription.hasTranslationDoF,
// clipAnimations, AssetImportContext.DependsOnSourceAsset / DependsOnArtifact, GetVersion().
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-animation/test_live_animation.py::test_02.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;

namespace AgentKit.Animation
{
    public class AnimImportPostprocessor : AssetPostprocessor
    {
        public const string RulesFile = "AnimImportRules.json";

        // Bump when the rule code changes: Unity reimports every model this processor touched. Never force a
        // reimport (ImportAsset, SaveAndReimport) from inside these callbacks: reapply from a job after the import.
        public override uint GetVersion() => 4;

        public static string FindRules(string assetPath)
        {
            var dir = Path.GetDirectoryName(assetPath)?.Replace('\\', '/');
            while (!string.IsNullOrEmpty(dir) && dir.StartsWith("Assets"))
            {
                var p = dir + "/" + RulesFile;
                if (File.Exists(p)) return p;
                dir = Path.GetDirectoryName(dir)?.Replace('\\', '/');
            }
            return null;
        }

        public static Dictionary<string, object> LoadRules(string rulesPath)
        {
            return rulesPath == null ? null : AgentJson.ParseObject(File.ReadAllText(rulesPath));
        }

        static bool IsCharacter(Dictionary<string, object> rules, string assetPath)
        {
            return rules.TryGetValue("character", out var c) && c != null &&
                   string.Equals(Path.GetFileName(assetPath), c.ToString(), StringComparison.OrdinalIgnoreCase);
        }

        public static string CharacterPath(string rulesPath, Dictionary<string, object> rules)
        {
            if (!rules.TryGetValue("character", out var c) || c == null) return null;
            return Path.GetDirectoryName(rulesPath).Replace('\\', '/') + "/" + c;
        }

        public static Avatar LoadAvatar(string modelPath)
        {
            if (modelPath == null) return null;
            return AssetDatabase.LoadAllAssetsAtPath(modelPath).OfType<Avatar>().FirstOrDefault();
        }

        void OnPreprocessModel()
        {
            var rulesPath = FindRules(assetPath);
            if (rulesPath == null) return;                       // scoped: no rules file, no change
            var rules = LoadRules(rulesPath);
            if (rules.TryGetValue("enabled", out var en) && en is bool b && !b) return;
            context.DependsOnSourceAsset(rulesPath);             // editing the rules reimports this model
            var mi = (ModelImporter)assetImporter;
            var type = rules.TryGetValue("animation_type", out var t) ? t?.ToString() : "Human";
            if (type == "Generic") { mi.animationType = ModelImporterAnimationType.Generic; return; }

            mi.animationType = ModelImporterAnimationType.Human;
            if (IsCharacter(rules, assetPath))
            {
                mi.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
                if (rules.TryGetValue("translation_dof", out var td) && td is bool tdof)
                {
                    var hd = mi.humanDescription;
                    hd.hasTranslationDoF = tdof;                 // off by default: humanoid bones animate by rotation only
                    mi.humanDescription = hd;
                }
                return;
            }
            // "create": this clip file gets its own avatar (automap). Needed when its hierarchy differs from the
            // character's: Copy From Other Avatar then fails with "Copied Avatar Rig Configuration mis-match"
            // and the FBX imports with NO clips (observed 2026-09-24 on Unity's own sample clips).
            var fileEntry = Dict(Dict(rules, "files"), Path.GetFileNameWithoutExtension(assetPath));
            var mode = fileEntry.TryGetValue("avatar", out var am) && am != null ? am.ToString()
                     : rules.TryGetValue("avatar_mode", out var gm) && gm != null ? gm.ToString() : "copy";
            if (mode == "create")
            {
                mi.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
                return;
            }
            var charPath = CharacterPath(rulesPath, rules);
            if (charPath != null) context.DependsOnArtifact(charPath);   // character imports first, reimports us on change
            var avatar = LoadAvatar(charPath);
            if (avatar == null || !avatar.isValid || !avatar.isHuman)
            {
                // fail soft (git-amend): Generic import plus a warning the audit turns into an error
                mi.animationType = ModelImporterAnimationType.Generic;
                Debug.LogWarning("[AgentKit.Animation] no valid human avatar at " + charPath + " for " + assetPath +
                                 ": imported Generic. Import the character first.");
                return;
            }
            mi.avatarSetup = ModelImporterAvatarSetup.CopyFromOther;
            mi.sourceAvatar = avatar;
        }

        void OnPreprocessAnimation()
        {
            var rulesPath = FindRules(assetPath);
            if (rulesPath == null) return;
            var rules = LoadRules(rulesPath);
            if (rules.TryGetValue("enabled", out var en) && en is bool b && !b) return;
            var mi = (ModelImporter)assetImporter;
            var defaults = mi.defaultClipAnimations;
            if (defaults == null || defaults.Length == 0) return;
            var fileKey = Path.GetFileNameWithoutExtension(assetPath);
            var fileRules = Dict(Dict(rules, "files"), fileKey);
            var roleFlags = Dict(rules, "role_flags");
            var clips = new List<ModelImporterClipAnimation>();

            var explicitClips = fileRules.TryGetValue("clips", out var ec) ? ec as List<object> : null;
            if (explicitClips != null && explicitClips.Count > 0)
            {
                // split one take into named clips (mocap takes hold several moves)
                foreach (var o in explicitClips)
                {
                    var d = (Dictionary<string, object>)o;
                    var c = Copy(defaults[0]);
                    c.name = d["name"].ToString();
                    if (d.ContainsKey("first")) c.firstFrame = (float)AgentJson.ToDouble(d["first"]);
                    if (d.ContainsKey("last")) c.lastFrame = (float)AgentJson.ToDouble(d["last"]);
                    ApplyRole(c, RoleFor(rules, d, c.name), roleFlags, d, p => context.DependsOnSourceAsset(p));
                    clips.Add(c);
                }
            }
            else
            {
                bool rename = !rules.TryGetValue("rename_single_clip", out var rn) || (rn is bool rb && rb);
                foreach (var def in defaults)
                {
                    var c = Copy(def);
                    if (rename && defaults.Length == 1) c.name = fileKey;   // Mixamo clips all arrive as "mixamo.com"
                    ApplyRole(c, RoleFor(rules, fileRules, fileKey + " " + c.name), roleFlags, fileRules, p => context.DependsOnSourceAsset(p));
                    clips.Add(c);
                }
            }
            mi.clipAnimations = clips.ToArray();
        }

        static Dictionary<string, object> Dict(Dictionary<string, object> d, string k)
        {
            return d != null && d.TryGetValue(k, out var v) && v is Dictionary<string, object> dd ? dd : new Dictionary<string, object>();
        }

        public static string RoleFor(Dictionary<string, object> rules, Dictionary<string, object> entry, string name)
        {
            return RoleOrNull(rules, entry, name) ?? "oneshot";
        }

        /// <summary>The role from an explicit entry or a pattern, or null when nothing matched (the caller then
        /// falls back to "oneshot": no loop, root rotation and Y baked).</summary>
        public static string RoleOrNull(Dictionary<string, object> rules, Dictionary<string, object> entry, string name)
        {
            if (entry != null && entry.TryGetValue("role", out var r) && r != null) return r.ToString();
            if (rules.TryGetValue("role_patterns", out var rp) && rp is List<object> pats)
                foreach (var p in pats)
                    if (p is List<object> pair && pair.Count == 2 && Regex.IsMatch(name, pair[0].ToString()))
                        return pair[1].ToString();
            return null;
        }

        static ModelImporterClipAnimation Copy(ModelImporterClipAnimation s)
        {
            return new ModelImporterClipAnimation
            {
                name = s.name, takeName = s.takeName, firstFrame = s.firstFrame, lastFrame = s.lastFrame,
                loopTime = s.loopTime, loopPose = s.loopPose, lockRootRotation = s.lockRootRotation,
                lockRootHeightY = s.lockRootHeightY, lockRootPositionXZ = s.lockRootPositionXZ,
                keepOriginalOrientation = s.keepOriginalOrientation, keepOriginalPositionY = s.keepOriginalPositionY,
                keepOriginalPositionXZ = s.keepOriginalPositionXZ, heightFromFeet = s.heightFromFeet,
                mirror = s.mirror, maskType = s.maskType, maskSource = s.maskSource, curves = s.curves,
                events = s.events, cycleOffset = s.cycleOffset, rotationOffset = s.rotationOffset,
                heightOffset = s.heightOffset, additiveReferencePoseFrame = s.additiveReferencePoseFrame,
                hasAdditiveReferencePose = s.hasAdditiveReferencePose, wrapMode = s.wrapMode,
            };
        }

        static void ApplyRole(ModelImporterClipAnimation c, string role, Dictionary<string, object> roleFlags,
                              Dictionary<string, object> overrides, Action<string> dependsOn)
        {
            var flags = new Dictionary<string, object>(Dict(roleFlags, role));
            foreach (var kv in Dict(overrides, "flags")) flags[kv.Key] = kv.Value;   // per-file or per-clip override
            foreach (var kv in flags)
            {
                if (kv.Key == "mask")
                {
                    // Avatar Mask at import: parts switched off are not sampled (6.3 Manual, Humanoid vs. Generic:
                    // mask out IK goals and fingers you do not need). Editing the mask reimports this model.
                    var maskPath = kv.Value?.ToString();
                    var mask = string.IsNullOrEmpty(maskPath) ? null : AssetDatabase.LoadAssetAtPath<AvatarMask>(maskPath);
                    if (mask == null) { Debug.LogWarning("[AgentKit.Animation] mask not found: " + maskPath); continue; }
                    dependsOn?.Invoke(maskPath);
                    c.maskType = ClipAnimationMaskType.CopyFromOther;
                    c.maskSource = mask;
                    continue;
                }
                bool bv = kv.Value is bool bb && bb;
                float fv = (float)AgentJson.ToDouble(kv.Value);
                switch (kv.Key)
                {
                    case "loopTime": c.loopTime = bv; break;
                    case "loopPose": c.loopPose = bv; break;
                    case "lockRootRotation": c.lockRootRotation = bv; break;
                    case "keepOriginalOrientation": c.keepOriginalOrientation = bv; break;
                    case "lockRootHeightY": c.lockRootHeightY = bv; break;
                    case "keepOriginalPositionY": c.keepOriginalPositionY = bv; break;
                    case "heightFromFeet": c.heightFromFeet = bv; break;
                    case "lockRootPositionXZ": c.lockRootPositionXZ = bv; break;
                    case "keepOriginalPositionXZ": c.keepOriginalPositionXZ = bv; break;
                    case "mirror": c.mirror = bv; break;
                    case "cycleOffset": c.cycleOffset = fv; break;
                    case "rotationOffset": c.rotationOffset = fv; break;
                    case "heightOffset": c.heightOffset = fv; break;
                    case "hasAdditiveReferencePose": c.hasAdditiveReferencePose = bv; break;
                    case "additiveReferencePoseFrame": c.additiveReferencePoseFrame = fv; break;
                    default: Debug.LogWarning("[AgentKit.Animation] unknown clip flag " + kv.Key); break;
                }
            }
        }
    }

    public static class AnimImport
    {
        static readonly HashSet<string> DefaultClipNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "mixamo.com", "Take 001", "Take 01", "Take001", "Armature|mixamo.com", "Scene" };

        /// <summary>Copy a character and its clips into a rules-scoped folder, character first, so the
        /// postprocessor finds the avatar when the clips import.</summary>
        public static void ImportDrop()
        {
            AgentJob.Run(() =>
            {
                var dest = AgentJob.Str("dest", "Assets/AnimLab/Imports").TrimEnd('/');
                Directory.CreateDirectory(AgentJob.ResolvePath(dest));
                var rules = AgentJob.Dict("rules");
                if (rules.Count == 0) throw new ArgumentException("args.rules is empty (use ut_animation.default_rules())");
                // masks referenced by clip rules ("flags": {"mask": path}) must exist before the clips import
                var masksBuilt = new List<object>();
                foreach (var mo in AgentJob.List("masks"))
                {
                    var md = (Dictionary<string, object>)mo;
                    AnimControllerBuilder.BuildMask(md);
                    masksBuilt.Add(md["path"]);
                }
                if (masksBuilt.Count > 0) AssetDatabase.SaveAssets();
                var rulesPath = dest + "/" + AnimImportPostprocessor.RulesFile;
                // keep what earlier drops learned: per-file "avatar" modes healed before. Rewriting the rules file
                // reimports EVERY model that depends on it (DependsOnSourceAsset), so a lost entry breaks old files.
                var previous = AnimImportPostprocessor.LoadRules(File.Exists(AgentJob.ResolvePath(rulesPath)) ? rulesPath : null);
                if (previous != null && previous.TryGetValue("files", out var pf) && pf is Dictionary<string, object> prevFiles)
                {
                    if (!(rules.TryGetValue("files", out var nf) && nf is Dictionary<string, object> newFiles))
                        rules["files"] = newFiles = new Dictionary<string, object>();
                    foreach (var kv in prevFiles)
                    {
                        if (!(kv.Value is Dictionary<string, object> pe) || !pe.TryGetValue("avatar", out var mode)) continue;
                        if (!(newFiles.TryGetValue(kv.Key, out var ne) && ne is Dictionary<string, object> nentry))
                            newFiles[kv.Key] = nentry = new Dictionary<string, object>();
                        if (!nentry.ContainsKey("avatar")) nentry["avatar"] = mode;
                    }
                }
                File.WriteAllText(AgentJob.ResolvePath(rulesPath), AgentJson.Serialize(rules, true));
                AssetDatabase.ImportAsset(rulesPath, ImportAssetOptions.ForceSynchronousImport);
                var written = new List<string>();
                string CopyIn(string src)
                {
                    var p = dest + "/" + Path.GetFileName(src);
                    File.Copy(src, AgentJob.ResolvePath(p), true);
                    written.Add(p);
                    return p;
                }
                foreach (var t in AgentJob.List("texture_srcs")) AssetDatabase.ImportAsset(CopyIn(t.ToString()), ImportAssetOptions.ForceSynchronousImport);
                var ch = AgentJob.Str("character_src");
                if (!string.IsNullOrEmpty(ch))
                    AssetDatabase.ImportAsset(CopyIn(ch), ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
                var clipPaths = new List<string>();
                foreach (var c in AgentJob.List("clip_srcs")) clipPaths.Add(CopyIn(c.ToString()));
                AssetDatabase.StartAssetEditing();
                try
                {
                    foreach (var p in clipPaths) AssetDatabase.ImportAsset(p, ImportAssetOptions.ForceUpdate);
                }
                finally
                {
                    AssetDatabase.StopAssetEditing();   // a missing Stop freezes the AssetDatabase
                }
                AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
                // self-heal the classic Copy-From-Other failure: hierarchy mismatch -> per-file own avatar
                var healed = new List<string>();
                if (AgentJob.Bool("auto_fix_hierarchy", true))
                {
                    var files = rules.TryGetValue("files", out var fo) && fo is Dictionary<string, object> fd ? fd : new Dictionary<string, object>();
                    foreach (var p in clipPaths)
                    {
                        if (!RigErrors(p).Any(e => e.Contains("mis-match"))) continue;
                        var key = Path.GetFileNameWithoutExtension(p);
                        if (!(files.TryGetValue(key, out var eo) && eo is Dictionary<string, object> entry))
                            files[key] = entry = new Dictionary<string, object>();
                        entry["avatar"] = "create";
                        healed.Add(p);
                    }
                    if (healed.Count > 0)
                    {
                        rules["files"] = files;
                        File.WriteAllText(AgentJob.ResolvePath(rulesPath), AgentJson.Serialize(rules, true));
                        AssetDatabase.ImportAsset(rulesPath, ImportAssetOptions.ForceSynchronousImport);
                        foreach (var p in healed) AssetDatabase.ImportAsset(p, ImportAssetOptions.ForceSynchronousImport | ImportAssetOptions.ForceUpdate);
                    }
                }
                var audit = Audit(dest);
                audit["written"] = written;
                audit["healed_hierarchy_mismatch"] = healed;
                audit["masks"] = masksBuilt;
                return audit;
            });
        }

        /// <summary>Error lines of the model's import log ("Rig Error: ..."): the only place Unity reports a
        /// failed Copy From Other Avatar. The console of a batch run shows nothing.</summary>
        public static List<string> RigErrors(string path)
        {
            var res = new List<string>();
            foreach (var il in AssetDatabase.LoadAllAssetsAtPath(path).OfType<UnityEditor.AssetImporters.ImportLog>())
                foreach (var e in il.logEntries)
                    if ((e.flags & UnityEditor.AssetImporters.ImportLogFlags.Error) != 0) res.Add(e.message.Trim());
            return res;
        }

        public static void AuditImports()
        {
            AgentJob.Run(() => Audit(AgentJob.Str("folder", "Assets")));
        }

        public static Dictionary<string, object> Audit(string folder)
        {
            var f = new AgentAudit.Findings();
            var models = new List<object>();
            foreach (var guid in AssetDatabase.FindAssets("t:Model", new[] { folder }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                var mi = AssetImporter.GetAtPath(path) as ModelImporter;
                if (mi == null) continue;
                var rulesPath = AnimImportPostprocessor.FindRules(path);
                var rules = AnimImportPostprocessor.LoadRules(rulesPath);
                bool wantHuman = rules != null && (!rules.TryGetValue("animation_type", out var at) || at?.ToString() == "Human");
                var avatar = AnimImportPostprocessor.LoadAvatar(path);
                var m = new Dictionary<string, object>
                {
                    { "path", path }, { "animation_type", mi.animationType.ToString() }, { "avatar_setup", mi.avatarSetup.ToString() },
                    { "source_avatar", mi.sourceAvatar ? AssetDatabase.GetAssetPath(mi.sourceAvatar) : null },
                    { "avatar", avatar ? avatar.name : null }, { "avatar_valid", avatar && avatar.isValid },
                    { "avatar_human", avatar && avatar.isHuman }, { "translation_dof", mi.humanDescription.hasTranslationDoF },
                    { "optimize_game_objects", mi.optimizeGameObjects }, { "rules", rulesPath },
                };
                if (wantHuman && mi.animationType != ModelImporterAnimationType.Human)
                    f.Add("error", "anim.generic_in_humanoid_folder", path, "rules ask for Humanoid, importer is " + mi.animationType,
                          "import the character first (the clips copy its avatar), then reimport this file");
                if (mi.animationType == ModelImporterAnimationType.Human && mi.avatarSetup == ModelImporterAvatarSetup.CopyFromOther && mi.sourceAvatar == null)
                    f.Add("error", "anim.no_source_avatar", path, "Copy From Other Avatar with no source avatar", "set sourceAvatar to the character's avatar");
                if (mi.avatarSetup == ModelImporterAvatarSetup.CreateFromThisModel && mi.animationType == ModelImporterAnimationType.Human && (!avatar || !avatar.isValid || !avatar.isHuman))
                    f.Add("error", "anim.avatar_invalid", path, "Humanoid avatar is missing or invalid", "fix the bone mapping (Rig > Configure) or humanDescription");
                var rigErrors = RigErrors(path);
                m["import_errors"] = rigErrors;
                foreach (var e in rigErrors)
                    f.Add("error", e.Contains("mis-match") ? "anim.copy_avatar_hierarchy_mismatch" : "anim.import_error", path, e,
                          e.Contains("mis-match") ? "the clip's hierarchy differs from the character's: set files.<name>.avatar = \"create\" in the rules (own avatar, humanoid retargeting still applies) or re-export on the character's skeleton" : null);
                var clipRows = new List<object>();
                var settings = mi.clipAnimations.Length > 0 ? mi.clipAnimations : mi.defaultClipAnimations;
                var byName = AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>()
                    .Where(c => !c.name.StartsWith("__preview__")).ToDictionary(c => c.name, c => c);
                foreach (var s in settings)
                {
                    byName.TryGetValue(s.name, out var clip);
                    var fileKey = Path.GetFileNameWithoutExtension(path);
                    var entry = rules != null ? FileEntry(rules, fileKey, s.name) : null;
                    var matched = rules != null ? AnimImportPostprocessor.RoleOrNull(rules, entry, fileKey + " " + s.name) : null;
                    var role = rules != null ? matched ?? "oneshot" : null;
                    var row = new Dictionary<string, object>
                    {
                        { "name", s.name }, { "role", role }, { "first", s.firstFrame }, { "last", s.lastFrame },
                        { "loopTime", s.loopTime }, { "loopPose", s.loopPose }, { "lockRootRotation", s.lockRootRotation },
                        { "lockRootHeightY", s.lockRootHeightY }, { "lockRootPositionXZ", s.lockRootPositionXZ },
                        { "keepOriginalOrientation", s.keepOriginalOrientation }, { "keepOriginalPositionY", s.keepOriginalPositionY },
                        { "keepOriginalPositionXZ", s.keepOriginalPositionXZ }, { "heightFromFeet", s.heightFromFeet }, { "mirror", s.mirror },
                        { "mask_type", s.maskType.ToString() }, { "mask_source", s.maskSource ? AssetDatabase.GetAssetPath(s.maskSource) : null },
                    };
                    if (rules != null && matched == null)
                        f.Add("info", "anim.role_fallback", path + "::" + s.name, "no rule or file-name pattern gave this clip a role: it got the oneshot flags (no loop)",
                              "add files.<name>.role or a role_patterns entry; never infer roles from take names (Mixamo takes are all \"mixamo.com\")");
                    if (clip != null)
                    {
                        row["length"] = Math.Round(clip.length, 3);
                        row["frame_rate"] = clip.frameRate;
                        row["human_motion"] = clip.isHumanMotion;
                        row["average_speed"] = clip.averageSpeed;
                        row["average_angular_speed"] = Math.Round(clip.averageAngularSpeed, 3);
                        row["apparent_speed"] = Math.Round(clip.apparentSpeed, 3);
                        if (mi.animationType == ModelImporterAnimationType.Human && !clip.isHumanMotion)
                            f.Add("error", "anim.clip_not_human", path + "::" + s.name, "clip is not a humanoid motion", "reimport with the Humanoid rig");
                    }
                    if (DefaultClipNames.Contains(s.name))
                        f.Add("warn", "anim.default_clip_name", path + "::" + s.name, "exporter default clip name", "rename to the file or move name");
                    if (role == "idle" && !s.lockRootPositionXZ)
                        f.Add("warn", "anim.idle_xz_not_baked", path + "::" + s.name, "idle with XZ not baked drifts over many loops (6.3 Manual, RootMotion)", "lockRootPositionXZ = true");
                    if ((role == "idle" || role == "locomotion") && !s.loopTime)
                        f.Add("warn", "anim.loop_off", path + "::" + s.name, role + " clip does not loop", "loopTime = true (and loopPose for root-motion cycles)");
                    if (role == "jump" && s.lockRootHeightY)
                        f.Add("warn", "anim.jump_y_baked", path + "::" + s.name, "height-changing clip with Y baked floats in blends", "lockRootHeightY = false, heightFromFeet = true");
                    if (role == "turn" && s.lockRootRotation)
                        f.Add("warn", "anim.turn_rotation_baked", path + "::" + s.name, "turn clip with rotation baked never turns the character", "lockRootRotation = false");
                    clipRows.Add(row);
                }
                bool isCharacter = rules != null && rules.TryGetValue("character", out var chn) && chn != null &&
                                   string.Equals(Path.GetFileName(path), chn.ToString(), StringComparison.OrdinalIgnoreCase);
                if (settings.Length == 0 && !isCharacter && mi.importAnimation)
                    f.Add("error", "anim.no_clips", path, "animation file imported with no clip (a rig error removes every take)",
                          "read import_errors; fix the avatar setup and reimport");
                m["is_character"] = isCharacter;
                m["clips"] = clipRows;
                models.Add(m);
            }
            return new Dictionary<string, object> { { "folder", folder }, { "models", models }, { "findings", f.items }, { "counts", f.Counts() } };
        }

        // ------------------------------------------------------------------ standalone clips (.anim)
        /// <summary>Copy a clip out of a model into an editable .anim (only when it must be edited: referencing the
        /// FBX sub-asset "path::clip" keeps reimports flowing). The copy freezes the curves the model had AT THAT
        /// MOMENT: from a Generic import it holds bone-path Transform curves and stays Generic after the model
        /// becomes Humanoid (iHeartGameDev BEZHVYk6Fa4 [00:12:03]). An existing .anim is archived, then updated in
        /// place so its GUID and every controller reference survive.</summary>
        public static void DuplicateClip()
        {
            AgentJob.Run(() =>
            {
                var src = AgentJob.Str("source");
                var dest = AgentJob.Str("dest");
                if (string.IsNullOrEmpty(dest) || !dest.EndsWith(".anim")) throw new ArgumentException("args.dest must end with .anim");
                var parts = src.Split(new[] { "::" }, StringSplitOptions.None);
                var clip = parts.Length == 2 && parts[1] == "*"
                    ? AssetDatabase.LoadAllAssetsAtPath(parts[0]).OfType<AnimationClip>().FirstOrDefault(c => !c.name.StartsWith("__preview__"))
                    : AnimControllerBuilder.LoadMotion(src) as AnimationClip;
                AnimUtil.Require(clip, "no clip at " + src);
                var mi = AssetImporter.GetAtPath(parts[0]) as ModelImporter;
                Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(dest)));
                var copy = UnityEngine.Object.Instantiate(clip);
                copy.name = Path.GetFileNameWithoutExtension(dest);
                string archived = null;
                var existing = AssetDatabase.LoadAssetAtPath<AnimationClip>(dest);
                if (existing != null)
                {
                    var dir = Path.GetDirectoryName(dest).Replace('\\', '/');
                    if (!AssetDatabase.IsValidFolder(dir + "/_archive")) AssetDatabase.CreateFolder(dir, "_archive");
                    archived = dir + "/_archive/" + copy.name + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".anim";
                    AssetDatabase.CopyAsset(dest, archived);
                    EditorUtility.CopySerialized(copy, existing);
                    existing.name = copy.name;
                    UnityEngine.Object.DestroyImmediate(copy);
                    EditorUtility.SetDirty(existing);
                    copy = existing;
                }
                else AssetDatabase.CreateAsset(copy, dest);
                AssetDatabase.SaveAssets();
                var f = new AgentAudit.Findings();
                var row = ClipAssetRow(dest, copy, f);
                row["source"] = src;
                row["source_rig"] = mi != null ? mi.animationType.ToString() : null;
                row["archived_previous"] = archived;
                return new Dictionary<string, object> { { "clip", row }, { "findings", f.items }, { "counts", f.Counts() } };
            });
        }

        public static void AuditClips()
        {
            AgentJob.Run(() => AuditClipAssets(AgentJob.Str("folder", "Assets")));
        }

        /// <summary>Every .anim under a folder (FBX sub-asset clips are covered by AuditImports).</summary>
        public static Dictionary<string, object> AuditClipAssets(string folder)
        {
            var f = new AgentAudit.Findings();
            var rows = new List<object>();
            foreach (var guid in AssetDatabase.FindAssets("t:AnimationClip", new[] { folder }))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (!path.EndsWith(".anim", StringComparison.OrdinalIgnoreCase) || path.Contains("/_archive/")) continue;   // archived versions are history
                var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
                if (clip != null) rows.Add(ClipAssetRow(path, clip, f));
            }
            return new Dictionary<string, object> { { "folder", folder }, { "clips", rows }, { "findings", f.items }, { "counts", f.Counts() } };
        }

        /// <summary>True when a clip animates bones by Transform path instead of humanoid muscles.</summary>
        public static bool IsBonePathClip(AnimationClip clip)
        {
            return clip != null && !clip.isHumanMotion &&
                   AnimationUtility.GetCurveBindings(clip).Any(b => b.type == typeof(Transform) && b.propertyName.StartsWith("m_LocalRotation"));
        }

        static Dictionary<string, object> ClipAssetRow(string path, AnimationClip clip, AgentAudit.Findings f)
        {
            var bindings = AnimationUtility.GetCurveBindings(clip);
            int transformCurves = bindings.Count(b => b.type == typeof(Transform));
            int muscleCurves = bindings.Count(b => b.type == typeof(Animator));
            int varyingScale = 0;
            foreach (var b in bindings.Where(b => b.type == typeof(Transform) && b.propertyName.StartsWith("m_LocalScale")))
            {
                var c = AnimationUtility.GetEditorCurve(clip, b);
                if (c != null && c.keys.Length > 1 && c.keys.Any(k => Mathf.Abs(k.value - c.keys[0].value) > 1e-5f)) varyingScale++;
            }
            if (IsBonePathClip(clip))
                f.Add("warn", "anim.generic_duplicate", path,
                      "bone-path (Generic) clip: it plays only on a skeleton with these exact bone paths and moves nothing through a Humanoid avatar. A clip duplicated from an FBX before its rig became Humanoid stays like this",
                      "duplicate again from the Humanoid FBX (DuplicateClip), or reference the FBX sub-asset \"path::clip\" instead of a copy");
            if (varyingScale > 0)
                f.Add("info", "anim.scale_curves", path, varyingScale + " non-constant scale curves (costlier than rotation and position, 6.3 Manual)", "strip them or make them constant unless the scale animation is intended");
            return new Dictionary<string, object>
            {
                { "path", path }, { "name", clip.name }, { "human_motion", clip.isHumanMotion }, { "length", Math.Round(clip.length, 3) },
                { "transform_curves", transformCurves }, { "muscle_curves", muscleCurves }, { "varying_scale_curves", varyingScale },
                { "bone_path_clip", IsBonePathClip(clip) },
            };
        }

        static Dictionary<string, object> FileEntry(Dictionary<string, object> rules, string fileKey, string clipName)
        {
            if (!(rules.TryGetValue("files", out var fo) && fo is Dictionary<string, object> files)) return null;
            if (!(files.TryGetValue(fileKey, out var e) && e is Dictionary<string, object> entry)) return null;
            if (entry.TryGetValue("clips", out var cl) && cl is List<object> list)
                foreach (var o in list)
                    if (o is Dictionary<string, object> d && d.TryGetValue("name", out var n) && n?.ToString() == clipName) return d;
            return entry;
        }
    }
}
