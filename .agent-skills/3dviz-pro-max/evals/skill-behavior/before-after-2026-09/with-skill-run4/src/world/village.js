// village.js - builds every structure on the plan from the kit blueprints, at the tier the
// quality brief asked for: T3 (Blender-baked hero) for the hero cottage, the shipped GLB for the
// guildhall, T2 (procedural surface + vertex occlusion) for everything else the viewer walks up
// to. Nothing here authors geometry; it places kits and records what each one is.
import { THREE, buildKit } from '../kits/kit-core.js';
import { create as timberCottage } from '../kits/buildings/timber-cottage.js';
import { create as longHall } from '../kits/buildings/long-hall.js';
import { create as watermill } from '../kits/buildings/watermill.js';
import { create as roundTower } from '../kits/buildings/round-tower.js';
import { create as marketStall } from '../kits/buildings/market-stall.js';
import { create as stoneBridge } from '../kits/buildings/stone-bridge.js';
import { create as cottageT3 } from '../kits/gltf/timber-cottage-t3.js';
import { create as guildhallGlb } from '../kits/gltf/stone-guildhall.js';
import { SITES } from './village-plan.js';
import { surfaceFor } from './kit-families.js';

const FACTORY = { 'timber-cottage': timberCottage, 'long-hall': longHall, watermill,
                  'round-tower': roundTower, 'market-stall': marketStall,
                  'stone-bridge': stoneBridge };

/** One structure: kit tier in, { group, sockets, animate } out. */
async function buildSite(site) {
  if (site.tier === 'T3') return cottageT3({ scale: 1 });
  if (site.tier === 'GLB') return guildhallGlb({ scale: 1 });
  const seed = site.params.seed ?? 1;
  return buildKit(FACTORY[site.kind], {
    ...site.params, tier: 'T2', surface: surfaceFor(site.kind, seed, { size: 512, samples: 14 })
  });
}

/**
 * @param {(x: number, z: number) => number} heightAt
 * @returns {Promise<{group, items, animate(dt): boolean, dispose(): void}>} items carry the
 *   metadata the selection UI shows and the camera focuses on.
 */
export async function createVillage(heightAt) {
  const group = new THREE.Group();
  const items = [], animators = [], built = [];
  for (const site of SITES) {
    const kit = await buildSite(site);
    const holder = new THREE.Group();
    holder.position.set(site.x, site.y ?? heightAt(site.x, site.z), site.z);
    holder.rotation.y = site.yaw;
    holder.add(kit.group);
    holder.name = site.id;
    holder.userData.selectable = site.id;
    group.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const centre = box.getCenter(new THREE.Vector3());
    items.push({
      id: site.id, name: site.name, blurb: site.blurb, kind: site.kind, tier: site.tier,
      object: holder, sockets: kit.sockets ?? [], focus: site.focus,
      centre: [centre.x, centre.y, centre.z],
      base: [holder.position.x, holder.position.y, holder.position.z],
      radius: box.getSize(new THREE.Vector3()).length() / 2,
      info: kit.info ?? null
    });
    if (typeof kit.animate === 'function') animators.push(kit.animate);
    built.push(kit);
  }
  return {
    group, items,
    /** The mill wheel is the only building that moves; it turns whenever motion is running. */
    animate(dt) {
      if (dt <= 0) return false;
      let moved = false;
      for (const animate of animators) moved = animate(dt) || moved;
      return moved;
    },
    dispose() { for (const kit of built) kit.dispose?.(); }
  };
}
