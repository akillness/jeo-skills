// scenario-unity-gameplay runtime (Unity Expert Skills v0.2, 2026-09-24). Physics query helpers with the
// traps handled:
//  - NonAlloc: "if more colliders are found than the buffer holds, extra results are silently
//    dropped" (6.3 Manual, Use non-allocating query versions; pTz3LMQpvfA [00:09:45]): loop on the
//    returned count, never on the buffer, and count == buffer.Length is reported (Truncations, one
//    warning per label) so the buffer gets sized to the profiled maximum [added];
//  - NonAlloc results are NOT ordered by distance (LlamAcademy, fJyi7l2tWKo [00:16:01]): sort on
//    demand with a non-allocating comparer;
//  - the cast shape matches the moving collider: a capsule bullet uses CapsuleCast, a fat projectile
//    a SphereCast, never a thin ray (fJyi7l2tWKo [00:09:54]);
//  - QueryTriggerInteraction is always explicit (Queries Hit Triggers is ON by default in 6000.3.21f1,
//    measured).
// Shape casts do not report colliders already overlapping the shape at the origin [added]: pair them
// with an overlap check when the start may be inside geometry.
using System.Collections.Generic;
using UnityEngine;

namespace AgentKit.Gameplay
{
    public static class Queries
    {
        public static int Truncations { get; private set; }
        static readonly HashSet<string> s_Warned = new HashSet<string>();
        static readonly DistanceComparer s_ByDistance = new DistanceComparer();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        public static void ResetStatics() { Truncations = 0; s_Warned.Clear(); }

        sealed class DistanceComparer : IComparer<RaycastHit>
        {
            public int Compare(RaycastHit a, RaycastHit b) => a.distance.CompareTo(b.distance);
        }

        static void Check(int count, int size, string label)
        {
            if (count < size) return;
            Truncations++;
            if (s_Warned.Add(label))
                Debug.LogWarning("[Queries] " + label + ": " + count + " results filled the " + size +
                                 "-slot buffer; extra hits were silently dropped. Size it to the profiled maximum.");
        }

        /// <summary>OverlapSphereNonAlloc; use only buffer[0..count).</summary>
        public static int OverlapSphere(Vector3 center, float radius, Collider[] buffer, int mask,
                                        QueryTriggerInteraction triggers, string label = "OverlapSphere")
        {
            int n = Physics.OverlapSphereNonAlloc(center, radius, buffer, mask, triggers);
            Check(n, buffer.Length, label);
            return n;
        }

        /// <summary>RaycastNonAlloc with a distance (never infinite on an All-style cast); optional sort.</summary>
        public static int RaycastAll(Vector3 origin, Vector3 dir, float maxDistance, RaycastHit[] buffer, int mask,
                                     QueryTriggerInteraction triggers, bool sortByDistance, string label = "RaycastAll")
        {
            int n = Physics.RaycastNonAlloc(origin, dir, buffer, maxDistance, mask, triggers);
            Check(n, buffer.Length, label);
            if (sortByDistance && n > 1) System.Array.Sort(buffer, 0, n, s_ByDistance);
            return n;
        }

        /// <summary>SphereCastNonAlloc; optional sort by distance.</summary>
        public static int SphereCastAll(Vector3 origin, float radius, Vector3 dir, float maxDistance, RaycastHit[] buffer,
                                        int mask, QueryTriggerInteraction triggers, bool sortByDistance, string label = "SphereCastAll")
        {
            int n = Physics.SphereCastNonAlloc(origin, radius, dir, buffer, maxDistance, mask, triggers);
            Check(n, buffer.Length, label);
            if (sortByDistance && n > 1) System.Array.Sort(buffer, 0, n, s_ByDistance);
            return n;
        }

        public static void SortByDistance(RaycastHit[] hits, int count)
        {
            if (count > 1) System.Array.Sort(hits, 0, count, s_ByDistance);
        }

        /// <summary>Sweep the collider's own shape (sphere, capsule, box; ray otherwise) from `from`
        /// along `delta`. The collider only describes the shape: it can be disabled.</summary>
        public static bool SweepShape(Collider shape, Vector3 from, Vector3 delta, out RaycastHit hit, int mask,
                                      QueryTriggerInteraction triggers = QueryTriggerInteraction.Ignore)
        {
            float dist = delta.magnitude;
            hit = default;
            if (dist < 1e-6f) return false;
            var dir = delta / dist;
            var tr = shape.transform;
            var s = tr.lossyScale;
            var rot = tr.rotation;
            float ax = Mathf.Abs(s.x), ay = Mathf.Abs(s.y), az = Mathf.Abs(s.z);
            switch (shape)
            {
                case SphereCollider sc:
                {
                    var c = from + rot * Vector3.Scale(sc.center, s);
                    float r = sc.radius * Mathf.Max(ax, Mathf.Max(ay, az));
                    return Physics.SphereCast(c, r, dir, out hit, dist, mask, triggers);
                }
                case CapsuleCollider cc:
                {
                    var c = from + rot * Vector3.Scale(cc.center, s);
                    Vector3 axis; float axisScale, r;
                    switch (cc.direction)
                    {
                        case 0: axis = rot * Vector3.right; axisScale = ax; r = cc.radius * Mathf.Max(ay, az); break;
                        case 2: axis = rot * Vector3.forward; axisScale = az; r = cc.radius * Mathf.Max(ax, ay); break;
                        default: axis = rot * Vector3.up; axisScale = ay; r = cc.radius * Mathf.Max(ax, az); break;
                    }
                    float half = Mathf.Max(0f, cc.height * axisScale * 0.5f - r);
                    return Physics.CapsuleCast(c + axis * half, c - axis * half, r, dir, out hit, dist, mask, triggers);
                }
                case BoxCollider bc:
                {
                    var c = from + rot * Vector3.Scale(bc.center, s);
                    return Physics.BoxCast(c, Vector3.Scale(bc.size, new Vector3(ax, ay, az)) * 0.5f, dir, out hit, rot, dist, mask, triggers);
                }
                default:
                    return Physics.Raycast(from, dir, out hit, dist, mask, triggers);
            }
        }
    }
}
