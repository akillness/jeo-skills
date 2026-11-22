// Hit flash for sprites: mixes toward flash_color, keeps the texture alpha so the silhouette stays.
shader_type canvas_item;
uniform vec4 flash_color : source_color = vec4(1.0);
uniform float flash : hint_range(0.0, 1.0) = 0.0;
void fragment() {
	// COLOR already holds texture * modulate in fragment(); texture(TEXTURE, UV) * COLOR squares it.
	vec4 c = COLOR;
	COLOR = vec4(mix(c.rgb, flash_color.rgb, flash), c.a);
}
