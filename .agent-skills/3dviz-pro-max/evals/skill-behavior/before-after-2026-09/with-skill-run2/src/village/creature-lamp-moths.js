// creature-lamp-moths.js - three palm-sized moths orbit the lanterns they are named for. Wings are
// two thin planes flapping out of phase with the orbit, so the silhouette changes as they turn.
import * as THREE from 'three';

/**
 * @param {object} materials
 * @param {Array<{anchor: number[], radius: number, speed: number, phase: number}>} specs
 * @returns {{group, update(time), dispose()}}
 */
export function createLampMoths(materials, specs) {
  const group = new THREE.Group();
  const bodyGeometry = new THREE.CapsuleGeometry(0.05, 0.16, 3, 6);
  const wingGeometry = new THREE.CircleGeometry(0.17, 8, 0, Math.PI);
  const moths = specs.map(spec => {
    const moth = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry, materials.mothBody);
    body.rotation.x = Math.PI / 2;
    moth.add(body);
    const wings = [-1, 1].map(side => {
      const wing = new THREE.Mesh(wingGeometry, materials.mothWing);
      wing.position.set(side * 0.04, 0.03, 0);
      moth.add(wing);
      return { wing, side };
    });
    group.add(moth);
    return { moth, wings, spec };
  });

  return {
    group,
    update(time) {
      for (const { moth, wings, spec } of moths) {
        const angle = time * spec.speed + spec.phase;
        // Two nested circles: a moth's path around a lamp is never a clean orbit.
        const radius = spec.radius * (1 + 0.28 * Math.sin(time * 0.9 + spec.phase));
        moth.position.set(
          spec.anchor[0] + Math.cos(angle) * radius + Math.sin(time * 2.3 + spec.phase) * 0.12,
          spec.anchor[1] + Math.sin(time * 1.4 + spec.phase) * 0.34,
          spec.anchor[2] + Math.sin(angle) * radius * 0.8
        );
        moth.rotation.y = -angle + Math.PI / 2;
        const flap = Math.sin(time * 13 + spec.phase) * 0.85 + 0.5;   // ~2 Hz stroke, never fully closed
        for (const { wing, side } of wings) wing.rotation.y = side * flap;
      }
    },
    dispose() { bodyGeometry.dispose(); wingGeometry.dispose(); }
  };
}
