# gdUnit4 suite: every imported prop in res://props/props_manifest.json passes prop_audit.check_prop().
# One test, all props, so a 200-prop library is one fast case; failures list each prop and problem.
extends GdUnitTestSuite

const Audit = preload("res://addons/agentkit/pipeline/prop_audit.gd")


func test_every_imported_prop_passes_the_audit() -> void:
	var entries := Audit.imported_entries(Audit.load_manifest())
	assert_int(entries.size()).is_greater(0)
	var failures: Array = []
	for e in entries:
		for p in Audit.check_prop(e):
			failures.append("%s: %s" % [e.id, p])
	assert_array(failures).is_empty()
