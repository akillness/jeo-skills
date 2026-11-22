// The hero has one look: `overcast-morning`, the frame the redesign is built around. It is a
// capture of the skill's T2/T3 village kit under the overcast mood, baked once by
// site/scripts/hero-posters.py from docs/demos/showcase/village-overcast-morning.jpg.

/** Only this id may reach a poster or a scene; anything else is a URL, not a look. */
export type LookId = 'overcast-morning';

export interface Look {
  id: LookId;
  /** Describes the poster, which is the picture the hero paints. */
  alt: string;
  poster: { webp: string; jpg: string };
  /** The same frame at 960x540: what a phone fetches, and the mobile LCP. */
  posterSmall: { webp: string; jpg: string };
}

export const HERO_LOOK: Look = {
  id: 'overcast-morning',
  alt:
    'The village bridge under overcast morning light: no cast shadow, desaturated colour, the ' +
    'timber houses and market stalls grounded by the baked ambient occlusion alone.',
  poster: { webp: '/media/hero/overcast-morning.webp', jpg: '/media/hero/overcast-morning.jpg' },
  posterSmall: {
    webp: '/media/hero/overcast-morning-960.webp',
    jpg: '/media/hero/overcast-morning-960.jpg',
  },
};

/**
 * Which look the live scene may upgrade to, or `null` for "poster only".
 *
 * It is null on purpose: the poster is a frame of the skill's village *kit* (the T2 blueprint
 * build in docs/demos/showcase), not of `examples/village`, which is what hero-live-scene.ts
 * knows how to build. A crossfade would therefore swap the picture mid-fold. The live scene, the
 * `?poster=` route and site/scripts/hero-poster-diff.py stay in the tree for when a look is
 * re-enabled: set this to that look id and re-shoot its poster from the route.
 */
export const HERO_LIVE_LOOK: LookId | null = null;

/**
 * The look a look id names. Ids reach here from `?poster=` in the URL and there is exactly one
 * look, so every value resolves to it; the capture script is what validates the id it shoots.
 */
export function resolveLook(_id: string): Look {
  return HERO_LOOK;
}
