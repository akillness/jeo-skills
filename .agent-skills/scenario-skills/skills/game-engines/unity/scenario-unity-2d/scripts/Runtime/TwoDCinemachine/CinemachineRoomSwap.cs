// AgentKit 2D v0.2 (scenario-unity-2d skill, 2026-09-24 refactor). Room-to-room camera swap on a door trigger,
// decided on trigger EXIT by the exit direction, never on enter (Sasquatch 9dzBrLUIF8g [00:14:11],
// [00:14:43]: "We need to know what direction our player is exiting from, not entering"). A player who
// steps into the doorway and turns back keeps the old room's camera. The live camera is raised by
// Priority (Cinemachine 3: the highest priority wins; Prioritize() re-sorts at once); activating and
// deactivating camera GameObjects works too (Sasquatch's choice). Priority values are [added].
// Each room camera carries its own CinemachineConfiner2D whose bounds END EXACTLY at the room's walls and
// at any secret room's border (Sasquatch [00:02:10], [00:16:52]); ut_2d.bounds_hide_secrets checks it.
// Compiled only with Cinemachine 3 (AGENTKIT_CM3). Run in Unity 6000.3.21f1 on 2026-09-24 with CM 3.1.7:
// tests/code/unity-2d (CameraFeelTests.RoomSwapOnExitNotEnter).
using Unity.Cinemachine;
using UnityEngine;

namespace AgentKit.TwoD
{
    [RequireComponent(typeof(Collider2D))]
    public class CinemachineRoomSwap : MonoBehaviour
    {
        [Tooltip("Camera of the room on the left (or below, when vertical)")]
        public CinemachineCamera firstRoom;
        [Tooltip("Camera of the room on the right (or above, when vertical)")]
        public CinemachineCamera secondRoom;
        [Tooltip("Door between a lower and an upper room")]
        public bool vertical;
        public LayerMask playerLayers = ~0;
        public int livePriority = 20;
        public int idlePriority = 10;

        public int Swaps { get; private set; }
        public int Exits { get; private set; }
        public CinemachineCamera Live { get; private set; }

        Collider2D m_Trigger;

        void Awake()
        {
            m_Trigger = GetComponent<Collider2D>();
            m_Trigger.isTrigger = true;
        }

        void OnTriggerExit2D(Collider2D other)
        {
            if (((1 << other.gameObject.layer) & playerLayers.value) == 0) return;
            Exits++;
            Vector2 dir = (Vector2)(other.bounds.center - m_Trigger.bounds.center);
            bool toSecond = vertical ? dir.y > 0f : dir.x > 0f;
            MakeLive(toSecond ? secondRoom : firstRoom, toSecond ? firstRoom : secondRoom);
        }

        public void MakeLive(CinemachineCamera on, CinemachineCamera off)
        {
            if (on == null) return;
            if (Live != null && Live != on) Swaps++;      // the first call only sets the starting room
            Live = on;
            on.Priority = livePriority;
            if (off != null) off.Priority = idlePriority;
            on.Prioritize();
        }
    }
}
