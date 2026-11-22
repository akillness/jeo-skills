// AgentKit 2D v0.2 (scenario-unity-2d skill, 2026-09-24 refactor). A hazard (spikes, saw, lava strip) whose
// hitbox is SMALLER than its art: Celeste's forgiveness list includes "small spike hitboxes: touching
// the tip does not kill" (GMTK yorTG9at90g [00:09:28]). The collider is a trigger fitted from the
// sprite bounds minus an inset in art pixels, so a graze on the drawn tip survives and a real overlap
// still hits. The inset defaults are [added] values: tune them with the art (Audit2D flags hazards whose
// hitbox is not smaller than the sprite: 2d.hazard_hitbox).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d (ForgivenessTests.HazardHitboxSmallerThanArt).
using System;
using UnityEngine;

namespace AgentKit.TwoD
{
    [RequireComponent(typeof(BoxCollider2D))]
    [DisallowMultipleComponent]
    public class Hazard2D : MonoBehaviour
    {
        [Tooltip("Hitbox inset in ART pixels: x on each side, y from the top (the base stays on the ground) [added defaults]")]
        public Vector2 insetPixels = new Vector2(2f, 3f);
        [Tooltip("Pixels per unit of the art (the project PPU)")]
        public float pixelsPerUnit = 16f;
        [Tooltip("Layers that get hurt (the player layer)")]
        public LayerMask targetLayers = ~0;

        /// <summary>Raised once per entering collider on a target layer.</summary>
        public event Action<Hazard2D, Collider2D> Hit;
        public int HitCount { get; private set; }

        void Reset() => FitHitbox();

        void Awake()
        {
            GetComponent<BoxCollider2D>().isTrigger = true;
        }

        /// <summary>Size the trigger from the SpriteRenderer's local bounds minus the inset. Returns the
        /// hitbox-to-art ratio (x, y); both must stay below 1 (forgiveness).</summary>
        public Vector2 FitHitbox()
        {
            var box = GetComponent<BoxCollider2D>();
            box.isTrigger = true;
            var sr = GetComponent<SpriteRenderer>();
            if (sr == null || sr.sprite == null) return Vector2.one;
            var b = sr.sprite.bounds;                                   // local space, pivot included
            float ix = insetPixels.x / pixelsPerUnit, iy = insetPixels.y / pixelsPerUnit;
            var size = new Vector2(Mathf.Max(0.01f, b.size.x - 2f * ix), Mathf.Max(0.01f, b.size.y - iy));
            box.size = size;
            box.offset = new Vector2(b.center.x, b.min.y + size.y * 0.5f);
            return new Vector2(size.x / b.size.x, size.y / b.size.y);
        }

        /// <summary>Hitbox size over sprite size, per axis, in local space (1 or more = no forgiveness).</summary>
        public Vector2 HitboxToArtRatio()
        {
            var sr = GetComponent<SpriteRenderer>();
            var box = GetComponent<BoxCollider2D>();
            if (sr == null || sr.sprite == null || box == null) return Vector2.one;
            var b = sr.sprite.bounds.size;
            return new Vector2(box.size.x / Mathf.Max(1e-4f, b.x), box.size.y / Mathf.Max(1e-4f, b.y));
        }

        void OnTriggerEnter2D(Collider2D other)
        {
            if (((1 << other.gameObject.layer) & targetLayers.value) == 0) return;
            HitCount++;
            Hit?.Invoke(this, other);
        }
    }
}
