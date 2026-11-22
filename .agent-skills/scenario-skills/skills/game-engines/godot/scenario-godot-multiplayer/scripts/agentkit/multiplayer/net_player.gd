extends CharacterBody3D
## NetPlayer (scenario-godot-multiplayer 0.1): a networked body for the NetLab sessions.
##
## Node name = peer id (str), set by the server before add_child, replicated by the spawner.
## auth "server" (default): the body and StateSync stay with the server (authority 1); only the child
##   Input node (and its InputSync) belongs to the owning peer, so a client sends input, never position.
## auth "client": the whole player belongs to its peer (responsive, trivially cheatable).
## Authority is set in _enter_tree, from the name, on every peer, before _ready runs anywhere.

const SPEED := 3.0
const MAX_STEP := 1.0  ## largest teleport the server accepts (m)

## Shared by every player in this process; NetLab sets it from the session config.
static var auth_mode := "server"

@export var peer_id := 0  ## spawn-only property: replicated once with the spawn
var peer_id_at_enter := -1
var name_at_enter := ""

@onready var input_node: Node = $Input


func _enter_tree() -> void:
	peer_id_at_enter = peer_id
	name_at_enter = str(name)
	var id := str(name).to_int()
	if auth_mode == "client":
		set_multiplayer_authority(id)            # recursive: StateSync and Input follow
	else:
		$Input.set_multiplayer_authority(id)     # body and StateSync stay with the server


func _ready() -> void:
	motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
	var mesh := get_node_or_null("Mesh") as MeshInstance3D
	if mesh:
		var mat := StandardMaterial3D.new()
		var hue := fmod(float(str(name).to_int() % 997) / 997.0 * 7.0, 1.0)
		mat.albedo_color = Color.from_hsv(hue, 0.75, 0.95)
		mesh.material_override = mat
	# Input travels to the server only: other clients do not need it (bandwidth, and less to sniff).
	var isync := get_node_or_null("Input/InputSync") as MultiplayerSynchronizer
	if isync and auth_mode == "server" and $Input.is_multiplayer_authority() and not multiplayer.is_server():
		isync.public_visibility = false
		isync.set_visibility_for(1, true)


func _physics_process(_delta: float) -> void:
	var simulate := false
	if auth_mode == "client":
		simulate = is_multiplayer_authority()
	else:
		simulate = multiplayer.is_server()
	if not simulate:
		return
	var mv: Vector2 = input_node.move
	velocity = Vector3(mv.x, 0.0, mv.y) * SPEED
	move_and_slide()


## A client asks the server to move it. The server checks the sender and the distance: a client may
## only move itself, and only as far as the rules allow. Read the sender before any await.
@rpc("any_peer", "call_remote", "reliable")
func request_teleport(target: Vector3) -> void:
	if not multiplayer.is_server():
		return
	var sender := multiplayer.get_remote_sender_id()
	var accepted := sender == str(name).to_int() and target.distance_to(position) <= MAX_STEP
	if accepted:
		position = target
	var lab := get_tree().root.get_node_or_null("World/NetLab")
	if lab:
		lab.event({"type": "teleport_request", "sender": sender, "owner": str(name).to_int(), "accepted": accepted,
				"distance": snappedf(target.distance_to(position), 0.01)})
