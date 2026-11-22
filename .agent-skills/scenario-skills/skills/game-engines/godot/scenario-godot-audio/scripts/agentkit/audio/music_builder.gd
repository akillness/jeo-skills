extends RefCounted
## scenario-godot-audio MusicBuilder (Godot 4.7.2): adaptive music as data.
##
## The AudioStreamInteractive transition matrix is a GUI editor; an agent builds the same resource
## from a Dictionary spec and saves it as .tres, then audits it. Spec:
## {
##   "clips": [{"name": "intro", "stream": "res://music/intro.ogg", "auto_advance": "next", "next": "explore"},
##             {"name": "explore", "stream": "res://music/explore.ogg"},
##             {"name": "win", "stream": "res://music/win.ogg", "auto_advance": "hold"}],
##   "initial": "intro",
##   "transitions": [{"from": "explore", "to": "combat", "from_time": "bar", "to_time": "start",
##                    "fade": "in", "beats": 1.0, "filler": "", "hold": true},
##                   {"from": "*", "to": "*", "from_time": "bar", "to_time": "start", "fade": "auto", "beats": 2.0}]
## }
## from/to "*" is CLIP_ANY. from_time: immediate|beat|bar|end. to_time: same|start|previous.
## fade: disabled|in|out|cross|auto. auto_advance: next|hold ("hold" = AUTO_ADVANCE_RETURN_TO_HOLD).

const FROM := {"immediate": AudioStreamInteractive.TRANSITION_FROM_TIME_IMMEDIATE,
	"beat": AudioStreamInteractive.TRANSITION_FROM_TIME_NEXT_BEAT,
	"bar": AudioStreamInteractive.TRANSITION_FROM_TIME_NEXT_BAR,
	"end": AudioStreamInteractive.TRANSITION_FROM_TIME_END}
const TO := {"same": AudioStreamInteractive.TRANSITION_TO_TIME_SAME_POSITION,
	"start": AudioStreamInteractive.TRANSITION_TO_TIME_START,
	"previous": AudioStreamInteractive.TRANSITION_TO_TIME_PREVIOUS_POSITION}
const FADE := {"disabled": AudioStreamInteractive.FADE_DISABLED, "in": AudioStreamInteractive.FADE_IN,
	"out": AudioStreamInteractive.FADE_OUT, "cross": AudioStreamInteractive.FADE_CROSS,
	"auto": AudioStreamInteractive.FADE_AUTOMATIC}


static func build_interactive(spec: Dictionary) -> AudioStreamInteractive:
	var s := AudioStreamInteractive.new()
	var clips: Array = spec.get("clips", [])
	s.clip_count = clips.size()                      # clips first, transitions after (class doc)
	var index := {}
	for i in clips.size():
		var c: Dictionary = clips[i]
		index[c["name"]] = i
		s.set_clip_name(i, StringName(c["name"]))
		var st = c.get("stream")
		s.set_clip_stream(i, load(st) if st is String else st)
	for i in clips.size():
		var c: Dictionary = clips[i]
		match str(c.get("auto_advance", "")):
			"next":
				s.set_clip_auto_advance(i, AudioStreamInteractive.AUTO_ADVANCE_ENABLED)
				s.set_clip_auto_advance_next_clip(i, int(index.get(c.get("next", ""), -1)))
			"hold":
				s.set_clip_auto_advance(i, AudioStreamInteractive.AUTO_ADVANCE_RETURN_TO_HOLD)
				if c.has("next"):
					s.set_clip_auto_advance_next_clip(i, int(index.get(c["next"], -1)))
	s.initial_clip = int(index.get(spec.get("initial", ""), 0))
	for t in spec.get("transitions", []):
		var f := -1 if t.get("from", "*") == "*" else int(index.get(t["from"], -2))
		var to := -1 if t.get("to", "*") == "*" else int(index.get(t["to"], -2))
		if f == -2 or to == -2:
			push_error("music spec: unknown clip in transition %s" % [t])
			continue
		var filler := str(t.get("filler", ""))
		s.add_transition(f, to, FROM[t.get("from_time", "bar")], TO[t.get("to_time", "start")],
			FADE[t.get("fade", "auto")], float(t.get("beats", 1.0)), filler != "",
			int(index.get(filler, -1)), bool(t.get("hold", false)))
	return s


## Which rule answers a switch from `a` to `b`: [from, to] of the matching cell, or [] if none.
## Lookup order assumed: exact, any-to-b, a-to-any, any-to-any (the live test P9 verifies exact
## cells and the any-to-any fallback; the middle order is not separately tested).
static func rule_for(s: AudioStreamInteractive, a: int, b: int) -> Array:
	for pair in [[a, b], [-1, b], [a, -1], [-1, -1]]:
		if s.has_transition(pair[0], pair[1]):
			return pair
	return []


## Audit: missing streams, clip pairs with no rule (only the pairs in `required`, a list of
## [from_name, to_name], or every ordered pair when empty), auto-advance clips that loop or have no
## next clip, beat or bar timing on clips with no BPM, fades with no BPM.
static func audit_interactive(s: AudioStreamInteractive, required: Array = []) -> Dictionary:
	var flags := []
	var names := []
	for i in s.clip_count:
		names.append(str(s.get_clip_name(i)))
	for i in s.clip_count:
		var st := s.get_clip_stream(i)
		if st == null:
			flags.append("clip %s has no stream" % names[i])
			continue
		var adv := s.get_clip_auto_advance(i)
		var loops: bool = st.get("loop") == true or (st is AudioStreamWAV and st.loop_mode != AudioStreamWAV.LOOP_DISABLED)
		if adv != AudioStreamInteractive.AUTO_ADVANCE_DISABLED and loops:
			flags.append("clip %s auto-advances but its stream loops (advance is ignored)" % names[i])
		if adv == AudioStreamInteractive.AUTO_ADVANCE_ENABLED and s.get_clip_auto_advance_next_clip(i) < 0:
			flags.append("clip %s auto-advances to no clip" % names[i])
		if st.has_method("get_bpm") or st.get("bpm") != null:
			if float(st.get("bpm")) <= 0.0:
				flags.append("clip %s has no BPM (beat, bar and fade timing need it)" % names[i])
			elif int(st.get("beat_count")) <= 0:
				flags.append("clip %s has BPM but beat_count 0 (clip length is then the stream length)" % names[i])
	var pairs := []
	if required.is_empty():
		for a in s.clip_count:
			for b in s.clip_count:
				if a != b:
					pairs.append([a, b])
	else:
		for p in required:
			pairs.append([names.find(p[0]), names.find(p[1])])
	var missing := []
	for p in pairs:
		if p[0] < 0 or p[1] < 0:
			flags.append("required pair %s names an unknown clip" % [p])
			continue
		if rule_for(s, p[0], p[1]).is_empty():
			missing.append("%s->%s" % [names[p[0]], names[p[1]]])
	if not missing.is_empty():
		flags.append("no transition rule (engine default: next beat, destination at full level, source fades out over about 1 beat; observed 4.7.2): " + ", ".join(missing))
	var tl := s.get_transition_list()
	var cells := []
	for k in range(0, tl.size(), 2):
		var f := tl[k]
		var t := tl[k + 1]
		cells.append({"from": "*" if f == -1 else names[f], "to": "*" if t == -1 else names[t],
			"from_time": s.get_transition_from_time(f, t), "to_time": s.get_transition_to_time(f, t),
			"fade": s.get_transition_fade_mode(f, t), "beats": s.get_transition_fade_beats(f, t),
			"filler": s.get_transition_filler_clip(f, t) if s.is_transition_using_filler_clip(f, t) else -1,
			"hold": s.is_transition_holding_previous(f, t)})
	return {"ok": flags.is_empty(), "flags": flags, "clips": names, "initial": s.initial_clip,
		"transitions": cells, "pairs_checked": pairs.size(), "missing": missing}


## Switch a playing player's interactive stream by clip name. Uses the playback object (the
## documented runtime path); the "parameters/switch_to_clip" property does the same from the Inspector.
static func switch_to(player: Node, clip: StringName) -> bool:
	var pb = player.get_stream_playback()
	if pb is AudioStreamPlaybackInteractive:
		pb.switch_to_clip_by_name(clip)
		return true
	push_error("switch_to: %s is not playing an AudioStreamInteractive" % player.name)
	return false
