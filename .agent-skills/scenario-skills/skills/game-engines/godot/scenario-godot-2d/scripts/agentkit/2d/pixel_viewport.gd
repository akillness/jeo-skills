extends Control
## scenario-godot-2d: pixel-perfect world with a smooth camera (Godot 4.7.2). The world renders in a SubViewport
## at the art resolution plus a 1 px margin on each side, its view on whole pixels. The sub-pixel
## remainder of the view moves the upscaled image instead, in screen pixels, so the art stays on its
## grid while the view glides (the approach Barry shows in DwVPFbDoyoc; measured here: background
## steps of 1 screen px instead of `scale_factor` px at 4x).
##
## The view is set through the SubViewport's canvas_transform every rendered frame, not with a
## Camera2D: with physics interpolation on, Godot forces Camera2D to the physics callback, so the
## camera moved at 60 Hz while the shift moved at 144 Hz and the image jumped by -5/+3 px (measured).
##
## Use with display/window/stretch/mode = "disabled" (this node does the scaling) or "canvas_items".
## Put the game world under `viewport`; UI goes outside, at full resolution.

@export var base_size := Vector2i(320, 180)
@export var scale_factor: int = 4
@export var smooth: bool = true               ## false = view snapped to whole art pixels (comparison)

var viewport: SubViewport
var container: SubViewportContainer
## World point at the centre of the view (art px, sub-pixel ok). Set it every frame, for example
## from the player's interpolated position or a follow camera's `focus`.
var target_position := Vector2.ZERO


func _ready() -> void:
	clip_contents = true
	custom_minimum_size = Vector2(base_size * scale_factor)
	size = custom_minimum_size
	container = SubViewportContainer.new()
	container.stretch = false
	container.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(container)
	viewport = SubViewport.new()
	viewport.size = base_size + Vector2i(2, 2)
	viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	viewport.snap_2d_transforms_to_pixel = true
	container.add_child(viewport)
	container.size = Vector2(viewport.size)
	container.scale = Vector2(scale_factor, scale_factor)
	_apply()


func _process(_delta: float) -> void:
	_apply()


func _apply() -> void:
	var snapped := target_position.floor()
	var frac := (target_position - snapped) if smooth else Vector2.ZERO
	# world point `snapped` lands on the centre of the margin-padded viewport
	viewport.canvas_transform = Transform2D(0.0, Vector2(base_size) * 0.5 + Vector2.ONE - snapped)
	container.position = (-Vector2.ONE - frac) * scale_factor


## Screen position (in this Control) of a world point: for UI markers over the world.
func world_to_screen(p: Vector2) -> Vector2:
	return (viewport.canvas_transform * p) * scale_factor + container.position
