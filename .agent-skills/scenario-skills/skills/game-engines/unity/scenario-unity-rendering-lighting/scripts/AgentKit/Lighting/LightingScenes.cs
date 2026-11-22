// AgentKit.Lighting v0.2 (scenario-unity-rendering-lighting skill, 2026-09-24). Lighting test scenes and
// the light rig, from code.
//
// Jobs (-nographics is fine; nothing renders here):
//   AgentKit.Lighting.LightingScenes.BuildOutdoorDemo   args: path (Assets/Scenes/Lighting/OutdoorDay.unity),
//       sun_pitch (50), sun_yaw (-30), sun_intensity (1), sun_kelvin (5500). Stylized village square: ground, plaza, houses, trees, a row
//       of poles 10 m apart (shadow-distance calibration, URP settings tour HCXCmHgV7Sk [00:14:26]),
//       two 18% grey cards (one facing the sun, one in a house shadow facing up), a dynamic
//       capsule, a Main Camera with post-processing on, and AgentView_* bookmarks.
//   AgentKit.Lighting.LightingScenes.BuildInteriorDemo  args: path (Assets/Scenes/Lighting/Interior.unity), lamp_intensity (1).
//       A room with 0.3 m walls, a window facing the sun, a door, furniture, a baked lamp, grey
//       cards on the table and the back wall, a chrome ball (reflection check), bookmarks.
//   AgentKit.Lighting.LightingScenes.BuildShadowmaskRangeDemo  args: path
//       (Assets/Scenes/Lighting/ShadowmaskRange.unity). Proves which Lighting Mode a tier really
//       renders: a Mixed sun (pitch 40, yaw 90), a static caster about 11 m from the camera and one
//       about 45 m away, each with a grey patch in its shadow and a lit patch beside it (probes
//       Patch_Shadow_Near/Far, Patch_Lit_Near/Far), bookmark A_Range. With Max Distance 20 m: near
//       shadows are realtime under Distance Shadowmask, far ones exist only if baked into the
//       shadowmask. Rotating the sun after the bake (SetLights) separates realtime from baked.
//   AgentKit.Lighting.LightingScenes.SetLights          args: scene, lights [{name, type?, create?,
//       mode, intensity, temperature, color, rotation, position, range, shadows, shadow_strength,
//       bounce}], ambient {mode: skybox|trilight|flat, intensity, sky, equator, ground, color},
//       sun (name of the light to use as RenderSettings.sun). Returns the rig as data.
// Everything static is built from Cube, Cylinder and Sphere primitives: they carry lightmap UVs
// (uv2), while GameObject.CreatePrimitive(Plane) and (Quad) have none (observed 2026-09-24,
// uv2 length 0): never bake a Plane floor without generating UVs.
using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace AgentKit.Lighting
{
    public static class LightingScenes
    {
        public const string MatFolder = "Assets/Lighting/Materials";

        /// <summary>Linear albedo 0.18 (the photographer's middle grey) as the sRGB colour URP
        /// materials expect in a Linear project.</summary>
        public static Color GreyCardColor => new Color(0.18f, 0.18f, 0.18f).gamma;

        static GameObject Box(string name, Transform parent, Vector3 pos, Vector3 scale, Material m, PrimitiveType type = PrimitiveType.Cube, Vector3? euler = null)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            if (parent) go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            if (euler.HasValue) go.transform.localRotation = Quaternion.Euler(euler.Value);
            go.GetComponent<MeshRenderer>().sharedMaterial = m;
            return go;
        }

        static Scene NewScene(string path)
        {
            LightingUtil.EnsureFolder(System.IO.Path.GetDirectoryName(path).Replace('\\', '/'));
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, path);
            return scene;
        }

        static Material Sky()
        {
            LightingUtil.EnsureFolder(MatFolder);
            var path = MatFolder + "/SkyProcedural.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(Shader.Find("Skybox/Procedural"));
                AssetDatabase.CreateAsset(m, path);
            }
            m.SetFloat("_SunSize", 0.04f);
            m.SetFloat("_AtmosphereThickness", 1.0f);
            m.SetFloat("_Exposure", 1.3f);
            m.SetColor("_SkyTint", new Color(0.5f, 0.55f, 0.65f));
            m.SetColor("_GroundColor", new Color(0.37f, 0.35f, 0.32f));
            EditorUtility.SetDirty(m);
            return m;
        }

        static Light Sun(float pitch, float yaw, float intensity, float kelvin)
        {
            var go = new GameObject("Sun");
            var l = go.AddComponent<Light>();
            l.type = LightType.Directional;
            l.lightmapBakeType = LightmapBakeType.Mixed;
            l.shadows = LightShadows.Soft;
            l.useColorTemperature = true;
            l.colorTemperature = kelvin;
            l.color = Color.white;
            l.intensity = intensity;
            go.transform.rotation = Quaternion.Euler(pitch, yaw, 0);
            return l;
        }

        static Camera MainCamera(Vector3 pos, Vector3 lookAt, float fov)
        {
            var go = new GameObject("Main Camera") { tag = "MainCamera" };
            var cam = go.AddComponent<Camera>();
            cam.fieldOfView = fov;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 500f;
            go.AddComponent<AudioListener>();
            go.transform.position = pos;
            go.transform.rotation = Quaternion.LookRotation(lookAt - pos, Vector3.up);
            var data = cam.GetUniversalAdditionalCameraData();
            data.renderPostProcessing = true;   // "the secret magic button" (Brackeys 9tjYz6Ab0oc [00:02:13])
            data.antialiasing = AntialiasingMode.None;
            return cam;
        }

        /// <summary>A flat cube (the grey card) whose +Y face points along normal.</summary>
        static GameObject Card(string name, Vector3 pos, Vector3 normal, float size, Material m)
        {
            var go = Box(name, null, pos, new Vector3(size, 0.03f, size), m);
            go.transform.rotation = Quaternion.FromToRotation(Vector3.up, normal.normalized);
            return go;
        }

        static Dictionary<string, object> Describe(Scene s)
        {
            int renderers = 0, lights = 0, bookmarks = 0;
            foreach (var r in UnityEngine.Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None)) renderers++;
            foreach (var l in UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None)) lights++;
            bookmarks = AgentCapture.SceneBookmarks().Count;
            return new Dictionary<string, object> { { "scene", s.path }, { "renderers", renderers }, { "lights", lights }, { "bookmarks", bookmarks } };
        }

        // ------------------------------------------------------------------ outdoor
        public static void BuildOutdoorDemo()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("path", "Assets/Scenes/Lighting/OutdoorDay.unity");
                float pitch = AgentJob.Float("sun_pitch", 50f), yaw = AgentJob.Float("sun_yaw", -30f);
                var scene = NewScene(path);
                var grass = LightingUtil.LitMaterial(MatFolder, "Grass", new Color(0.42f, 0.62f, 0.33f), 0.1f);
                var stone = LightingUtil.LitMaterial(MatFolder, "PlazaStone", new Color(0.72f, 0.68f, 0.6f), 0.15f);
                var wall = LightingUtil.LitMaterial(MatFolder, "WallCream", new Color(0.9f, 0.8f, 0.64f), 0.1f);
                var roofA = LightingUtil.LitMaterial(MatFolder, "RoofTeal", new Color(0.2f, 0.52f, 0.55f), 0.3f);
                var roofB = LightingUtil.LitMaterial(MatFolder, "RoofRed", new Color(0.72f, 0.3f, 0.22f), 0.3f);
                var leaf = LightingUtil.LitMaterial(MatFolder, "Leaf", new Color(0.3f, 0.55f, 0.28f), 0.1f);
                var bark = LightingUtil.LitMaterial(MatFolder, "Bark", new Color(0.4f, 0.28f, 0.18f), 0.1f);
                var pole = LightingUtil.LitMaterial(MatFolder, "Pole", new Color(0.3f, 0.3f, 0.33f), 0.2f);
                var hero = LightingUtil.LitMaterial(MatFolder, "Hero", new Color(0.85f, 0.25f, 0.3f), 0.4f);
                var grey = LightingUtil.LitMaterial(MatFolder, "GreyCard18", GreyCardColor, 0.0f);

                var env = new GameObject("Environment").transform;
                Box("Ground", env, new Vector3(0, -0.1f, 10), new Vector3(90, 0.2f, 110), grass);
                Box("Plaza", env, new Vector3(0, 0.02f, 0), new Vector3(22, 0.04f, 22), stone);
                var houses = new[] { new Vector3(-7, 0, 7), new Vector3(7, 0, 8), new Vector3(-8, 0, -7), new Vector3(8, 0, -8) };
                for (int i = 0; i < houses.Length; i++)
                {
                    var h = new GameObject("House_" + i).transform;
                    h.SetParent(env, false);
                    h.localPosition = houses[i];
                    Box("Body", h, new Vector3(0, 2f, 0), new Vector3(5, 4, 5), wall);
                    Box("Roof", h, new Vector3(0, 4.35f, 0), new Vector3(5.8f, 0.7f, 5.8f), i % 2 == 0 ? roofA : roofB);
                    Box("Door", h, new Vector3(0, 1.1f, -2.52f), new Vector3(1.1f, 2.2f, 0.06f), roofB);
                }
                var trees = new[] { new Vector3(0, 0, 14), new Vector3(-14, 0, 0), new Vector3(14, 0, 2), new Vector3(3, 0, -15) };
                for (int i = 0; i < trees.Length; i++)
                {
                    var t = new GameObject("Tree_" + i).transform;
                    t.SetParent(env, false);
                    t.localPosition = trees[i];
                    Box("Trunk", t, new Vector3(0, 1.5f, 0), new Vector3(0.5f, 1.5f, 0.5f), bark, PrimitiveType.Cylinder);
                    Box("Canopy", t, new Vector3(0, 4f, 0), new Vector3(3.4f, 3.2f, 3.4f), leaf, PrimitiveType.Sphere);
                }
                var poles = new GameObject("Poles_10m").transform;
                poles.SetParent(env, false);
                for (int i = 1; i <= 7; i++)
                    Box("Pole_" + (i * 10) + "m", poles, new Vector3(-20, 1.5f, i * 10f), new Vector3(0.25f, 1.5f, 0.25f), pole, PrimitiveType.Cylinder);

                var sun = Sun(pitch, yaw, AgentJob.Float("sun_intensity", 1f), AgentJob.Float("sun_kelvin", 5500f));
                RenderSettings.sun = sun;
                RenderSettings.skybox = Sky();
                RenderSettings.ambientMode = AmbientMode.Skybox;
                RenderSettings.ambientIntensity = 1f;

                // grey cards: one square to the sun, one in the shadow of house 0 facing up (sky only)
                var toSun = -sun.transform.forward;
                Card("GreyCard_Sun", new Vector3(2.5f, 1.2f, -3f), toSun, 0.8f, grey);
                var horiz = Vector3.ProjectOnPlane(sun.transform.forward, Vector3.up).normalized;
                var shadePos = houses[0] + horiz * 3.4f + new Vector3(0, 0.35f, 0);
                Card("GreyCard_Shade", shadePos, Vector3.up, 0.8f, grey);

                var heroGo = Box("Hero_Dynamic", null, new Vector3(1, 1f, -1), new Vector3(0.8f, 1f, 0.8f), hero, PrimitiveType.Capsule);
                GameObjectUtility.SetStaticEditorFlags(heroGo, (StaticEditorFlags)0);

                MainCamera(new Vector3(4, 1.7f, -12), new Vector3(-1, 1.6f, 4), 60f);
                AgentCapture.SaveBookmark("A_Wide", new Vector3(20, 13, -24), new Vector3(0, 1, 2), 50f);
                AgentCapture.SaveBookmark("B_Street", new Vector3(4, 1.7f, -12), new Vector3(-1, 1.6f, 4), 60f);
                AgentCapture.SaveBookmark("C_Shade", shadePos + horiz * 4.5f + new Vector3(0, 2.0f, 0), shadePos + new Vector3(0, 0.3f, 0), 55f);
                AgentCapture.SaveBookmark("D_Poles", new Vector3(-17, 1.7f, 2), new Vector3(-20, 1.2f, 40), 50f);

                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                var d = Describe(scene);
                d["sun_forward"] = LightingUtil.V(sun.transform.forward);
                d["grey_card_linear_albedo"] = 0.18;
                d["grey_card_srgb"] = Math.Round(GreyCardColor.r, 4);
                return d;
            });
        }

        // ------------------------------------------------------------------ interior
        public static void BuildInteriorDemo()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("path", "Assets/Scenes/Lighting/Interior.unity");
                var scene = NewScene(path);
                var wallM = LightingUtil.LitMaterial(MatFolder, "InteriorWall", new Color(0.86f, 0.8f, 0.7f), 0.1f);
                var floorM = LightingUtil.LitMaterial(MatFolder, "WoodFloor", new Color(0.58f, 0.4f, 0.26f), 0.35f);
                var ceilM = LightingUtil.LitMaterial(MatFolder, "Ceiling", new Color(0.92f, 0.9f, 0.86f), 0.05f);
                var tableM = LightingUtil.LitMaterial(MatFolder, "Table", new Color(0.46f, 0.3f, 0.2f), 0.3f);
                var shelfM = LightingUtil.LitMaterial(MatFolder, "ShelfTeal", new Color(0.2f, 0.5f, 0.55f), 0.25f);
                var boxM = LightingUtil.LitMaterial(MatFolder, "BoxOrange", new Color(0.82f, 0.46f, 0.25f), 0.2f);
                var grass = LightingUtil.LitMaterial(MatFolder, "Grass", new Color(0.42f, 0.62f, 0.33f), 0.1f);
                var grey = LightingUtil.LitMaterial(MatFolder, "GreyCard18", GreyCardColor, 0.0f);
                var chrome = LightingUtil.LitMaterial(MatFolder, "Chrome", new Color(0.9f, 0.9f, 0.9f), 0.95f, 1f);

                var room = new GameObject("Room").transform;
                const float W = 8f, D = 6f, H = 3f, T = 0.3f;
                Box("Floor", room, new Vector3(0, -0.1f, 0), new Vector3(W + 2 * T, 0.2f, D + 2 * T), floorM);
                Box("Ceiling", room, new Vector3(0, H + 0.1f, 0), new Vector3(W + 2 * T, 0.2f, D + 2 * T), ceilM);
                Box("Wall_Back", room, new Vector3(0, H / 2, D / 2 + T / 2), new Vector3(W + 2 * T, H, T), wallM);
                Box("Wall_Left", room, new Vector3(-W / 2 - T / 2, H / 2, 0), new Vector3(T, H, D), wallM);
                // right wall with a door (1.0 x 2.1 m) near the front
                Box("Wall_Right_A", room, new Vector3(W / 2 + T / 2, H / 2, 0.75f), new Vector3(T, H, 4.5f), wallM);
                Box("Wall_Right_Top", room, new Vector3(W / 2 + T / 2, 2.55f, -2.5f), new Vector3(T, 0.9f, 1.0f), wallM);
                // front wall (z = -3) with a 2.4 x 1.4 m window, sill at 0.9 m
                float zf = -D / 2 - T / 2;
                Box("Wall_Front_L", room, new Vector3(-2.75f, H / 2, zf), new Vector3(3.1f, H, T), wallM);
                Box("Wall_Front_R", room, new Vector3(2.75f, H / 2, zf), new Vector3(3.1f, H, T), wallM);
                Box("Wall_Front_Sill", room, new Vector3(0, 0.45f, zf), new Vector3(2.4f, 0.9f, T), wallM);
                Box("Wall_Front_Head", room, new Vector3(0, 2.65f, zf), new Vector3(2.4f, 0.7f, T), wallM);

                var furn = new GameObject("Furniture").transform;
                Box("Table_Top", furn, new Vector3(1.2f, 0.76f, 1.0f), new Vector3(1.6f, 0.08f, 0.9f), tableM);
                foreach (var o in new[] { new Vector2(-0.7f, -0.35f), new Vector2(0.7f, -0.35f), new Vector2(-0.7f, 0.35f), new Vector2(0.7f, 0.35f) })
                    Box("Table_Leg", furn, new Vector3(1.2f + o.x, 0.36f, 1.0f + o.y), new Vector3(0.08f, 0.72f, 0.08f), tableM);
                Box("Shelf", furn, new Vector3(-3.6f, 1.0f, 1.2f), new Vector3(0.5f, 2.0f, 2.2f), shelfM);
                Box("Crate_A", furn, new Vector3(-3.3f, 0.3f, -2.3f), new Vector3(0.6f, 0.6f, 0.6f), boxM);
                Box("Crate_B", furn, new Vector3(-2.6f, 0.25f, -2.5f), new Vector3(0.5f, 0.5f, 0.5f), boxM);
                Box("Pedestal", furn, new Vector3(-1.6f, 0.45f, -0.6f), new Vector3(0.5f, 0.9f, 0.5f), wallM);
                Box("MirrorBall", furn, new Vector3(-1.6f, 1.2f, -0.6f), new Vector3(0.6f, 0.6f, 0.6f), chrome, PrimitiveType.Sphere);

                Box("Outside_Ground", null, new Vector3(0, -0.25f, -10), new Vector3(60, 0.2f, 40), grass);

                var sun = Sun(35f, 20f, 1f, 5500f);   // travels toward +z and down: through the window
                RenderSettings.sun = sun;
                RenderSettings.skybox = Sky();
                RenderSettings.ambientMode = AmbientMode.Skybox;

                var lampGo = new GameObject("Lamp");
                lampGo.transform.position = new Vector3(-2.2f, 2.5f, 1.6f);
                var lamp = lampGo.AddComponent<Light>();
                lamp.type = LightType.Point;
                lamp.lightmapBakeType = LightmapBakeType.Baked;
                lamp.useColorTemperature = true;
                lamp.colorTemperature = 2700f;
                lamp.range = 7f;
                lamp.intensity = AgentJob.Float("lamp_intensity", 1f);
                lamp.shadows = LightShadows.Soft;

                Card("GreyCard_Table", new Vector3(1.65f, 0.815f, 1.0f), Vector3.up, 0.4f, grey);   // off-centre: the table top stays measurable
                Card("GreyCard_Wall", new Vector3(0.9f, 1.5f, D / 2 - 0.02f), Vector3.back, 0.5f, grey);

                MainCamera(new Vector3(3.3f, 1.6f, -2.5f), new Vector3(-2f, 1.0f, 2f), 65f);
                AgentCapture.SaveBookmark("A_Room", new Vector3(3.3f, 1.6f, -2.5f), new Vector3(-2f, 1.0f, 2f), 65f);
                AgentCapture.SaveBookmark("B_Window", new Vector3(0.3f, 1.5f, 2.4f), new Vector3(0f, 1.4f, -3f), 65f);
                AgentCapture.SaveBookmark("C_Corner", new Vector3(1.8f, 1.4f, -1.2f), new Vector3(-4f, 2.8f, 3f), 60f);
                AgentCapture.SaveBookmark("D_Ball", new Vector3(-0.3f, 1.35f, -1.6f), new Vector3(-1.6f, 1.2f, -0.6f), 40f);

                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                var d = Describe(scene);
                d["sun_forward"] = LightingUtil.V(sun.transform.forward);
                d["wall_thickness_m"] = T;
                return d;
            });
        }

        // ------------------------------------------------------------------ light rig
        public static Dictionary<string, object> DescribeLight(Light l)
        {
            return new Dictionary<string, object>
            {
                { "name", l.name }, { "type", l.type.ToString() }, { "mode", l.lightmapBakeType.ToString() },
                { "intensity", Math.Round(l.intensity, 4) }, { "temperature", l.useColorTemperature ? l.colorTemperature : (object)null },
                { "color", l.color }, { "shadows", l.shadows.ToString() }, { "shadow_strength", Math.Round(l.shadowStrength, 3) },
                { "bounce", Math.Round(l.bounceIntensity, 3) }, { "range", Math.Round(l.range, 3) },
                { "rotation", LightingUtil.V(l.transform.eulerAngles) }, { "position", LightingUtil.V(l.transform.position) },
            };
        }

        public static void SetLights()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene");
                var scene = string.IsNullOrEmpty(scenePath) ? SceneManager.GetActiveScene() : EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var lights = new List<object>();
                foreach (var o in AgentJob.List("lights"))
                {
                    var d = (Dictionary<string, object>)o;
                    var name = (string)d["name"];
                    var go = GameObject.Find(name);
                    Light l = go ? go.GetComponent<Light>() : null;
                    if (l == null)
                    {
                        if (!d.TryGetValue("create", out var c) || !LightingUtil.ToBool(c)) throw new ArgumentException("light '" + name + "' not found (pass create: true)");
                        go = go ? go : new GameObject(name);
                        l = go.AddComponent<Light>();
                    }
                    Undo.RecordObject(l, "Agent: light");
                    Undo.RecordObject(l.transform, "Agent: light transform");
                    if (d.TryGetValue("type", out var ty)) l.type = (LightType)Enum.Parse(typeof(LightType), (string)ty, true);
                    if (d.TryGetValue("mode", out var mo)) l.lightmapBakeType = (LightmapBakeType)Enum.Parse(typeof(LightmapBakeType), (string)mo, true);
                    if (d.TryGetValue("intensity", out var it)) l.intensity = (float)AgentJson.ToDouble(it);
                    if (d.TryGetValue("temperature", out var te)) { l.useColorTemperature = true; l.colorTemperature = (float)AgentJson.ToDouble(te); }
                    if (d.TryGetValue("color", out var co)) l.color = AgentJson.ToColor(co, Color.white);
                    if (d.TryGetValue("rotation", out var ro)) l.transform.rotation = Quaternion.Euler(AgentJson.ToVector3(ro, Vector3.zero));
                    if (d.TryGetValue("position", out var po)) l.transform.position = AgentJson.ToVector3(po, Vector3.zero);
                    if (d.TryGetValue("range", out var ra)) l.range = (float)AgentJson.ToDouble(ra);
                    if (d.TryGetValue("shadows", out var sh)) l.shadows = (LightShadows)Enum.Parse(typeof(LightShadows), (string)sh, true);
                    if (d.TryGetValue("shadow_strength", out var ss)) l.shadowStrength = (float)AgentJson.ToDouble(ss);
                    if (d.TryGetValue("bounce", out var bo)) l.bounceIntensity = (float)AgentJson.ToDouble(bo);
                    if (d.TryGetValue("spot_angle", out var sa)) l.spotAngle = (float)AgentJson.ToDouble(sa);
                    lights.Add(DescribeLight(l));
                }
                var amb = AgentJob.Dict("ambient");
                if (amb.Count > 0)
                {
                    if (amb.TryGetValue("mode", out var am)) RenderSettings.ambientMode = (AmbientMode)Enum.Parse(typeof(AmbientMode), (string)am, true);
                    if (amb.TryGetValue("intensity", out var ai)) RenderSettings.ambientIntensity = (float)AgentJson.ToDouble(ai);
                    if (amb.TryGetValue("sky", out var sk)) RenderSettings.ambientSkyColor = AgentJson.ToColor(sk, Color.white);
                    if (amb.TryGetValue("equator", out var eq)) RenderSettings.ambientEquatorColor = AgentJson.ToColor(eq, Color.grey);
                    if (amb.TryGetValue("ground", out var gr)) RenderSettings.ambientGroundColor = AgentJson.ToColor(gr, Color.grey);
                    if (amb.TryGetValue("color", out var ac)) RenderSettings.ambientLight = AgentJson.ToColor(ac, Color.grey);
                    if (amb.TryGetValue("reflection_intensity", out var ri)) RenderSettings.reflectionIntensity = (float)AgentJson.ToDouble(ri);
                }
                if (AgentJob.Has("sun"))
                {
                    var s = GameObject.Find(AgentJob.Str("sun"));
                    RenderSettings.sun = s ? s.GetComponent<Light>() : null;
                }
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                return new Dictionary<string, object>
                {
                    { "scene", scene.path }, { "lights", lights },
                    { "ambient_mode", RenderSettings.ambientMode.ToString() }, { "ambient_intensity", RenderSettings.ambientIntensity },
                    { "sun", RenderSettings.sun ? RenderSettings.sun.name : null },
                    { "note", "Skybox ambient changes need a Generate Lighting (bake) in Unity 6: the ambient probe is no longer auto-baked" },
                };
            });
        }
        // ------------------------------------------------------------------ shadowmask range check
        public static void BuildShadowmaskRangeDemo()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("path", "Assets/Scenes/Lighting/ShadowmaskRange.unity");
                var scene = NewScene(path);
                var ground = LightingUtil.LitMaterial(MatFolder, "PlazaStone", new Color(0.72f, 0.68f, 0.6f), 0.15f);
                var wall = LightingUtil.LitMaterial(MatFolder, "WallCream", new Color(0.9f, 0.8f, 0.64f), 0.1f);
                var grey = LightingUtil.LitMaterial(MatFolder, "GreyCard18", GreyCardColor, 0.0f);
                var env = new GameObject("Environment").transform;
                Box("Ground", env, new Vector3(0, -0.1f, 25), new Vector3(40, 0.2f, 80), ground);
                // light travels +x and down (pitch 40): a caster of height h throws its shadow h / tan(40) = 1.19 h towards +x
                Box("Caster_Near", env, new Vector3(-1.5f, 1.5f, 4f), new Vector3(1f, 3f, 4f), wall);
                Box("Patch_Shadow_Near", env, new Vector3(0.8f, 0.02f, 4f), new Vector3(2f, 0.04f, 2f), grey);
                Box("Patch_Lit_Near", env, new Vector3(0.8f, 0.02f, 9f), new Vector3(2f, 0.04f, 2f), grey);
                Box("Caster_Far", env, new Vector3(-3f, 3f, 40f), new Vector3(2f, 6f, 8f), wall);
                Box("Patch_Shadow_Far", env, new Vector3(1.5f, 0.02f, 40f), new Vector3(6f, 0.04f, 6f), grey);
                Box("Patch_Lit_Far", env, new Vector3(1.5f, 0.02f, 53f), new Vector3(6f, 0.04f, 6f), grey);
                var sun = Sun(40f, 90f, AgentJob.Float("sun_intensity", 1f), 5500f);
                RenderSettings.sun = sun;
                RenderSettings.skybox = Sky();
                RenderSettings.ambientMode = AmbientMode.Skybox;
                var cam = new Vector3(0, 8, -4);
                var look = new Vector3(1, 0, 14);
                MainCamera(cam, look, 60f);
                AgentCapture.SaveBookmark("A_Range", cam, look, 60f);
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                var d = Describe(scene);
                d["near_patch_distance_m"] = Math.Round((new Vector3(0.8f, 0.02f, 4f) - cam).magnitude, 2);
                d["far_patch_distance_m"] = Math.Round((new Vector3(1.5f, 0.02f, 40f) - cam).magnitude, 2);
                d["sun_forward"] = LightingUtil.V(sun.transform.forward);
                return d;
            });
        }
    }
}
