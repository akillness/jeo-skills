"""Body-part labels for unnamed joints from the rest-pose geometry (bpy-free).

``parse_labels(parents, rest)`` reads a skeleton the way the reviewed labels
of numerically named rigs ('Bone.012', 'joint5') were made: from where the
joints are. It returns a label per joint, or '' where the geometry does not
say ('Bone' stays). Y is up; the rest pose is in the export frame.

1. Symmetry. The lateral axis is X or Z, whichever mirrors more joints onto
   joints; joints on the mirror plane are the midline, the others pair up.
2. Limbs. An off-midline joint with a midline parent starts a limb; its main
   path follows the largest child subtree. A limb whose lowest joint is near
   the floor is a leg; others hanging off the trunk are arms (or, on the
   head, ears); a joint with five or more limbs of one kind is left alone
   (tentacles, spider legs) unless they hang below it (tentacles).
3. Trunk. The midline joint the legs hang from is the hips; the midline path
   from it to the highest midline joint is spine, then neck from the arm
   attachment up, then head; a midline chain leaving the hips that does not
   lead to the head is the tail.
4. Facing. Forward along the non-lateral horizontal axis is where the head
   is when it sits well ahead of the hips, else the majority of where the
   toes point, where the face sticks out of the head and away from the tail;
   that vote is used only for a rig lying sideways (lateral axis Z): with
   the lateral axis X the asset faces +Z, as exports do. Left is up x
   forward.
5. Segments. Legs: Thigh, Shin, Foot, Toe; arms back from the hand (the
   first joint with several children, else the chain's fourth): Hand,
   Forearm, Upper Arm, Shoulder; the hand's chains are fingers, thumb first
   (the one set apart from the others), then index to pinky by distance
   from the thumb; a foot's chains are toes. A horizontal body (head ahead
   of the hips more than above them) with two leg pairs has arm chains for
   front legs (Upper Arm, Forearm, Hand, Finger, after a Shoulder on a long
   chain); with one leg pair, its other limb pair is a pair of wings.
"""

import numpy as np

MIRROR_TOL = 0.03       # of the rig's extent
MIDLINE_TOL = 0.02
FLOOR_TOL = 0.1
FINGERS = ['Thumb Finger', 'Index Finger', 'Middle Finger', 'Ring Finger', 'Pinky Finger']


def _children(parents):
    kids = [[] for _ in parents]
    for j, p in enumerate(parents):
        if p >= 0:
            kids[p].append(j)
    return kids


def _subtree(kids, j):
    out, stack = [], [j]
    while stack:
        k = stack.pop()
        out.append(k)
        stack.extend(kids[k])
    return out


def _main_path(kids, sizes, j):
    path = [j]
    while kids[path[-1]]:
        path.append(max(kids[path[-1]], key=lambda k: sizes[k]))
    return path


def _mirror(P, axis, center, ext):
    """Joint -> mirrored joint along *axis* (or -1), and the matched count."""
    Q = P.copy()
    Q[:, axis] = 2 * center - Q[:, axis]
    d = np.linalg.norm(P[:, None, :] - Q[None, :, :], axis=-1)
    m = d.argmin(axis=1)
    ok = d[np.arange(len(P)), m] <= MIRROR_TOL * ext
    mirror = np.where(ok, m, -1)
    off = np.abs(P[:, axis] - center) > MIDLINE_TOL * ext
    return mirror, int((ok & off).sum())


def parse_labels(parents, rest):
    parents = [int(p) for p in parents]
    P = np.asarray(rest, dtype=float)
    J = len(parents)
    out = [''] * J
    if J < 3:
        return out
    ext = float(np.ptp(P, axis=0).max()) or 1.0
    kids = _children(parents)
    sizes = [len(_subtree(kids, j)) for j in range(J)]

    # 1. symmetry
    best = None
    for axis in (0, 2):
        center = float(np.median(P[:, axis]))
        mirror, n = _mirror(P, axis, center, ext)
        if best is None or n > best[2]:
            best = (axis, center, n, mirror)
    lat, center, n_mirrored, mirror = best
    if n_mirrored < 2:
        return out
    fwd_axis = 2 if lat == 0 else 0
    off = P[:, lat] - center
    midline = np.abs(off) <= MIDLINE_TOL * ext
    floor = float(P[:, 1].min())

    # 2. limbs
    limbs = []
    for j in range(J):
        p = parents[j]
        if midline[j] or p < 0 or not midline[p]:
            continue
        sub = _subtree(kids, j)
        path = _main_path(kids, sizes, j)
        low = float(P[sub, 1].min())
        limbs.append({'root': j, 'attach': p, 'path': path, 'sub': sub,
                      'floor': (low - floor) <= FLOOR_TOL * ext,
                      'top': float(P[sub, 1].max())})
    if not limbs:
        return out
    by_attach = {}
    for limb in limbs:
        by_attach.setdefault(limb['attach'], []).append(limb)

    # 3. trunk
    legs = [l for l in limbs if l['floor']]
    if legs:
        hips = max({l['attach'] for l in legs},
                   key=lambda a: sum(l['attach'] == a for l in legs))
    else:
        hips = 0 if midline[0] else None
    mid_nodes = [j for j in range(J) if midline[j]]
    head = max(mid_nodes, key=lambda j: P[j, 1]) if mid_nodes else None
    trunk = []
    if hips is not None and head is not None:
        # head's midline ancestry back to hips (or to the root)
        a, chain = head, []
        while a >= 0 and midline[a]:
            chain.append(a)
            if a == hips:
                break
            a = parents[a]
        if chain and chain[-1] == hips:
            trunk = chain[::-1]
    arms = [l for l in limbs if not l['floor'] and l['attach'] in trunk and l['attach'] != hips
            and l['attach'] != head]
    ears = [l for l in limbs if not l['floor'] and head is not None and l['attach'] == head]

    # crowds of limbs from one joint: leave them unless they hang (tentacles)
    for a, group in by_attach.items():
        if len(group) >= 5:
            hang = all(P[l['path'][-1], 1] < P[a, 1] for l in group)
            for l in group:
                l['crowd'] = True
                if hang and not l['floor']:
                    for k in l['sub']:
                        out[k] = 'Tentacle'
    legs = [l for l in legs if not l.get('crowd')]
    arms = [l for l in arms if not l.get('crowd')]
    ears = [l for l in ears if not l.get('crowd')]

    # 4. facing
    votes = []
    for l in legs:
        if len(l['path']) >= 3:
            a, b = P[l['path'][-2]], P[l['path'][-1]]
            v = b[fwd_axis] - a[fwd_axis]
            if abs(v) > 0.03 * ext:
                votes.append(np.sign(v))
    if head is not None:
        front = [k for k in kids[head] if midline[k]]
        for k in front:
            v = P[k, fwd_axis] - P[head, fwd_axis]
            if abs(v) > 0.03 * ext:
                votes.append(np.sign(v))
    tails = []
    if hips is not None:
        for k in kids[hips]:
            if midline[k] and k not in trunk:
                tails.append(k)
                v = P[_main_path(kids, sizes, k)[-1], fwd_axis] - P[hips, fwd_axis]
                if abs(v) > 0.05 * ext:
                    votes.append(-np.sign(v))
    if hips is not None and head is not None:
        # a head well ahead of the hips (a horizontal body) decides
        v = P[head, fwd_axis] - P[hips, fwd_axis]
        if abs(v) > 0.15 * ext:
            votes = [np.sign(v)]
    # Exported assets face +Z unless they lie sideways: with the lateral
    # axis X the cues are not trusted over that (they turn more right
    # facings around than they fix); with the lateral axis Z they pick +X
    # or -X.
    sign = 1.0 if fwd_axis == 2 or sum(votes) >= 0 else -1.0
    forward = np.zeros(3)
    forward[fwd_axis] = sign
    left = np.cross([0.0, 1.0, 0.0], forward)

    def side(j):
        return 'Left' if (P[j] - P[hips if hips is not None else 0]) @ left > 0 else 'Right'

    # 5. labels
    if hips is not None:
        out[hips] = 'Hips'
        a = parents[hips]
        while a >= 0:
            out[a] = 'Root'
            a = parents[a]
    if trunk:
        arm_attach = [i for i, j in enumerate(trunk) if any(l['attach'] == j for l in arms)]
        top_arm = max(arm_attach) if arm_attach else None
        for i, j in enumerate(trunk[1:], start=1):
            if j == head:
                out[j] = 'Head'
            elif top_arm is not None and i > top_arm:
                out[j] = 'Neck'
            else:
                out[j] = 'Spine'
        if head is not None:
            for k in _subtree(kids, head)[1:]:
                if midline[k]:
                    out[k] = 'Head'
    for t in tails:
        for k in _subtree(kids, t):
            if midline[k]:
                out[k] = 'Tail'
    leg_names = {1: ['Thigh'], 2: ['Thigh', 'Shin'], 3: ['Thigh', 'Shin', 'Foot'],
                 4: ['Thigh', 'Shin', 'Foot', 'Toe']}
    # a body whose head is ahead of the hips more than above them is horizontal:
    # its front legs are arm chains, its non-floor limb pair wings
    horizontal = False
    if hips is not None and head is not None:
        d = P[head] - P[hips]
        horizontal = abs(d[fwd_axis]) > abs(d[1])
    front = []
    if len({l['attach'] for l in legs}) >= 2 and head is not None:
        attach_pos = {a: (P[a] - P[hips]) @ forward for a in {l['attach'] for l in legs}}
        front_attach = max(attach_pos, key=attach_pos.get)
        if front_attach != hips:
            front = [l for l in legs if l['attach'] == front_attach]
    for l in front:
        path = l['path']
        s = side(l['root'])
        names = ['Upper Arm', 'Forearm', 'Hand', 'Finger']
        if len(path) > 4:
            names = ['Shoulder'] + names
        for i, k in enumerate(path):
            out[k] = f'{s} {names[min(i, len(names) - 1)]}'
        for k in l['sub']:
            if not out[k]:
                out[k] = f'{s} Finger'
    legs = [l for l in legs if l not in front]
    if horizontal and not front:
        for l in arms:
            s = side(l['root'])
            for k in l['sub']:
                out[k] = f'{s} Wing'
        arms = []
    for l in legs:
        path = l['path']
        names = leg_names.get(len(path)) or (['Thigh', 'Shin', 'Foot'] + ['Toe'] * (len(path) - 3))
        s = side(l['root'])
        for k, name in zip(path, names):
            out[k] = f'{s} {name}'
        foot = next((k for k, n in zip(path, names) if n == 'Foot'), None)
        for k in l['sub']:
            if not out[k]:
                out[k] = f'{s} Toe' if foot is not None else ''
    for l in arms:
        path = l['path']
        s = side(l['root'])
        # the hand: the first branching joint past the upper arm
        hand_i = next((i for i, k in enumerate(path) if i >= 2 and len(kids[k]) >= 2), None)
        if hand_i is None:
            hand_i = min(len(path) - 1, 3 if len(path) >= 4 else len(path) - 1)
        seg = ['Hand', 'Forearm', 'Upper Arm', 'Shoulder']
        for i in range(hand_i, -1, -1):
            out[path[i]] = f'{s} {seg[min(hand_i - i, 3)]}'
        hand = path[hand_i]
        fingers = [k for k in kids[hand]]
        _label_fingers(out, kids, P, hand, fingers, s)
        if len(path) > hand_i + 1 and len(fingers) == 1:
            for k in path[hand_i + 1:]:
                out[k] = f'{s} Finger'
    for l in ears:
        s = side(l['root'])
        if l['top'] > P[l['attach'], 1]:
            for k in l['sub']:
                out[k] = f'{s} Ear'
    return out


def _label_fingers(out, kids, P, hand, fingers, s):
    chains = {f: _subtree(kids, f) for f in fingers}
    if len(fingers) == 1:
        for k in chains[fingers[0]]:
            out[k] = f'{s} Finger'
        return
    base = np.array([P[f] for f in fingers])
    if len(fingers) >= 3:
        # thumb: the base farthest from the others' mean
        dists = [np.linalg.norm(base[i] - np.delete(base, i, 0).mean(0)) for i in range(len(fingers))]
        thumb = int(np.argmax(dists))
        order = sorted(range(len(fingers)), key=lambda i: np.linalg.norm(base[i] - base[thumb]))
        names = FINGERS if len(fingers) == 5 else (['Thumb Finger'] + FINGERS[1:len(fingers)])
        if len(fingers) > 5:
            names = ['Finger'] * len(fingers)
        for rank, i in enumerate(order):
            for k in chains[fingers[i]]:
                out[k] = f'{s} {names[min(rank, len(names) - 1)]}'
    else:
        for f in fingers:
            for k in chains[f]:
                out[k] = f'{s} Finger'
