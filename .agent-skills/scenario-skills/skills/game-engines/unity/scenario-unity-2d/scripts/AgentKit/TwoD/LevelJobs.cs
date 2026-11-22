// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Places the actors of a 2D level from marker
// positions: the player (PlatformerController2D + stats asset + animator bridge), props and torches.
// Rules applied: player root scale 1 (casts use local collider size, Tarodev caveat), player on its
// own physics layer (ground casts use ~PlayerLayer), a frictionless material so the player never
// sticks to walls [added], one Sorting Group per multi-sprite object (2D e-book p. 27), emissive
// sprites (torch flame) on Sprite-Unlit-Default so they ignore the light level (Sasquatch 1h-hSlffawM).
//
// v0.2: hazards with a hitbox smaller than the art (Hazard2D, Celeste forgiveness) and one-way platforms
// (Platform Effector 2D, Use One Way, Surface Arc 180, side friction off; the collider must be Used By Effector).
// Job: AgentKit.TwoD.LevelJobs.Populate  args: scene, player [x,y], crates [[x,y]..], torches [[x,y]..],
//      spikes [[x,y]..] (feet), spike_inset_px [2,3], one_way [[x_left, y_top, width]..],
//      stats (asset path, created with Tarodev defaults if missing), controller (Animator controller path, optional)
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d/test_live_2d.py (P4b).
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.TwoD
{
    public static class LevelJobs
    {
        public const string SpriteUnlit = "Packages/com.unity.render-pipelines.universal/Runtime/Materials/Sprite-Unlit-Default.mat";

        public static void Populate()
        {
            AgentJob.Run(() =>
            {
                var scene = EditorSceneManager.OpenScene(AgentJob.Str("scene", "Assets/Scenes/Level2D.unity"), OpenSceneMode.Single);
                var actors = TwoDUtil.GetOrCreate("Actors");

                // ---- stats asset
                var statsPath = AgentJob.Str("stats", "Assets/Settings/PlatformerStats.asset");
                var stats = AssetDatabase.LoadAssetAtPath<PlatformerStats>(statsPath);
                if (stats == null)
                {
                    TwoDUtil.EnsureFolder(Path.GetDirectoryName(statsPath));
                    stats = ScriptableObject.CreateInstance<PlatformerStats>();
                    AssetDatabase.CreateAsset(stats, statsPath);
                }
                int playerLayer = LayerMask.NameToLayer("Player");
                if (playerLayer >= 0) { stats.PlayerLayer = 1 << playerLayer; EditorUtility.SetDirty(stats); }

                // ---- player
                var ppos = TwoDUtil.ToVector2(AgentJob.Has("player") ? AgentJob.Args["player"] : null, new Vector2(3.5f, 5f));
                var player = TwoDUtil.GetOrCreate("Player", actors.transform);
                player.transform.position = new Vector3(ppos.x, ppos.y + 0.05f, 0);
                player.transform.localScale = Vector3.one;
                if (playerLayer >= 0) player.layer = playerLayer;
                var sr = TwoDUtil.GetOrAdd<SpriteRenderer>(player);
                sr.sprite = TwoDUtil.Sprite("Assets/Art/Pixel/player.png", "player_idle0");
                sr.sortingLayerName = "Characters";
                var rb = TwoDUtil.GetOrAdd<Rigidbody2D>(player);
                rb.gravityScale = 0f;
                rb.freezeRotation = true;
                rb.interpolation = RigidbodyInterpolation2D.Interpolate;
                rb.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
                var col = TwoDUtil.GetOrAdd<CapsuleCollider2D>(player);
                col.size = new Vector2(0.55f, 0.85f);                    // narrower than a tile, below 1 unit tall
                col.offset = new Vector2(0f, 0.425f);                    // pivot at the feet (sprite pivot 8,0 px)
                col.direction = CapsuleDirection2D.Vertical;
                var matPath = "Assets/Settings/NoFriction.physicsMaterial2D";
                var mat = AssetDatabase.LoadAssetAtPath<PhysicsMaterial2D>(matPath);
                if (mat == null) { mat = new PhysicsMaterial2D("NoFriction") { friction = 0f, bounciness = 0f }; AssetDatabase.CreateAsset(mat, matPath); }
                col.sharedMaterial = mat;
                var ctrl = TwoDUtil.GetOrAdd<PlatformerController2D>(player);
                var so = new SerializedObject(ctrl);
                so.FindProperty("stats").objectReferenceValue = stats;   // private [SerializeField]: set serialized
                so.ApplyModifiedPropertiesWithoutUndo();
                var animPath = AgentJob.Str("controller", "Assets/Animation/Player.controller");
                var rac = AssetDatabase.LoadAssetAtPath<RuntimeAnimatorController>(animPath);
                if (rac != null)
                {
                    var anim = TwoDUtil.GetOrAdd<Animator>(player);
                    anim.runtimeAnimatorController = rac;
                    anim.cullingMode = AnimatorCullingMode.CullUpdateTransforms;
                    TwoDUtil.GetOrAdd<PlatformerAnimatorBridge>(player);
                }

                // ---- crates (static props with normal maps and shadow casters)
                var props = TwoDUtil.GetOrCreate("Props");
                foreach (Transform t in props.transform.Cast<Transform>().ToList()) Object.DestroyImmediate(t.gameObject);
                int ci = 0;
                foreach (var o in AgentJob.List("crates"))
                {
                    var p = TwoDUtil.ToVector2(o, Vector2.zero);
                    var c = new GameObject("Crate_" + ci++);
                    c.transform.SetParent(props.transform, false);
                    c.transform.position = new Vector3(p.x, p.y + 0.5f, 0);
                    var csr = c.AddComponent<SpriteRenderer>();
                    csr.sprite = TwoDUtil.Sprite("Assets/Art/Pixel/crate.png");
                    csr.sortingLayerName = "Characters";
                    csr.sortingOrder = -1;
                    c.AddComponent<BoxCollider2D>().size = new Vector2(1, 1);
                    if (LayerMask.NameToLayer("Ground") >= 0) c.layer = LayerMask.NameToLayer("Ground");
                    c.AddComponent<ShadowCaster2D>();                     // Unity 6 default source: renderer outline
                }

                // ---- torches (unlit flame sprite; the light is added by LightJobs)
                var torches = TwoDUtil.GetOrCreate("Torches");
                foreach (Transform t in torches.transform.Cast<Transform>().ToList()) Object.DestroyImmediate(t.gameObject);
                var unlit = AssetDatabase.LoadAssetAtPath<Material>(SpriteUnlit);
                int ti = 0;
                foreach (var o in AgentJob.List("torches"))
                {
                    var p = TwoDUtil.ToVector2(o, Vector2.zero);
                    var t = new GameObject("Torch_" + ti++);
                    t.transform.SetParent(torches.transform, false);
                    t.transform.position = new Vector3(p.x, p.y + 0.5f, 0);
                    var tsr = t.AddComponent<SpriteRenderer>();
                    tsr.sprite = TwoDUtil.Sprite("Assets/Art/Pixel/torch.png");
                    tsr.sortingLayerName = "Ground";
                    tsr.sortingOrder = 5;
                    if (unlit != null) tsr.sharedMaterial = unlit;
                }

                // ---- hazards: trigger hitbox smaller than the art
                var hazards = TwoDUtil.GetOrCreate("Hazards");
                foreach (Transform t in hazards.transform.Cast<Transform>().ToList()) Object.DestroyImmediate(t.gameObject);
                var inset = TwoDUtil.ToVector2(AgentJob.Has("spike_inset_px") ? AgentJob.Args["spike_inset_px"] : null, new Vector2(2, 3));
                var ratios = new List<object>();
                int hi = 0;
                foreach (var o in AgentJob.List("spikes"))
                {
                    var p = TwoDUtil.ToVector2(o, Vector2.zero);
                    var h = new GameObject("Spikes_" + hi++);
                    h.transform.SetParent(hazards.transform, false);
                    h.transform.position = new Vector3(p.x, p.y, 0);
                    var hsr = h.AddComponent<SpriteRenderer>();
                    hsr.sprite = TwoDUtil.Sprite("Assets/Art/Pixel/spikes.png");
                    hsr.sortingLayerName = "Ground";
                    hsr.sortingOrder = 2;
                    var hz = h.AddComponent<Hazard2D>();
                    hz.insetPixels = inset;
                    hz.pixelsPerUnit = AgentJob.Int("ppu", 16);
                    if (playerLayer >= 0) hz.targetLayers = 1 << playerLayer;
                    var r = hz.FitHitbox();
                    ratios.Add(new[] { Mathf.Round(r.x * 1000) / 1000, Mathf.Round(r.y * 1000) / 1000 });
                }

                // ---- one-way platforms (jump up through, land on top, Down + Jump drops through)
                var ways = TwoDUtil.GetOrCreate("OneWayPlatforms");
                foreach (Transform t in ways.transform.Cast<Transform>().ToList()) Object.DestroyImmediate(t.gameObject);
                int wi = 0;
                foreach (var o in AgentJob.List("one_way"))
                {
                    var l = (List<object>)o;
                    float x0 = (float)AgentJson.ToDouble(l[0]), yTop = (float)AgentJson.ToDouble(l[1]), w = (float)AgentJson.ToDouble(l[2]);
                    var g = new GameObject("OneWay_" + wi++);
                    g.transform.SetParent(ways.transform, false);
                    g.transform.position = new Vector3(x0 + w / 2f, yTop, 0);
                    var gsr = g.AddComponent<SpriteRenderer>();
                    gsr.sprite = TwoDUtil.Sprite("Assets/Art/Pixel/platform_oneway.png");
                    gsr.drawMode = SpriteDrawMode.Tiled;
                    gsr.size = new Vector2(w, gsr.sprite.bounds.size.y);
                    gsr.sortingLayerName = "Ground";
                    var bc = g.AddComponent<BoxCollider2D>();
                    bc.size = new Vector2(w, 0.25f);
                    bc.offset = new Vector2(0, -0.125f);
                    bc.usedByEffector = true;
                    var pe = g.AddComponent<PlatformEffector2D>();
                    pe.useOneWay = true;
                    pe.surfaceArc = 180f;
                    pe.useSideFriction = false;
                    pe.useSideBounce = false;
                    if (LayerMask.NameToLayer("Ground") >= 0) g.layer = LayerMask.NameToLayer("Ground");
                }

                AssetDatabase.SaveAssets();
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                return new Dictionary<string, object>
                {
                    { "spikes", hi }, { "spike_hitbox_to_art", ratios }, { "one_way_platforms", wi },
                    { "player", player.transform.position }, { "player_layer", LayerMask.LayerToName(player.layer) },
                    { "stats", statsPath }, { "player_layer_mask", stats.PlayerLayer.value },
                    { "player_height_units", sr.bounds.size.y }, { "collider", col.size },
                    { "animator", rac != null ? animPath : null }, { "crates", ci }, { "torches", ti },
                    { "unlit_material", unlit != null ? unlit.name : null },
                    { "player_material", sr.sharedMaterial != null ? sr.sharedMaterial.name : null },
                };
            });
        }
    }
}
