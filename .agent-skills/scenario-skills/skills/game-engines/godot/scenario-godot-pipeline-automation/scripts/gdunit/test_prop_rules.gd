# gdUnit4 suite (scenario-godot-pipeline-automation 0.1, gdUnit4 6.2.1, Godot 4.7.2): pure-function tests of the
# naming and accept/warn/reject rules. Copy to res://test/pipeline/ and run with gd_pipeline.run_gdunit4.
extends GdUnitTestSuite

const Rules = preload("res://addons/agentkit/pipeline/prop_rules.gd")


func test_normalize_name(stem: String, expected: String, test_parameters := [
		["SM_Barrel05_v2 (copy)", "barrel_05"],
		["crate-01", "crate_01"],
		["Crate_01", "crate_01"],
		["LampStreet3_final", "lamp_street_03"],
		["Bärrel spécial 02", "barrel_special_02"],
		["geo_rock_big_LOD0", "rock_big"],
		["SignWood", "sign_wood"],
	]) -> void:
	assert_str(Rules.normalize_name(stem)).is_equal(expected)


func test_id_rule() -> void:
	assert_bool(Rules.id_valid("barrel_05")).is_true()
	assert_bool(Rules.id_valid("side_table_astra")).is_true()
	assert_bool(Rules.id_valid("Barrel_05")).is_false()
	assert_bool(Rules.id_valid("barrel")).is_false()
	assert_str(Rules.prop_id("barrel", "barrel_05")).is_equal("barrel_05")
	assert_str(Rules.prop_id("toy", "robot_astra")).is_equal("toy_robot_astra")


func _info(h: float, tris := 1000, mats := 1, y0 := 0.0) -> Dictionary:
	return {"valid": true, "triangles": tris, "materials": mats, "images": [], "unsupported_used": [], "animations": 0,
			"max_texture": 0, "aabb": {"position": [-0.25, y0, -0.25], "size": [0.5, h, 0.5]}}


func test_centimetre_file_gets_unit_scale() -> void:
	var d := Rules.decide(_info(100.0), {"category": "barrel", "height_m": 1.0}, Rules.default_budgets())
	assert_float(d.fixes.unit_scale).is_equal(0.01)
	assert_str(d.status).is_equal("accept")


func test_ai_asset_fitted_to_manifest_height() -> void:
	var d := Rules.decide(_info(0.012), {"category": "toy", "height_m": 0.45, "source": "ai_image_to_3d"}, Rules.default_budgets())
	assert_float(d.fixes.fit_height).is_equal(0.45)
	assert_str(d.status).is_equal("warn")


func test_ai_asset_without_height_rejected() -> void:
	var d := Rules.decide(_info(0.012), {"category": "toy", "source": "ai_image_to_3d"}, Rules.default_budgets())
	assert_str(d.status).is_equal("reject")


func test_triangles_over_3x_budget_rejected() -> void:
	var d := Rules.decide(_info(0.6, 120000), {"category": "rock", "height_m": 0.6}, Rules.default_budgets())
	assert_str(d.status).is_equal("reject")
	assert_str(str(d.reasons[0])).contains("3x budget")


func test_centre_pivot_flagged_for_fix() -> void:
	var d := Rules.decide(_info(1.0, 1000, 1, -0.5), {"category": "barrel", "height_m": 1.0}, Rules.default_budgets())
	assert_bool(d.fixes.fix_pivot).is_true()


func test_invalid_probe_rejected() -> void:
	var d := Rules.decide({"valid": false, "error": "truncated"}, {}, Rules.default_budgets())
	assert_str(d.status).is_equal("reject")
