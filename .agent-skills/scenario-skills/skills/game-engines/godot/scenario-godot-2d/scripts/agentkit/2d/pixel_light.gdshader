shader_type canvas_item;
// scenario-godot-2d: pixel-snapped 2D lighting for canvas_items stretch (Godot 4.7.2). Lights and shadows are
// evaluated per screen pixel; snapping LIGHT_VERTEX and SHADOW_VERTEX to the art pixel size makes
// the falloff and shadow edges step in art pixels, like the viewport stretch mode does for free.
// Set `px` to the integer stretch factor (screen pixels per art pixel).

uniform float px : hint_range(1.0, 16.0, 1.0) = 4.0;

void fragment() {
	LIGHT_VERTEX.xy = floor(LIGHT_VERTEX.xy / px) * px + vec2(px * 0.5);
	SHADOW_VERTEX = floor(SHADOW_VERTEX / px) * px + vec2(px * 0.5);
}
