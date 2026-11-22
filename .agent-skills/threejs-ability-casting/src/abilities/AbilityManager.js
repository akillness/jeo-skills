import { IceAbility } from './IceAbility.js';
import { ThunderAbility } from './ThunderAbility.js';
import { MeteorAbility } from './MeteorAbility.js';
import { BeamAbility } from './BeamAbility.js';
import { SnareAbility } from './SnareAbility.js';
import { GlacierAbility } from './GlacierAbility.js';
import { ELEMENTS } from '../config/settings.js';
import { ObjectPool } from '../utils/ObjectPool.js';

/** Registry: adding an ability means adding one line here. */
const ABILITY_TYPES = {
  ice: IceAbility,
  thunder: ThunderAbility,
  meteor: MeteorAbility,
  beam: BeamAbility,
  snare: SnareAbility,
  glacier: GlacierAbility
};

const MAX_CONCURRENT = 4;

/**
 * Spawns, updates and recycles abilities.
 *
 * Instances are pooled per type: casting fifty times constructs at most a
 * handful of objects per ability, and every one of them keeps its meshes and
 * materials for the lifetime of the app. Nothing is built during a cast.
 *
 * `MAX_CONCURRENT` is shared across types, so mixing abilities retires the
 * oldest cast whichever element it was.
 */
export class AbilityManager {
  /**
   * @param {object} context shared systems handed to every ability:
   *   { scene, camera, environment, particles, lights, decals, bursts, shake, flash }
   */
  constructor(context) {
    this.ctx = context;
    this.active = [];
    this.selected = ELEMENTS[0];

    this.pools = new Map();
    for (const [element, Type] of Object.entries(ABILITY_TYPES)) {
      this.pools.set(
        element,
        new ObjectPool(() => {
          const ability = new Type(this.ctx);
          this.ctx.scene.add(ability.group);
          ability.group.visible = false;
          return ability;
        })
      );
    }
  }

  select(element) {
    if (!ABILITY_TYPES[element]) return;
    this.selected = element;
  }

  /** Registered ability ids, in the order the HUD lists them. */
  get elements() {
    return ELEMENTS.filter((element) => ABILITY_TYPES[element]);
  }

  /**
   * Build an ability's instances without casting them.
   *
   * The pools are lazy on purpose — nothing is constructed *during* a cast — but
   * something still has to pay for each instance, and by default that is the
   * cast that first needs it: geometry generation, then a GPU stall while the
   * driver compiles the shaders those new meshes just brought into the scene.
   * `App#_precompile` calls this for every element behind the loading screen instead,
   * so the first cast of a session costs what the fiftieth does.
   *
   * It fills the pool to `MAX_CONCURRENT`, not to one. Every cooldown is far
   * shorter than a cast's lifetime, so casting the same ability again while the
   * last one is still standing is ordinary play — and each of those overlapping
   * casts is a fresh instance with its own geometry to build and upload.
   *
   * The instances go straight back into the pool, hidden and parented to the
   * scene, exactly as if they had been cast and retired.
   *
   * @returns {import('./Ability.js').Ability[]}
   */
  prewarm(element) {
    const pool = this.pools.get(element);
    if (!pool) return [];
    const warmed = [];
    for (let i = 0; i < MAX_CONCURRENT; i++) warmed.push(pool.acquire());
    for (const ability of warmed) pool.release(ability);
    return warmed;
  }

  /**
   * Cast the selected ability along a line.
   *
   * A far cast takes the same three arguments and simply works from the far end
   * of that line — which is why adding zone targeting needed nothing here.
   *
   * @param {THREE.Vector3} origin     on the floor
   * @param {THREE.Vector3} direction  unit, flat
   * @param {number} distance          metres
   * @returns {import('./Ability.js').Ability|null}
   */
  cast(origin, direction, distance, element = this.selected) {
    if (!ABILITY_TYPES[element]) return null;

    // Retire the oldest cast rather than letting the scene grow without bound.
    if (this.active.length >= MAX_CONCURRENT) {
      const oldest = this.active.shift();
      oldest.destroy();
      this.pools.get(oldest.element).release(oldest);
    }

    const ability = this.pools.get(element).acquire();
    ability.spawn(origin, direction, distance);
    this.active.push(ability);
    return ability;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const ability = this.active[i];
      ability.update(dt);
      if (ability.isFinished) {
        this.active.splice(i, 1);
        ability.destroy();
        this.pools.get(ability.element).release(ability);
      }
    }
  }

  /** Cancel everything currently in flight. */
  clear() {
    for (const ability of this.active) {
      ability.destroy();
      this.pools.get(ability.element).release(ability);
    }
    this.active.length = 0;
  }

  /** The most recent still-running cast — used to frame the camera. */
  get focus() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].isActive) return this.active[i];
    }
    return null;
  }

  dispose() {
    this.clear();
    for (const pool of this.pools.values()) pool.dispose((ability) => ability.dispose());
    this.pools.clear();
  }
}
