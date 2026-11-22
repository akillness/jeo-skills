// REQUIRES: com.unity.timeline, com.unity.cinemachine
// AgentKit.Animation v0.1 (Unity Expert Skills, 2026-09-24). A cutscene Timeline built from data, and a
// deterministic scrub that renders it.
//
// The Timeline window is a visual editor; its programmatic substitute is TimelineAsset.CreateTrack,
// TrackAsset.CreateClip / CreateMarker and PlayableDirector.SetGenericBinding / SetReferenceValue.
// Everything here also works while a human watches the Timeline window in a live editor (ut_live.call).
//
// Jobs:
//   AgentKit.Animation.AnimTimeline.BuildCutscene  args: scene, path, director, fps, duration, wrap,
//        animation{target, clips[{motion, start, duration, blend_in}]}, shots[{camera, start, duration}],
//        activation[{object, start, duration}], light{object, clips[{start, duration, color, intensity}]},
//        markers[{time, payload}], signal{time, asset, receiver}
//   AgentKit.Animation.AnimTimeline.SampleCutscene args: scene, director, fps, captures[t...], width, height,
//        priorities{camera: p} (set before playing: a Timeline overrides the Brain, priority is ignored under it).
//        After Stop, an edit-mode scrub keeps the last shot camera live (observed): test the handback with PlayCutscene.
//   AgentKit.Animation.AnimTimeline.PlayCutscene   args: scene, director, fps, priorities{camera: p}, after_stop_frames
//        (real Play mode: markers, signals, and the live camera per second and after the director stops)
//   AgentKit.Animation.AnimTimeline.AuditTimeline  args: scene, director (all directors when omitted)
// Unity calls: ScriptableObject.CreateInstance<TimelineAsset>, editorSettings.frameRate, CreateTrack<AnimationTrack |
// CinemachineTrack | ActivationTrack | SignalTrack | AgentLightTrack>, CreateClip, TimelineClip.start/duration/
// blendInDuration, CinemachineShot.VirtualCamera (ExposedReference) + director.SetReferenceValue, CreateMarkerTrack,
// CreateMarker<T>, SignalReceiver.AddReaction, UnityEventTools.AddVoidPersistentListener, director.RebuildGraph,
// director.timeUpdateMode = Manual, director.Play, playableGraph.Evaluate(dt), CinemachineBrain.ManualUpdate.
// Run in Unity 6000.3.21f1, Timeline 1.8.12, Cinemachine 3.1.7 on 2026-09-24: test_live_animation.py::test_07.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using AgentKit.Animation.Runtime;
using Unity.Cinemachine;
using UnityEditor;
using UnityEditor.Events;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Playables;
using UnityEngine.Timeline;

namespace AgentKit.Animation
{
    public static class AnimTimeline
    {
        static void OpenScene()
        {
            var scene = AgentJob.Str("scene", AnimSampler.DefaultScene);
            if (EditorSceneManager.GetActiveScene().path != scene) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
        }

        static GameObject Obj(string name) => AnimUtil.Require(GameObject.Find(name), "object '" + name + "' not in the scene");
        static float Fl(Dictionary<string, object> d, string k, float def = 0f) => d.TryGetValue(k, out var v) && v != null ? (float)AgentJson.ToDouble(v, def) : def;

        public static void BuildCutscene()
        {
            AgentJob.Run(() =>
            {
                OpenScene();
                var path = AgentJob.Str("path", "Assets/AnimLab/Cutscene.playable");
                string archived = null;
                var tl = AssetDatabase.LoadAssetAtPath<TimelineAsset>(path);
                if (tl != null)
                {
                    // version by copy, rebuild in place: the GUID stays, so directors elsewhere keep this Timeline
                    var dir = Path.GetDirectoryName(path).Replace('\\', '/');
                    if (!AssetDatabase.IsValidFolder(dir + "/_archive")) AssetDatabase.CreateFolder(dir, "_archive");
                    archived = dir + "/_archive/" + Path.GetFileNameWithoutExtension(path) + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".playable";
                    if (!AssetDatabase.CopyAsset(path, archived)) throw new IOException("could not archive " + path);
                    foreach (var t in tl.GetRootTracks().ToList()) tl.DeleteTrack(t);
                    if (tl.markerTrack != null) foreach (var m in tl.markerTrack.GetMarkers().ToList()) tl.markerTrack.DeleteMarker(m);
                }
                else
                {
                    tl = ScriptableObject.CreateInstance<TimelineAsset>();
                    AssetDatabase.CreateAsset(tl, path);
                }
                tl.editorSettings.frameRate = AgentJob.Float("fps", 30f);   // 1.8: frameRate (fps is obsolete)

                var dirGo = AnimUtil.FindOrCreate(AgentJob.Str("director", "Cutscene"));
                GameObjectUtility.RemoveMonoBehavioursWithMissingScript(dirGo);   // leftovers of renamed or moved scripts
                var director = AnimUtil.GetOrAdd<PlayableDirector>(dirGo);
                director.playableAsset = tl;
                director.playOnAwake = false;
                director.timeUpdateMode = DirectorUpdateMode.GameTime;
                // None hands the character back to its Animator Controller at the end; Hold freezes the last pose
                director.extrapolationMode = (DirectorWrapMode)Enum.Parse(typeof(DirectorWrapMode), AgentJob.Str("wrap", "None"));
                var receiver = AnimUtil.GetOrAdd<AgentMarkerReceiver>(dirGo);

                var tracks = new List<object>();
                var anim = AgentJob.Dict("animation");
                if (anim.Count > 0)
                {
                    var animator = Obj(anim["target"].ToString()).GetComponent<Animator>();
                    var t = tl.CreateTrack<AnimationTrack>(null, animator.name);
                    t.trackOffset = TrackOffset.ApplySceneOffsets;   // clips start where the character stands
                    foreach (var co in (List<object>)anim["clips"])
                    {
                        var c = (Dictionary<string, object>)co;
                        var clip = (AnimationClip)AnimControllerBuilder.LoadMotion(c["motion"].ToString());
                        var tc = t.CreateClip(clip);
                        tc.start = Fl(c, "start");
                        tc.duration = Fl(c, "duration", clip.length);
                        if (c.ContainsKey("blend_in")) tc.blendInDuration = Fl(c, "blend_in");
                    }
                    director.SetGenericBinding(t, animator);
                    tracks.Add("Animation:" + t.GetClips().Count());
                    // Clip root offsets are relative to the track, not to where the previous clip ended: without
                    // this the character snaps back to the start when the next clip begins (observed: z 7.17 -> -0.07
                    // at the Walk -> Victory cut). Scripted twin of the clip menu "Match Offsets To Previous Clip".
                    if (!anim.ContainsKey("match_offsets") || (anim["match_offsets"] is bool mo && mo))
                        MatchOffsets(director, t, animator);
                }
                var shots = AgentJob.List("shots");
                if (shots.Count > 0)
                {
                    var brain = AnimUtil.Require(Camera.main.GetComponent<CinemachineBrain>(), "no CinemachineBrain (run AnimCinemachine.SetupCameras)");
                    var t = tl.CreateTrack<CinemachineTrack>(null, "Cameras");
                    foreach (var so in shots)
                    {
                        var s = (Dictionary<string, object>)so;
                        var cam = Obj(s["camera"].ToString()).GetComponent<CinemachineVirtualCameraBase>();
                        var tc = t.CreateClip<CinemachineShot>();
                        tc.displayName = cam.name;
                        tc.start = Fl(s, "start");
                        tc.duration = Fl(s, "duration", 2f);
                        if (s.ContainsKey("blend_in")) tc.blendInDuration = Fl(s, "blend_in");   // overlap = camera blend
                        var shot = (CinemachineShot)tc.asset;
                        // an asset cannot reference a scene object: ExposedReference resolved by the director
                        shot.VirtualCamera.exposedName = GUID.Generate().ToString();
                        director.SetReferenceValue(shot.VirtualCamera.exposedName, cam);
                    }
                    director.SetGenericBinding(t, brain);
                    tracks.Add("Cinemachine:" + t.GetClips().Count());
                }
                foreach (var ao in AgentJob.List("activation"))
                {
                    var a = (Dictionary<string, object>)ao;
                    var go = Obj(a["object"].ToString());
                    var t = tl.CreateTrack<ActivationTrack>(null, go.name);
                    var tc = t.CreateDefaultClip();
                    tc.start = Fl(a, "start");
                    tc.duration = Fl(a, "duration", 1f);
                    t.postPlaybackState = ActivationTrack.PostPlaybackState.LeaveAsIs;
                    director.SetGenericBinding(t, go);
                    tracks.Add("Activation:" + go.name);
                }
                var light = AgentJob.Dict("light");
                if (light.Count > 0)
                {
                    var l = Obj(light["object"].ToString()).GetComponent<Light>();
                    var t = tl.CreateTrack<AgentLightTrack>(null, "Light");
                    foreach (var co in (List<object>)light["clips"])
                    {
                        var c = (Dictionary<string, object>)co;
                        var tc = t.CreateClip<AgentLightClip>();
                        tc.start = Fl(c, "start");
                        tc.duration = Fl(c, "duration", 2f);
                        if (c.ContainsKey("blend_in")) tc.blendInDuration = Fl(c, "blend_in");
                        var asset = (AgentLightClip)tc.asset;
                        asset.template.color = AgentJson.ToColor(c.TryGetValue("color", out var col) ? col : null, Color.white);
                        asset.template.intensity = Fl(c, "intensity", 1f);
                    }
                    director.SetGenericBinding(t, l);
                    tracks.Add("AgentLight:" + t.GetClips().Count());
                }
                var markers = AgentJob.List("markers");
                if (markers.Count > 0)
                {
                    tl.CreateMarkerTrack();   // markers here notify receivers on the director's GameObject
                    foreach (var mo in markers)
                    {
                        var m = (Dictionary<string, object>)mo;
                        var mk = tl.markerTrack.CreateMarker<AgentMarker>(Fl(m, "time"));
                        mk.payload = m.TryGetValue("payload", out var pl) ? pl.ToString() : "";
                    }
                    tracks.Add("Markers:" + markers.Count);
                }
                var sig = AgentJob.Dict("signal");
                if (sig.Count > 0)
                {
                    var assetPath = sig.TryGetValue("asset", out var ap) ? ap.ToString() : "Assets/AnimLab/ReturnControl.signal";
                    var sa = AssetDatabase.LoadAssetAtPath<SignalAsset>(assetPath);
                    if (sa == null) { sa = ScriptableObject.CreateInstance<SignalAsset>(); AssetDatabase.CreateAsset(sa, assetPath); }
                    var t = tl.CreateTrack<SignalTrack>(null, "Signals");
                    var em = t.CreateMarker<SignalEmitter>(Fl(sig, "time"));
                    em.asset = sa;
                    em.emitOnce = true;
                    var sr = AnimUtil.GetOrAdd<SignalReceiver>(dirGo);
                    if (sr.GetReaction(sa) == null)
                    {
                        var ev = new UnityEvent();
                        UnityEventTools.AddVoidPersistentListener(ev, receiver.OnSignal);   // persistent: survives save and reload
                        sr.AddReaction(sa, ev);
                    }
                    director.SetGenericBinding(t, dirGo);
                    tracks.Add("Signal:" + sa.name);
                }
                EditorUtility.SetDirty(tl);
                EditorUtility.SetDirty(director);
                AssetDatabase.SaveAssets();
                EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene());
                return new Dictionary<string, object>
                {
                    { "path", path }, { "archived_previous", archived }, { "duration", Math.Round(tl.duration, 3) },
                    { "frame_rate", tl.editorSettings.frameRate }, { "tracks", tracks }, { "bindings", Bindings(director) },
                };
            });
        }

        /// <summary>For each clip after the first: evaluate the Timeline where the clip starts, read the character's
        /// root pose, and store it as that clip's AnimationPlayableAsset.position/rotation. The character's whole
        /// hierarchy is restored afterwards so the saved scene is unchanged.</summary>
        public static List<object> MatchOffsets(PlayableDirector director, AnimationTrack track, Animator animator)
        {
            var saved = animator.GetComponentsInChildren<Transform>(true).Select(x => (x, x.localPosition, x.localRotation, x.localScale)).ToList();
            var cull = animator.cullingMode;
            animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;   // or the evaluation writes nothing (AnimSampler.FindTarget)
            var log = new List<object>();
            try
            {
                var clips = track.GetClips().OrderBy(c => c.start).ToList();
                for (int k = 1; k < clips.Count; k++)
                {
                    director.RebuildGraph();
                    director.time = clips[k].start;
                    director.Evaluate();
                    var asset = (AnimationPlayableAsset)clips[k].asset;
                    asset.position = animator.transform.localPosition;
                    asset.rotation = animator.transform.localRotation;
                    log.Add(clips[k].displayName + " @" + clips[k].start + " -> " + asset.position);
                }
            }
            finally
            {
                foreach (var (x, p, r, sc) in saved) { x.localPosition = p; x.localRotation = r; x.localScale = sc; }
                animator.cullingMode = cull;
                director.time = 0;
            }
            return log;
        }

        /// <summary>Every output track and its binding: a null binding plays nothing, silently.</summary>
        public static List<object> Bindings(PlayableDirector director)
        {
            var res = new List<object>();
            var tl = (TimelineAsset)director.playableAsset;
            foreach (var t in tl.GetOutputTracks())
            {
                var b = director.GetGenericBinding(t);
                // the Timeline's own marker track needs no binding: its markers notify the director's GameObject
                bool needs = t != tl.markerTrack && t.outputs.Any(o => o.outputTargetType != null);
                res.Add(new Dictionary<string, object> { { "track", t.name }, { "type", t.GetType().Name }, { "binding", b ? b.name : null }, { "needs_binding", needs } });
            }
            return res;
        }

        /// <summary>Play the cutscene in real Play mode at a fixed frame rate and record what fired. Needed
        /// because markers and signals fire only on Playback evaluations: a manual PlayableGraph.Evaluate(dt)
        /// scrub in edit mode sends none (observed 2026-09-24). Launch with quit=False, graphics=True.</summary>
        public static void PlayCutscene()
        {
            AgentJob.Run(() =>
            {
                OpenScene();
                var dirName = AgentJob.Str("director", "Cutscene");
                float fps = AgentJob.Float("fps", 30f);
                int afterStop = AgentJob.Int("after_stop_frames", 0);
                var prio = AgentJob.Dict("priorities");
                PlayableDirector director = null;
                AgentMarkerReceiver receiver = null;
                CinemachineBrain brain = null;
                var rows = new List<object>();
                var result = new Dictionary<string, object>();
                double lastRow = -1;
                int stoppedAt = -1;
                AnimPlayMode.Run(fps, 20000,
                    onStart: () =>
                    {
                        var go = Obj(dirName);                            // scene objects are new instances in Play mode
                        director = go.GetComponent<PlayableDirector>();
                        receiver = go.GetComponent<AgentMarkerReceiver>();
                        brain = Camera.main ? Camera.main.GetComponent<CinemachineBrain>() : null;
                        // priorities are ignored while the Timeline drives the Brain; the highest one takes over after it
                        foreach (var kv in prio) Obj(kv.Key).GetComponent<CinemachineCamera>().Priority = (int)AgentJson.ToDouble(kv.Value);
                        director.timeUpdateMode = DirectorUpdateMode.GameTime;
                        director.time = 0;
                        director.Play();
                    },
                    perFrame: f =>
                    {
                        if (director.time - lastRow >= 0.999 || (director.state != PlayState.Playing && stoppedAt < 0))
                        {
                            lastRow = director.time;
                            rows.Add(new Dictionary<string, object> { { "frame", f }, { "t", Math.Round(director.time, 3) }, { "state", director.state.ToString() },
                                                                      { "live", brain ? brain.ActiveVirtualCamera?.Name : null } });
                        }
                        if (director.state != PlayState.Playing && stoppedAt < 0) stoppedAt = f;   // wrap None: stops at the end
                        bool stop = stoppedAt >= 0 && f - stoppedAt >= afterStop;
                        // collect NOW: Play-mode objects are destroyed once Play mode exits (finish runs after that)
                        result["frames"] = f;
                        result["markers_received"] = receiver != null ? receiver.received.Cast<object>().ToList() : null;
                        result["signals_received"] = receiver != null ? receiver.signals : -1;
                        result["ended_by"] = stop ? "director stopped (wrap None)" : "frame limit";
                        if (stoppedAt >= 0 && brain)
                        {
                            result["live_after_stop"] = brain.ActiveVirtualCamera?.Name;
                            result["blending_after_stop"] = brain.IsBlending;
                            result["frames_after_stop"] = f - stoppedAt;
                        }
                        return stop;
                    },
                    finish: () => { result["rows"] = rows; return result; });
                return null;
            });
        }

        public static void AuditTimeline()
        {
            AgentJob.Run(() =>
            {
                OpenScene();
                var only = AgentJob.Str("director");
                var f = new AgentAudit.Findings();
                var dirs = new List<object>();
                foreach (var d in UnityEngine.Object.FindObjectsByType<PlayableDirector>(FindObjectsInactive.Include, FindObjectsSortMode.None))
                {
                    if (!string.IsNullOrEmpty(only) && d.name != only) continue;
                    dirs.Add(AuditDirector(d, f));
                }
                return new Dictionary<string, object> { { "directors", dirs }, { "findings", f.items }, { "counts", f.Counts() } };
            });
        }

        /// <summary>Static checks of one director and its Timeline: unbound tracks, Signal Emitters nobody reacts to,
        /// custom markers with no INotificationReceiver where they are delivered (a receiver gets EVERY notification
        /// routed to its GameObject, so it must type-check: gsEe0_o_934 [frame 00:22:57]), cameras whose priority
        /// the Timeline will ignore, and animation tracks driving procedural cameras.</summary>
        public static Dictionary<string, object> AuditDirector(PlayableDirector director, AgentAudit.Findings f)
        {
            var tl = director.playableAsset as TimelineAsset;
            var where = director.name;
            if (tl == null) { f.Add("error", "tl.no_timeline", where, "PlayableDirector without a TimelineAsset", "assign playableAsset"); return new Dictionary<string, object> { { "director", where } }; }
            foreach (var b in Bindings(director).Cast<Dictionary<string, object>>())
                if ((bool)b["needs_binding"] && b["binding"] == null)
                    f.Add("error", "tl.unbound_track", where + "/" + b["track"], "track has no binding: it plays nothing, silently", "director.SetGenericBinding(track, object)");
            var tracks = tl.GetOutputTracks().Cast<TrackAsset>().ToList();
            if (tl.markerTrack != null) tracks.Add(tl.markerTrack);
            int emitters = 0, markers = 0;
            foreach (var t in tracks.Distinct())
            {
                // the Timeline's own marker track notifies the director's GameObject; other tracks notify their binding
                var bound = t == tl.markerTrack ? null : director.GetGenericBinding(t);
                GameObject go = t == tl.markerTrack ? director.gameObject : bound is GameObject bgo ? bgo : bound is Component bc ? bc.gameObject : null;
                foreach (var m in t.GetMarkers())
                {
                    if (m is SignalEmitter se)
                    {
                        emitters++;
                        if (se.asset == null) { f.Add("error", "tl.signal_without_asset", where + "/" + t.name + "@" + se.time, "Signal Emitter without a Signal asset", "assign the asset"); continue; }
                        var reacting = go ? go.GetComponents<SignalReceiver>().FirstOrDefault(r => r.GetReaction(se.asset) != null) : null;
                        if (reacting == null)
                            f.Add("warn", "tl.signal_without_reaction", where + "/" + t.name + "@" + se.time, "Signal " + se.asset.name + " fires but no Signal Receiver on " + (go ? go.name : "(unbound track)") + " reacts to it",
                                  "SignalReceiver.AddReaction(asset, event) on the bound object");
                        else if (reacting.GetReaction(se.asset).GetPersistentEventCount() == 0)
                            f.Add("info", "tl.signal_reaction_empty", where + "/" + t.name + "@" + se.time, "reaction to " + se.asset.name + " has no persistent listener (runtime listeners only?)", null);
                    }
                    else if (m is INotification)
                    {
                        markers++;
                        if (go == null || go.GetComponents(typeof(INotificationReceiver)).Length == 0)
                            f.Add("warn", "tl.marker_without_receiver", where + "/" + t.name + "@" + m.time, m.GetType().Name + " is delivered to " + (go ? go.name : "(unbound track)") + " where no INotificationReceiver listens",
                                  "add a receiver that type-checks the notification (if (n is MyMarker m) ...)");
                    }
                }
            }
            // Timeline overrides the Brain: priority has no effect while it drives the camera (CM3.1 Brain doc)
            var shotCams = new List<CinemachineVirtualCameraBase>();
            foreach (var ct in tl.GetOutputTracks().OfType<CinemachineTrack>())
                foreach (var c in ct.GetClips())
                    if (c.asset is CinemachineShot shot)
                    {
                        var vc = shot.VirtualCamera.Resolve(director) as CinemachineVirtualCameraBase;
                        if (vc != null) shotCams.Add(vc);
                        else f.Add("error", "tl.shot_unresolved", where + "/" + ct.name + "/" + c.displayName, "Cinemachine shot whose camera reference does not resolve in this scene", "director.SetReferenceValue(exposedName, camera)");
                    }
            if (shotCams.Count > 0)
            {
                int maxShot = shotCams.Max(v => (int)v.Priority);
                foreach (var vc in UnityEngine.Object.FindObjectsByType<CinemachineCamera>(FindObjectsSortMode.None))
                    if (!shotCams.Contains(vc) && (int)vc.Priority > maxShot)
                        f.Add("info", "tl.priority_ignored", where + "/" + vc.name, vc.name + " (priority " + (int)vc.Priority + ") outranks the shot cameras but is ignored while the Timeline drives the Brain; it goes live when the Timeline stops",
                              "intended for the handoff? else lower it, or end the Timeline on a shot of that camera");
            }
            foreach (var at in tl.GetOutputTracks().OfType<AnimationTrack>())
                if (director.GetGenericBinding(at) is Animator an && an.GetComponent<CinemachineCamera>() &&
                    (an.GetComponent<CinemachineFollow>() || an.GetComponent<CinemachineOrbitalFollow>() || an.GetComponent<CinemachineThirdPersonFollow>() || an.GetComponent<CinemachinePositionComposer>()))
                    f.Add("warn", "tl.animation_on_procedural_camera", where + "/" + at.name, "animation track drives a camera that has a procedural Position Control: the Position Control wins (XTVzs4B1d7I [00:03:10])", "empty its Position Control, or animate its target");
            return new Dictionary<string, object>
            {
                { "director", where }, { "timeline", AssetDatabase.GetAssetPath(tl) }, { "wrap", director.extrapolationMode.ToString() },
                { "duration", Math.Round(tl.duration, 3) }, { "signal_emitters", emitters }, { "markers", markers },
                { "shot_cameras", shotCams.Select(v => (object)v.name).Distinct().ToList() },
            };
        }

        public static void SampleCutscene()
        {
            AgentJob.Run(() =>
            {
                OpenScene();
                var dirGo = Obj(AgentJob.Str("director", "Cutscene"));
                var director = dirGo.GetComponent<PlayableDirector>();
                var tl = (TimelineAsset)director.playableAsset;
                var receiver = dirGo.GetComponent<AgentMarkerReceiver>();
                if (receiver) { receiver.received.Clear(); receiver.signals = 0; }
                var brain = Camera.main.GetComponent<CinemachineBrain>();
                var keep = brain ? brain.UpdateMethod : CinemachineBrain.UpdateMethods.SmartUpdate;
                if (brain) brain.UpdateMethod = CinemachineBrain.UpdateMethods.ManualUpdate;
                foreach (var a in UnityEngine.Object.FindObjectsByType<Animator>(FindObjectsSortMode.None))
                {
                    a.cullingMode = AnimatorCullingMode.AlwaysAnimate;   // see AnimSampler.FindTarget
                    foreach (var smr in a.GetComponentsInChildren<SkinnedMeshRenderer>()) { smr.forceMatrixRecalculationPerRender = true; smr.updateWhenOffscreen = true; }
                }
                float fps = AgentJob.Float("fps", 30f);
                var captures = new HashSet<int>(AgentJob.List("captures").Select(c => Mathf.RoundToInt((float)AgentJson.ToDouble(c) * fps)));
                var outDir = AgentJob.OutDir("cutscene");
                var rows = new List<object>();
                var pngs = new List<object>();
                var tracked = AgentJob.List("track_objects").Select(o => Obj(o.ToString()).transform).ToList();
                var lightTrack = tl.GetOutputTracks().OfType<AgentLightTrack>().FirstOrDefault();
                var light = lightTrack ? director.GetGenericBinding(lightTrack) as Light : null;
                // priorities written before playing (Prioritize: a batch job runs no camera Update). The Timeline's
                // Cinemachine track overrides the Brain, so these must NOT change the live camera while it plays.
                var keptPriorities = new List<(CinemachineCamera, int)>();
                foreach (var kv in AgentJob.Dict("priorities"))
                {
                    var vc = Obj(kv.Key).GetComponent<CinemachineCamera>();
                    keptPriorities.Add((vc, (int)vc.Priority));
                    vc.Priority = (int)AgentJson.ToDouble(kv.Value);
                    vc.Prioritize();
                }
                director.timeUpdateMode = DirectorUpdateMode.Manual;
                director.time = 0;
                director.RebuildGraph();
                director.Play();
                int n = Mathf.RoundToInt((float)tl.duration * fps);
                try
                {
                    for (int i = 0; i <= n; i++)
                    {
                        if (i == 0) director.Evaluate();
                        else director.playableGraph.Evaluate(1f / fps);   // time advances: markers and signals fire when passed
                        if (brain) brain.ManualUpdate(i + 1, 1f / fps);
                        float t = (float)director.time;
                        if (i % Mathf.RoundToInt(fps / 2) == 0 || captures.Contains(i))
                        {
                            var row = new Dictionary<string, object>
                            {
                                { "i", i }, { "t", Math.Round(t, 3) }, { "live", brain ? brain.ActiveVirtualCamera?.Name : null },
                                { "blending", brain && brain.IsBlending },
                                { "light_intensity", light ? Math.Round(light.intensity, 4) : (double?)null },
                                { "light_color", light ? (object)light.color : null },
                            };
                            foreach (var tr in tracked) { row[tr.name + "_pos"] = tr.position; row[tr.name + "_yaw"] = Math.Round(tr.eulerAngles.y, 1); }
                            rows.Add(row);
                        }
                        if (captures.Contains(i))
                        {
                            var png = Path.Combine(outDir, "t" + (i / fps).ToString("00.0") + ".png");
                            AgentCapture.RenderCamera(Camera.main, AgentJob.Int("width", 640), AgentJob.Int("height", 360), png, 4);
                            pngs.Add(png);
                        }
                    }
                }
                finally
                {
                    director.Stop();
                    foreach (var (vc, pr) in keptPriorities) { vc.Priority = pr; vc.Prioritize(); }
                    director.timeUpdateMode = DirectorUpdateMode.GameTime;
                    if (brain) brain.UpdateMethod = keep;
                }
                return new Dictionary<string, object>
                {
                    { "duration", Math.Round(tl.duration, 3) }, { "rows", rows }, { "pngs", pngs },
                    { "markers_received", receiver ? receiver.received.Cast<object>().ToList() : null },
                    { "signals_received", receiver ? receiver.signals : -1 }, { "bindings", Bindings(director) },
                };
            });
        }
    }
}
