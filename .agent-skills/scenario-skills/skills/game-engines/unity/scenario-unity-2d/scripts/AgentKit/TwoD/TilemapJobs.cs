// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Tilemaps from code: a Rule Tile authored by
// script, a level painted from a text map, merged static collision, and read-back checks.
//
// Rule Tile semantics (2D Tilemap Extras 6.0 docs, RuleTile.cs 6.0.2): rules run top to bottom and
// the first match wins, so order them by frequency; neighbour codes 1 = This, 2 = NotThis, 0 =
// ignore; m_Neighbors is aligned with m_NeighborPositions. Reskins: Rule Override Tile, not copies.
// The Tile Palette brush is a mouse tool: agents paint with Tilemap.SetTile/SetTiles/BoxFill.
// Collision (2D e-book p. 91 to 92): Tilemap Collider 2D with Composite Operation Merge into a
// Composite Collider 2D (Outlines for smooth terrain), auto-added Rigidbody 2D set to Static; keep
// per-tile colliders instead when tiles change at runtime.
//
// Jobs:
//   AgentKit.TwoD.TilemapJobs.CreateRuleTile  args: sheet (texture sliced tile_m00..tile_m15), out (asset),
//        prefix ("tile_m"), collider ("Grid")      -> cardinal 16-rule tile (N=1 E=2 S=4 W=8)
//   AgentKit.TwoD.TilemapJobs.BuildLevel      args: scene, rows [text, top line first], rule_tile, wall_tile
//        sheet or sprite, sorting {bg, ground}, drop_test (true)
//   AgentKit.TwoD.TilemapJobs.CreateRuleOverrideTile  args: source (rule tile), sheet (reskin texture with the
//        SAME sprite names), out, prefix ("tile_m")  -> reskin that shares the source's rules, verified by painting
//        test shapes in an unsaved scene and reading every cell back
//   AgentKit.TwoD.TilemapJobs.ColliderShapes  args: rows, sheet, prefix, irregular (sprite with a concave
//        outline) -> Tilemap Collider 2D shape counts with Use Delaunay Mesh off/on for Grid, Sprite (square) and
//        Sprite (irregular outline) collider tiles, per-tile vs merged (unsaved scene)
// Rule Tile vs Rule Override Tile vs Rule Tile Template vs AutoTile (Tilemap Extras 6.0 docs; 6.0.2 source):
//   reskin that must follow later rule edits -> Rule Override Tile (m_Tile + sprite pairs, no rules of its own);
//   same layout, independent rule set -> Rule Tile Template (More menu > Create Rule Tile Template; editor
//   RuleTileTemplate.ApplyTemplateToRuleTile); a sheet drawn to AutoTile's Mask_2x2 (16) or Mask_3x3 (48) floor
//   layouts -> AutoTile (6.1+), but its masks are painted in the Inspector: no public API (AutoTile.AddSprite
//   is internal in 6.0.2), so an agent authors Rule Tiles by script and leaves AutoTile masks to a human.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d/test_live_2d.py (P4, P4c).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace AgentKit.TwoD
{
    public static class TilemapJobs
    {
        const int N = 1, E = 2, S = 4, W = 8;
        static readonly Vector3Int[] k_Card = { new Vector3Int(0, 1, 0), new Vector3Int(1, 0, 0), new Vector3Int(0, -1, 0), new Vector3Int(-1, 0, 0) };

        public static void CreateRuleTile()
        {
            AgentJob.Run(() =>
            {
                var sheet = AgentJob.Str("sheet", "Assets/Art/Pixel/tiles_ground.png");
                var outp = AgentJob.Str("out", "Assets/Tiles/GroundRule.asset");
                var prefix = AgentJob.Str("prefix", "tile_m");
                var colliderType = AgentJob.Str("collider", "Grid") == "Sprite" ? Tile.ColliderType.Sprite : Tile.ColliderType.Grid;
                TwoDUtil.EnsureFolder(Path.GetDirectoryName(outp));
                var rt = AssetDatabase.LoadAssetAtPath<RuleTile>(outp);
                bool created = rt == null;
                if (created) rt = ScriptableObject.CreateInstance<RuleTile>();
                rt.m_DefaultSprite = TwoDUtil.Sprite(sheet, prefix + "15");     // interior
                rt.m_DefaultColliderType = colliderType;
                rt.m_TilingRules = new List<RuleTile.TilingRule>();
                // Frequency order for platformer ground [added]: interior, top surface, walls, then the rest.
                int[] order = { 15, 14, 11, 13, 7, 12, 6, 10, 5, 9, 3, 8, 2, 4, 1, 0 };
                int id = 0;
                foreach (int m in order)
                {
                    var rule = new RuleTile.TilingRule
                    {
                        m_Id = id++,
                        m_Sprites = new[] { TwoDUtil.Sprite(sheet, prefix + m.ToString("00")) },
                        m_Output = RuleTile.TilingRuleOutput.OutputSprite.Single,
                        m_ColliderType = colliderType,
                        m_RuleTransform = RuleTile.TilingRuleOutput.Transform.Fixed,   // grass must stay on top: no Rotated
                        m_NeighborPositions = k_Card.ToList(),
                        m_Neighbors = new List<int>
                        {
                            (m & N) != 0 ? RuleTile.TilingRuleOutput.Neighbor.This : RuleTile.TilingRuleOutput.Neighbor.NotThis,
                            (m & E) != 0 ? RuleTile.TilingRuleOutput.Neighbor.This : RuleTile.TilingRuleOutput.Neighbor.NotThis,
                            (m & S) != 0 ? RuleTile.TilingRuleOutput.Neighbor.This : RuleTile.TilingRuleOutput.Neighbor.NotThis,
                            (m & W) != 0 ? RuleTile.TilingRuleOutput.Neighbor.This : RuleTile.TilingRuleOutput.Neighbor.NotThis,
                        },
                    };
                    rt.m_TilingRules.Add(rule);
                }
                if (created) AssetDatabase.CreateAsset(rt, outp);
                EditorUtility.SetDirty(rt);
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "asset", outp }, { "created", created }, { "rules", rt.m_TilingRules.Count },
                    { "first_rules", rt.m_TilingRules.Take(3).Select(r => r.m_Sprites[0].name).ToList() },
                    { "default_sprite", rt.m_DefaultSprite.name }, { "collider", rt.m_DefaultColliderType.ToString() },
                };
            });
        }

        public static void BuildLevel()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene", "Assets/Scenes/Level2D.unity");
                var rows = TwoDUtil.ListOr("rows").Select(x => x.ToString()).ToList();
                if (rows.Count == 0) throw new ArgumentException("rows (text map, top line first) required");
                var rule = AssetDatabase.LoadAssetAtPath<RuleTile>(AgentJob.Str("rule_tile", "Assets/Tiles/GroundRule.asset"))
                           ?? throw new InvalidOperationException("rule tile missing: run CreateRuleTile first");
                var wallSprite = TwoDUtil.Sprite(AgentJob.Str("wall_sprite", "Assets/Art/Pixel/tile_wall.png"));
                var wallTilePath = AgentJob.Str("wall_tile", "Assets/Tiles/Wall.asset");
                var wall = AssetDatabase.LoadAssetAtPath<Tile>(wallTilePath);
                if (wall == null)
                {
                    wall = ScriptableObject.CreateInstance<Tile>();
                    wall.sprite = wallSprite;
                    wall.colliderType = Tile.ColliderType.None;
                    AssetDatabase.CreateAsset(wall, wallTilePath);
                }
                var scene = TwoDUtil.OpenOrCreateScene(scenePath, AgentJob.Bool("fresh", false));

                var grid = TwoDUtil.GetOrCreate("Grid");
                var g = TwoDUtil.GetOrAdd<Grid>(grid.gameObject);
                g.cellSize = new Vector3(1, 1, 0);                  // one tile = one unit (PPU = tile px)
                var bg = Layer(grid.transform, "BG", AgentJob.Str("bg_layer", "Background"), 0);
                var ground = Layer(grid.transform, "Ground", AgentJob.Str("ground_layer", "Ground"), 0);
                bg.ClearAllTiles();
                ground.ClearAllTiles();

                int H = rows.Count, Wd = rows.Max(r => r.Length);
                var cells = new List<Vector3Int>();
                var markers = new Dictionary<string, List<Vector3>>();
                for (int r = 0; r < H; r++)
                    for (int x = 0; x < rows[r].Length; x++)
                    {
                        int y = H - 1 - r;
                        char ch = rows[r][x];
                        if (ch == '#') cells.Add(new Vector3Int(x, y, 0));
                        else if (ch != 'B' && ch != '.' && ch != ' ')
                        {
                            var k = ch.ToString();
                            if (!markers.TryGetValue(k, out var l)) markers[k] = l = new List<Vector3>();
                            l.Add(new Vector3(x + 0.5f, y, 0));      // bottom-centre of the cell
                        }
                    }
                // one call, not one per cell: SetTiles refreshes neighbours once
                ground.SetTiles(cells.ToArray(), Enumerable.Repeat((TileBase)rule, cells.Count).ToArray());
                bg.SetTilesBlock(new BoundsInt(0, 0, 0, Wd, H, 1), Enumerable.Repeat((TileBase)wall, Wd * H).ToArray());
                bg.color = new Color(0.55f, 0.55f, 0.65f, 1f);      // push the back wall back [added]

                // collision: per-tile shapes merged into one static outline
                var tc = TwoDUtil.GetOrAdd<TilemapCollider2D>(ground.gameObject);
                tc.useDelaunayMesh = true;
                tc.compositeOperation = Collider2D.CompositeOperation.Merge;
                var rb = TwoDUtil.GetOrAdd<Rigidbody2D>(ground.gameObject);
                rb.bodyType = RigidbodyType2D.Static;
                var comp = TwoDUtil.GetOrAdd<CompositeCollider2D>(ground.gameObject);
                comp.geometryType = CompositeCollider2D.GeometryType.Outlines;
                comp.generationType = CompositeCollider2D.GenerationType.Synchronous;
                if (LayerMask.NameToLayer("Ground") >= 0) ground.gameObject.layer = LayerMask.NameToLayer("Ground");
                tc.ProcessTilemapChanges();
                comp.GenerateGeometry();

                // verify every painted cell resolved to the sprite its neighbours call for
                int mismatches = 0;
                var samples = new List<object>();
                foreach (var c in cells)
                {
                    int m = 0;
                    for (int i = 0; i < 4; i++) if (cells.Contains(c + k_Card[i])) m |= 1 << i;
                    var got = ground.GetSprite(c);
                    var want = "tile_m" + m.ToString("00");
                    if (got == null || got.name != want) { mismatches++; if (samples.Count < 5) samples.Add(c + " got " + (got ? got.name : "null") + " want " + want); }
                }

                // physics check: drop a dynamic circle on the first ground column and simulate in Script mode
                Dictionary<string, object> drop = null;
                if (AgentJob.Bool("drop_test", true))
                    drop = DropTest(ground, cells);

                var markersOut = markers.ToDictionary(kv => kv.Key, kv => (object)kv.Value.Select(v => new[] { v.x, v.y }).ToList());
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                return new Dictionary<string, object>
                {
                    { "scene", scenePath }, { "size", new[] { Wd, H } }, { "ground_cells", cells.Count },
                    { "rule_mismatches", mismatches }, { "mismatch_samples", samples },
                    { "composite_paths", comp.pathCount }, { "composite_points", comp.pointCount }, { "composite_shapes", comp.shapeCount },
                    { "ground_layer", LayerMask.LayerToName(ground.gameObject.layer) }, { "body", rb.bodyType.ToString() },
                    { "bg_cells", CountTiles(bg) }, { "markers", markersOut }, { "drop_test", drop },
                    { "sample_sprites", new Dictionary<string, object> {
                        { "top_left_of_ground", ground.GetSprite(new Vector3Int(0, H - 1 - 9, 0))?.name },
                        { "pit_edge", ground.GetSprite(new Vector3Int(6, H - 1 - 9, 0))?.name },
                        { "interior", ground.GetSprite(new Vector3Int(3, 1, 0))?.name } } },
                };
            });
        }

        public static void CreateRuleOverrideTile()
        {
            AgentJob.Run(() =>
            {
                var srcPath = AgentJob.Str("source", "Assets/Tiles/GroundRule.asset");
                var source = AssetDatabase.LoadAssetAtPath<RuleTile>(srcPath) ?? throw new InvalidOperationException("source rule tile missing: " + srcPath);
                var sheet = AgentJob.Str("sheet");
                var outp = AgentJob.Str("out", "Assets/Tiles/GroundRule_Reskin.asset");
                var prefix = AgentJob.Str("prefix", "tile_m");
                var newSprites = TwoDUtil.Sprites(sheet).ToDictionary(x => x.name, x => x);
                TwoDUtil.EnsureFolder(Path.GetDirectoryName(outp));
                var rot = AssetDatabase.LoadAssetAtPath<RuleOverrideTile>(outp);
                if (rot == null)
                {
                    rot = ScriptableObject.CreateInstance<RuleOverrideTile>();
                    AssetDatabase.CreateAsset(rot, outp);      // first: the instance tile becomes a sub-asset of it
                }
                rot.m_Tile = source;
                var originals = new List<Sprite> { source.m_DefaultSprite };
                originals.AddRange(source.m_TilingRules.SelectMany(r => r.m_Sprites));
                var pairs = new List<KeyValuePair<Sprite, Sprite>>();
                var missing = new List<string>();
                foreach (var o in originals.Where(x => x != null).Distinct())
                {
                    if (newSprites.TryGetValue(o.name, out var n)) pairs.Add(new KeyValuePair<Sprite, Sprite>(o, n));
                    else missing.Add(o.name);
                }
                rot.m_Sprites.Clear();
                rot.ApplyOverrides(pairs);
                rot.Override();
                EditorUtility.SetDirty(rot);
                AssetDatabase.SaveAssets();
                string sharesRulesOf = rot.m_Tile != null ? rot.m_Tile.name : null;
                int instanceRules = rot.m_InstanceTile != null ? rot.m_InstanceTile.m_TilingRules.Count : 0;

                // verify in an unsaved scene: paint test shapes with the override and read every cell back
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var grid = new GameObject("Grid").AddComponent<Grid>();
                var tm = new GameObject("Probe").AddComponent<Tilemap>();
                tm.transform.SetParent(grid.transform, false);
                tm.gameObject.AddComponent<TilemapRenderer>();
                var shape = new[] { "###..#...#", "###..#....", "###..###..", "........##" };
                var cells = new List<Vector3Int>();
                for (int r = 0; r < shape.Length; r++)
                    for (int x = 0; x < shape[r].Length; x++)
                        if (shape[r][x] == '#') cells.Add(new Vector3Int(x, shape.Length - 1 - r, 0));
                tm.SetTiles(cells.ToArray(), Enumerable.Repeat((TileBase)rot, cells.Count).ToArray());
                int mismatches = 0, fromSheet = 0;
                var samples = new List<object>();
                foreach (var c in cells)
                {
                    int m = 0;
                    for (int i = 0; i < 4; i++) if (cells.Contains(c + k_Card[i])) m |= 1 << i;
                    var got = tm.GetSprite(c);
                    var want = prefix + m.ToString("00");
                    if (got != null && AssetDatabase.GetAssetPath(got) == sheet) fromSheet++;
                    if (got == null || got.name != want || AssetDatabase.GetAssetPath(got) != sheet)
                    {
                        mismatches++;
                        if (samples.Count < 5) samples.Add(c + " got " + (got ? got.name + " @" + AssetDatabase.GetAssetPath(got) : "null") + " want " + want);
                    }
                }
                return new Dictionary<string, object>
                {
                    { "asset", outp }, { "source", srcPath }, { "shares_rules_of", sharesRulesOf }, { "instance_rules_copied_from_source", instanceRules },
                    { "overrides", pairs.Count }, { "missing_names", missing },
                    { "probe_cells", cells.Count }, { "cells_from_reskin_sheet", fromSheet }, { "mismatches", mismatches }, { "mismatch_samples", samples },
                };
            });
        }

        public static void ColliderShapes()
        {
            AgentJob.Run(() =>
            {
                var rows = TwoDUtil.ListOr("rows").Select(x => x.ToString()).ToList();
                if (rows.Count == 0) throw new ArgumentException("rows required");
                var sheet = AgentJob.Str("sheet", "Assets/Art/Pixel/tiles_ground.png");
                var prefix = AgentJob.Str("prefix", "tile_m");
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);   // never saved
                var grid = new GameObject("Grid").AddComponent<Grid>();
                int H = rows.Count;
                var cells = new List<Vector3Int>();
                for (int r = 0; r < H; r++)
                    for (int x = 0; x < rows[r].Length; x++)
                        if (rows[r][x] == '#') cells.Add(new Vector3Int(x, H - 1 - r, 0));
                var results = new List<object>();
                var prev = Physics2D.simulationMode;
                Physics2D.simulationMode = SimulationMode2D.Script;
                try
                {
                    var irregular = AgentJob.Str("irregular", "Assets/Art/Pixel/spikes.png");
                    foreach (var kind in new[] { "Grid", "Sprite", "SpriteIrregular" })
                    {
                        var colliderType = kind == "Grid" ? Tile.ColliderType.Grid : Tile.ColliderType.Sprite;
                        // one plain Tile per mask (in memory), painted where the rule tile would put that sprite;
                        // SpriteIrregular paints a sprite with a concave outline (its physics shape is decomposed)
                        var tiles = new Dictionary<int, Tile>();
                        for (int m = 0; m < 16; m++)
                        {
                            var t = ScriptableObject.CreateInstance<Tile>();
                            t.sprite = kind == "SpriteIrregular" ? TwoDUtil.Sprite(irregular) : TwoDUtil.Sprite(sheet, prefix + m.ToString("00"));
                            t.colliderType = colliderType;
                            tiles[m] = t;
                        }
                        foreach (var delaunay in new[] { false, true })
                        {
                            var go = new GameObject("Ground_" + kind + (delaunay ? "_delaunay" : ""));
                            go.transform.SetParent(grid.transform, false);
                            var tm = go.AddComponent<Tilemap>();
                            foreach (var c in cells)
                            {
                                int m = 0;
                                for (int i = 0; i < 4; i++) if (cells.Contains(c + k_Card[i])) m |= 1 << i;
                                tm.SetTile(c, tiles[m]);
                            }
                            var tc = go.AddComponent<TilemapCollider2D>();
                            tc.useDelaunayMesh = delaunay;
                            tc.compositeOperation = Collider2D.CompositeOperation.None;
                            tc.ProcessTilemapChanges();
                            int perTile = tc.shapeCount;
                            var rb = go.AddComponent<Rigidbody2D>();
                            rb.bodyType = RigidbodyType2D.Static;
                            var comp = go.AddComponent<CompositeCollider2D>();
                            comp.geometryType = CompositeCollider2D.GeometryType.Outlines;
                            comp.generationType = CompositeCollider2D.GenerationType.Synchronous;
                            tc.compositeOperation = Collider2D.CompositeOperation.Merge;
                            tc.ProcessTilemapChanges();
                            comp.GenerateGeometry();
                            results.Add(new Dictionary<string, object>
                            {
                                { "collider_type", kind }, { "use_delaunay_mesh", delaunay },
                                { "per_tile_shapes", perTile }, { "merged_paths", comp.pathCount }, { "merged_points", comp.pointCount },
                                { "merged_shapes", comp.shapeCount },
                            });
                            go.SetActive(false);
                        }
                    }
                }
                finally { Physics2D.simulationMode = prev; }
                return new Dictionary<string, object> { { "cells", cells.Count }, { "variants", results } };
            });
        }

        static Tilemap Layer(Transform grid, string name, string sortingLayer, int order)
        {
            var go = TwoDUtil.GetOrCreate(name, grid);
            var tm = TwoDUtil.GetOrAdd<Tilemap>(go);
            var r = TwoDUtil.GetOrAdd<TilemapRenderer>(go);
            if (SortingLayer.NameToID(sortingLayer) != 0 || sortingLayer == "Default") r.sortingLayerName = sortingLayer;
            r.sortingOrder = order;
            r.mode = TilemapRenderer.Mode.Chunk;
            return tm;
        }

        static int CountTiles(Tilemap tm)
        {
            int n = 0;
            foreach (var p in tm.cellBounds.allPositionsWithin) if (tm.HasTile(p)) n++;
            return n;
        }

        /// <summary>Drop a r=0.25 dynamic circle above a ground cell, step Physics2D.Simulate(0.02) in
        /// Script mode (deterministic, restored afterwards) and report where it rests.</summary>
        public static Dictionary<string, object> DropTest(Tilemap ground, List<Vector3Int> cells)
        {
            var top = cells.Where(c => c.x == 2).OrderByDescending(c => c.y).First();
            float surface = top.y + 1f;
            var go = new GameObject("AgentDropProbe");
            go.transform.position = new Vector3(top.x + 0.5f, surface + 3f, 0);
            var body = go.AddComponent<Rigidbody2D>();
            var circle = go.AddComponent<CircleCollider2D>();
            circle.radius = 0.25f;
            var prev = Physics2D.simulationMode;
            try
            {
                Physics2D.simulationMode = SimulationMode2D.Script;
                Physics2D.SyncTransforms();
                for (int i = 0; i < 150; i++) Physics2D.Simulate(0.02f);
                float y = body.position.y;
                return new Dictionary<string, object>
                {
                    { "surface_y", surface }, { "rest_y", Math.Round(y, 4) }, { "expected_y", surface + 0.25f },
                    { "error", Math.Round(y - (surface + 0.25f), 4) }, { "sleeping", body.IsSleeping() }, { "steps", 150 },
                };
            }
            finally
            {
                Physics2D.simulationMode = prev;
                UnityEngine.Object.DestroyImmediate(go);
            }
        }
    }
}
