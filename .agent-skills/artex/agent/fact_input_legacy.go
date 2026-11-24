package agent

// Texts of the earlier record_fact contract (fact fields at the top level
// beside facts[]), kept verbatim so the server's one-time refresh
// (server/fact_input_schema.go) can tell a stored default from an operator
// edit. Nothing here is published to a model.

// recordFactLegacyDescription is the record_fact description seeded up to the
// facts-only contract.
const recordFactLegacyDescription = "Write an exploration [fact/conclusion] into the exploration graph, linked to the intent that produced it (intent_id). Used to record exploration results — both [positive conclusions] like fingerprinting/enumeration, and [negative conclusions] like 'port closed'/'parameter not injectable'/'no login entry found'.\n" +
	"⚠️Multiple observations from one exploration must be [consolidated into ONE fact], not split into many; whenever they can be merged into one fact, use one: summary = a one-sentence summary of this conclusion, detail = the related details (may contain multiple concrete items). Example: a fingerprinting intent → one fact {summary:'identified the tech stack and response characteristics of site X', detail:'nginx 1.25 / Vue3 / 200 / title=.. / body_len=..'}, rather than one fact each for status code, fingerprint, and title. One intent usually produces exactly one fact; splitting too finely bloats the graph endlessly.\n" +
	"★The facts array writes several [mutually distinct] conclusions at once (each may omit intent_id, defaulting to the top-level intent_id). Returns an ids array, same length and order as facts.\n" +
	"⚠️Write only conclusions you [actually saw] in tool output — don't extrapolate. evidence and confidence keep inaccurate conclusions from polluting the graph:\n" +
	"  · evidence = [one line] of key evidence supporting this conclusion (the command + the one or two most proving output lines), **keep it brief** — details belong in detail; don't paste large output blocks here.\n" +
	"  · confidence = observed (seen directly in output) | inferred (inferred from phenomena).\n" +
	"  · source = where the content came from: target_response (content the target itself returned: page bodies, headers, error messages, banners, even when a tool fetched it) | tool_output (a tool's own result about the target: port states, scanner verdicts, status codes, timings) | third_party_intel (OSINT, CVE databases, public reports) | operator_input (given by the human operator) | inference (your own reasoning; the default when omitted). Any other value is refused.\n" +
	"  · **Negative conclusions** (not injectable / port closed / no entry found, etc.) state only \"observation + tentative reading\" — state what you actually saw; whether to abandon the direction is for the planner to decide globally; always provide evidence, mark inferred when the means weren't exhausted or the evidence is weak (including probed only once, looks-like), and mark observed only when truly exhausted and directly seen."

// recordFactReleasedDescription is the record_fact description seeded by the
// releases v0.4.0 to v0.6.0 (agent/tools.go at those tags): the text above
// without the source bullet.
const recordFactReleasedDescription = "Write an exploration [fact/conclusion] into the exploration graph, linked to the intent that produced it (intent_id). Used to record exploration results — both [positive conclusions] like fingerprinting/enumeration, and [negative conclusions] like 'port closed'/'parameter not injectable'/'no login entry found'.\n" +
	"⚠️Multiple observations from one exploration must be [consolidated into ONE fact], not split into many; whenever they can be merged into one fact, use one: summary = a one-sentence summary of this conclusion, detail = the related details (may contain multiple concrete items). Example: a fingerprinting intent → one fact {summary:'identified the tech stack and response characteristics of site X', detail:'nginx 1.25 / Vue3 / 200 / title=.. / body_len=..'}, rather than one fact each for status code, fingerprint, and title. One intent usually produces exactly one fact; splitting too finely bloats the graph endlessly.\n" +
	"★The facts array writes several [mutually distinct] conclusions at once (each may omit intent_id, defaulting to the top-level intent_id). Returns an ids array, same length and order as facts.\n" +
	"⚠️Write only conclusions you [actually saw] in tool output — don't extrapolate. evidence and confidence keep inaccurate conclusions from polluting the graph:\n" +
	"  · evidence = [one line] of key evidence supporting this conclusion (the command + the one or two most proving output lines), **keep it brief** — details belong in detail; don't paste large output blocks here.\n" +
	"  · confidence = observed (seen directly in output) | inferred (inferred from phenomena).\n" +
	"  · **Negative conclusions** (not injectable / port closed / no entry found, etc.) state only \"observation + tentative reading\" — state what you actually saw; whether to abandon the direction is for the planner to decide globally; always provide evidence, mark inferred when the means weren't exhausted or the evidence is weak (including probed only once, looks-like), and mark observed only when truly exhausted and directly seen."

// recordFactLegacyItemDescriptions are the facts[] item descriptions of the
// earlier contract whose wording referred to the top level; the refresh
// replaces exactly these texts with the current ones.
var recordFactLegacyItemDescriptions = map[string]string{
	"summary":   "Required on every fact: a non-empty one-sentence summary of this conclusion. Batch items do not inherit summary from the top level.",
	"intent_id": "The intent that produced this fact; only this field inherits from the top level in a batch.",
}

// recordFactLegacyFactsDescription is the facts property description of the
// earlier contract.
const recordFactLegacyFactsDescription = "A non-empty batch of complete facts. Every item needs its own summary. Only intent_id inherits from the top level. Returned ids match item order; retry only failed indices."

// recordFactReleasedFactsDescription is the facts property description seeded
// by the releases v0.4.0 to v0.6.0. RepairRecordFactSchema keeps a stored facts
// description, so the refresh has to know this text to replace it.
const recordFactReleasedFactsDescription = "[use when there are several distinct conclusions] array of facts; element fields same as the top-level fields below (summary/detail/evidence/confidence/intent_id/asset_ids); omitting intent_id falls back to the top-level intent_id. The returned ids match this array in length and order."

// RecordFactLegacyDescriptions returns the description texts of the earlier
// contract that the refresh may replace: the tool descriptions, the facts
// property descriptions and the item descriptions.
func RecordFactLegacyDescriptions() (tool, facts []string, items map[string]string) {
	return []string{recordFactLegacyDescription, recordFactReleasedDescription},
		[]string{recordFactLegacyFactsDescription, recordFactReleasedFactsDescription},
		recordFactLegacyItemDescriptions
}
