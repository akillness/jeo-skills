// blueprint-views.js - how the proof harness loads one blueprint and where it stands to look
// at it. Split out of main.js so neither file breaks the 200-line rule; main.js owns the
// renderer, the lights and the loop, this file owns loading, framing and counting.
// Every distance here is derived from the model, never hard-coded in metres.
import * as THREE from 'three';
import { buildKit, finishKit } from '../kit-surface.js';

const FOV_DEG = 40;
// Multiples of `fit`, the distance at which the model's bounding sphere exactly fills the
// vertical frame. Deriving them from the model keeps the four views distinct for a cottage, a
// barrel and a tree alike.
const VIEW_SCALE = { far: 2.4, mid: 1.2, close: 0.78, detail: 0.12 };
// The detail view aims at one socket, chosen deterministically: the record's own
// `proof.detail_socket` first, then the first socket named in this preference list, then the
// module's first socket, then the front face of the bounding box.
const DETAIL_SOCKETS = ['detail', 'chest', 'harness', 'lamp', 'door'];

export { FOV_DEG, VIEW_SCALE, DETAIL_SOCKETS };

/** Spherical offset in metres from an aim point, so every view is one formula with two angles. */
export function orbit(at, distance, azimuthDeg, elevationDeg) {
  const a = (azimuthDeg * Math.PI) / 180, e = (elevationDeg * Math.PI) / 180;
  return [at[0] + distance * Math.cos(e) * Math.sin(a),
          at[1] + distance * Math.sin(e),
          at[2] + distance * Math.cos(e) * Math.cos(a)];
}

/**
 * Four named views for one built blueprint.
 * @param {THREE.Box3} box - world bounds of the built group.
 * @param {{name: string, position_m: number[], normal: number[]}[]} sockets - module sockets.
 * @param {{detailSocket?: string, maxClose?: number}} options - from the record's `proof`.
 */
export function buildViews(box, sockets, { detailSocket = '', maxClose = Infinity } = {}) {
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const fit = (size.length() / 2) / Math.sin((FOV_DEG * Math.PI) / 360);
  const middle = [centre.x, centre.y, centre.z];
  // A bounding sphere frames a long building from far enough back that its fine band is a few
  // pixels across; a record may cap that one distance with `proof.max_close_m`. The smaller of
  // the two always wins, so the cap can only bring the close view nearer, never push it away.
  const views = {
    far: { position: orbit(middle, VIEW_SCALE.far * fit, 35, 18), target: middle },
    mid: { position: orbit(middle, VIEW_SCALE.mid * fit, 35, 14), target: middle },
    close: { position: orbit(middle, Math.min(VIEW_SCALE.close * fit, maxClose), 26, 8),
             target: middle }
  };
  const chosen = sockets.find(entry => entry.name === detailSocket)
    ?? sockets.find(entry => DETAIL_SOCKETS.includes(entry.name)) ?? sockets[0];
  // Whichever socket wins is raised onto the built surface: an anchor on the ground plane would
  // otherwise frame nothing but grass.
  const anchor = chosen?.position_m ?? [centre.x, centre.y, box.max.z];
  const normal = chosen?.normal ?? [0, 0, 1];
  // The lift exists to raise a ground-level socket onto the built surface, so a socket that is
  // already in the upper half of the model is aimed at directly: lifting a lamp head or a ridge
  // socket by a third of the height again would frame the sky and look down on a roof.
  const lift = anchor[1] > centre.y ? 0 : Math.min(1.6, size.y * 0.35);
  const at = [anchor[0], Math.min(anchor[1] + lift, box.max.y), anchor[2]];
  const distance = VIEW_SCALE.detail * fit;
  views.detail = {
    position: [at[0] + normal[0] * distance + 0.55, at[1] + normal[1] * distance + 0.28,
               at[2] + normal[2] * distance + 0.1],
    target: at
  };
  return { views, fit, detail_socket: chosen?.name ?? null };
}

/**
 * Metres per UV unit for one loaded geometry: sqrt(total world area / total UV area) over its
 * triangles. A Blender atlas packs every island of a whole building into 0..1 - the guildhall
 * measures 151.6 m per unit and the lantern 3.2 - so kit-surface's bounding-box heuristic would
 * read those UVs as metres and magnify a single ashlar block across a wall. Measured once per
 * geometry and left in `userData.uv_m`, which `repeatFor` prefers over any guess. Triangles with
 * no UV area (bevel slivers, whose float32 UVs collapse) are skipped rather than counted.
 * @returns {number} metres per UV unit, or 0 when the geometry carries no usable UVs.
 */
function measureUvScale(geometry) {
  const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  if (!position || !uv) return 0;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const at = i => (index ? index.getX(i) : i);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let world = 0, mapped = 0;
  for (let i = 0; i + 2 < count; i += 3) {
    const ia = at(i), ib = at(i + 1), ic = at(i + 2);
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib).sub(a);
    c.fromBufferAttribute(position, ic).sub(a);
    const u0 = uv.getX(ia), v0 = uv.getY(ia);
    const area = Math.abs((uv.getX(ib) - u0) * (uv.getY(ic) - v0)
                          - (uv.getX(ic) - u0) * (uv.getY(ib) - v0)) / 2;
    if (area <= 0) continue;
    world += b.cross(c).length() / 2;
    mapped += area;
  }
  return mapped > 0 ? Math.sqrt(world / mapped) : 0;
}

/**
 * Load one blueprint: a procedural module through import(), a glTF hero through GLTFLoader.
 * Both resolve their path against this module, never against the generated page, so the two
 * branches read the same kit tree.
 *
 * The module branch always goes through `buildKit`, which at the default tier T1 is exactly
 * `create(params)` - same geometry, same materials, same triangle count as before tiers existed.
 * The glTF branch cannot call a factory (GLTFLoader is asynchronous, `buildKit` is not), so it
 * awaits the load and hands the loaded scene to the same `finishKit`: a `gltf-asset` blueprint
 * whose record maps its baked baseColor hexes therefore gets the T2 surface and occlusion pass a
 * module gets. At T1 and T3 `finishKit` returns the loaded scene untouched.
 * @param {{tier?: string, surface?: object}} quality - from the page's tier/surface meta tags.
 */
export async function loadBlueprint(modulePath, params, factoryName = 'create',
                                    { tier = 'T1', surface = {} } = {}) {
  if (modulePath.endsWith('.glb')) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(new URL(modulePath, import.meta.url).href);
    const sockets = [];
    gltf.scene.traverse(node => {
      node.castShadow = true;
      node.receiveShadow = true;
      // Only T2 reads it, and measuring costs one pass over every triangle, so T1 and T3 load
      // exactly as they did before tiers existed.
      if (tier === 'T2' && node.geometry) node.geometry.userData.uv_m = measureUvScale(node.geometry);
      // Sockets ship inside the asset: `export_extras=True` writes a Blender empty's custom
      // properties into glTF node extras, which GLTFLoader surfaces as userData.
      if (node.userData?.socket) {
        sockets.push({ name: node.userData.socket, position_m: node.position.toArray(),
                       normal: node.userData.normal ?? [0, 1, 0] });
      }
    });
    return finishKit({ group: gltf.scene, sockets, colliders: [] }, { tier, surface });
  }
  const module = await import(new URL(modulePath, import.meta.url).href);
  const factory = module[factoryName || 'create'];
  if (typeof factory !== 'function') throw new Error(`No factory export in ${modulePath}`);
  return buildKit(factory, { ...params, tier, surface });
}

/** Triangles actually submitted, instances included: what the record's poly budget is read from. */
export function triangles(object) {
  let total = 0;
  object.traverse(node => {
    const geometry = node.geometry;
    if (!geometry) return;
    const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    total += (count / 3) * (node.isInstancedMesh ? node.count : 1);
  });
  return total;
}
