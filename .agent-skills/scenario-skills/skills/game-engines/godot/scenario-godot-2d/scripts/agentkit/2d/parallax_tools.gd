extends RefCounted
## scenario-godot-2d: Parallax2D layers from code (Godot 4.7.2; Parallax2D replaced ParallaxBackground and
## ParallaxLayer in 4.3). One Parallax2D per depth plane, a Sprite2D child with its top-left at the
## origin, repeat_size = the texture width so the plane tiles horizontally. Planes are ordinary
## Node2Ds in the world (no CanvasLayer); draw order follows tree order or z_index.
##
##   scroll_scale  0 = fixed to the screen (sky), 1 = moves with the world, < 1 = farther away
##   repeat_times  extra copies each side; raise it when the camera zooms out (measured: zoom 0.5 needed 3,
##                 zoom 0.25 needed 5; see repeat_times_for)
##   autoscroll    px/s drift (clouds); seams stay closed when repeat_size equals the texture width


static func make_layer(tex: Texture2D, scroll_scale: Vector2, y: float = 0.0, repeat_x: bool = true,
		repeat_times: int = 1, autoscroll: Vector2 = Vector2.ZERO) -> Parallax2D:
	var p := Parallax2D.new()
	p.scroll_scale = scroll_scale
	p.autoscroll = autoscroll
	p.repeat_times = repeat_times
	if repeat_x:
		p.repeat_size = Vector2(tex.get_width(), 0)
	var s := Sprite2D.new()
	s.texture = tex
	s.centered = false
	s.position = Vector2(0, y)
	p.add_child(s)
	return p


## Repeat copies that left no gap in 4.7.2 (measured, plane as wide as the view): zoom 1 -> 1 was
## enough, 0.5 -> 3, 0.25 -> 5. This returns ceil(visible width / plane width) + 1, which covers
## those cases with one spare at zoom 1.
static func repeat_times_for(view_width: float, zoom: float, w: float) -> int:
	return int(ceil(view_width / zoom / w)) + 1
