// The fold: one baked frame of the village kit under the two cream scrims, the stat chips, the
// headline, the two calls to action and the prompt card. The picture is static — see
// HERO_LIVE_LOOK in ../hero/hero-looks: while it is null nothing here builds a WebGL scene and the
// canvas below is not rendered at all.
import { useEffect, useRef, useState } from 'react';
import CopyButton from '../components/copy-button';
import { HERO_LIVE_LOOK, HERO_LOOK } from '../hero/hero-looks';
import { useHeroUpgrade } from '../hero/use-hero-upgrade';
import type { Stats } from '../types/generated-data';

const PROMPT =
  'Use 3dviz-pro-max to build a small fantasy village I can explore. Choose a distinctive ' +
  'art direction, add a few moving creatures, and inspect the result.';
const SUB_LINE =
  'A standalone agent skill for creative 3D visualization: shape the world, model its rules, ' +
  'make it interactive, and check what actually appears on screen.';
const COPIED_MS = 1800;

/** The design's three chip tones, in the order the chips appear. */
const CHIP_TONE = {
  mint: 'bg-mint text-green border-mint-line',
  leaf: 'bg-leaf text-leaf-ink border-leaf-line',
  sky: 'bg-sky text-sky-ink border-sky-line',
} as const;

const SCRIM_SIDE =
  'bg-[linear-gradient(100deg,#fffaf2f7_0%,#fffaf2ed_32%,#fffaf299_56%,#fffaf24d_100%)]';
const SCRIM_EDGES =
  'bg-[linear-gradient(180deg,#fffaf2cc_0%,transparent_24%,transparent_62%,#fffaf2f2_100%)]';
const ROW = 'relative mx-auto box-border w-full max-w-[1240px]';

export interface HeroCinematicProps {
  /** The generated counts; the four chips are the only place the hero states a number. */
  stats: Stats;
}

export default function HeroCinematic({ stats }: HeroCinematicProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posterRef = useRef<HTMLImageElement>(null);
  const { state } = useHeroUpgrade({ canvasRef, posterRef });
  const [copied, setCopied] = useState(false);

  // The note clears itself; the timeout is the external system this effect synchronises.
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const chips = [
    { tone: CHIP_TONE.mint, value: stats.recipes, label: 'recipes' },
    { tone: CHIP_TONE.mint, value: stats.knowledge, label: 'knowledge records' },
    { tone: CHIP_TONE.leaf, value: stats.blueprints, label: 'proved kits' },
    { tone: CHIP_TONE.sky, value: stats.studies, label: 'runnable studies' },
  ];

  return (
    <section id="hero-cinema" className="relative m-0 w-full p-0" data-hero-state={state}>
      {/* The header wordmark may link to either id; both land on the fold. */}
      <span id="top" />
      <div className="relative grid min-h-[calc(100vh-60px)] grid-rows-[1fr_auto] overflow-hidden">
        <picture>
          {/* Phones first: the 1920-wide frame is the LCP on a throttled connection, so anything
              at 640px or under fetches the 960-wide pair instead. */}
          <source
            media="(max-width: 640px)"
            type="image/webp"
            srcSet={HERO_LOOK.posterSmall.webp}
          />
          <source
            media="(max-width: 640px)"
            type="image/jpeg"
            srcSet={HERO_LOOK.posterSmall.jpg}
          />
          <source type="image/webp" srcSet={HERO_LOOK.poster.webp} />
          <img
            ref={posterRef}
            src={HERO_LOOK.poster.jpg}
            alt={HERO_LOOK.alt}
            width={1920}
            height={1080}
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </picture>
        {HERO_LIVE_LOOK === null ? null : (
          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 in-data-[hero-state=live]:opacity-100"
          />
        )}
        <div aria-hidden="true" className={`absolute inset-0 ${SCRIM_SIDE}`} />
        <div aria-hidden="true" className={`absolute inset-0 ${SCRIM_EDGES}`} />

        <div className={`${ROW} flex items-center px-6 pt-[72px] pb-8`}>
          <div className="flex max-w-[760px] flex-col gap-6">
            <div className="flex flex-wrap gap-2 font-mono text-[11.5px] tracking-[0.6px]">
              {chips.map((chip) => (
                <span
                  key={chip.label}
                  className={`rounded-full border px-[14px] py-[7px] ${chip.tone}`}
                >
                  <b className="font-display text-[13px]">{chip.value}</b> {chip.label}
                </span>
              ))}
            </div>
            <h1 className="m-0 text-[clamp(42px,6.4vw,92px)] leading-none font-extrabold tracking-[-0.015em] text-balance [word-spacing:0.04em]">
              Turn an idea into a 3D scene <span className="text-green">worth exploring.</span>
            </h1>
            <p className="m-0 max-w-[560px] text-[18px] leading-[1.6] text-body text-pretty">
              {SUB_LINE}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#install"
                className="rounded-full bg-green px-[26px] py-[15px] text-[16px] font-semibold text-white shadow-[0_10px_24px_#0b755333] hover:bg-green-dark"
              >
                Get the skill →
              </a>
              <a
                href="#gallery"
                className="rounded-full border border-line-strong bg-white/95 px-6 py-[15px] text-[15px] font-semibold text-ink hover:bg-mint"
              >
                See the demos
              </a>
            </div>
            {/* 600px = the design's 560px content box plus its 20px side padding: the HTML has no
                box-sizing reset, Tailwind's preflight does. */}
            <div className="max-w-[600px] rounded-[26px] border border-line bg-white/95 px-5 py-[18px] shadow-[0_8px_22px_#1c2a230f]">
              <div className="mb-2 flex items-center justify-between gap-[14px]">
                <span className="font-mono text-[10.5px] tracking-[1.4px] text-mono-dim">
                  TRY THIS PROMPT
                </span>
                <CopyButton text={PROMPT} onCopied={() => setCopied(true)} />
              </div>
              <p className="m-0 text-[15px] leading-[1.62] text-body text-pretty">“{PROMPT}”</p>
              <div
                role="status"
                aria-live="polite"
                className="mt-2 h-[13px] font-mono text-[10.5px] text-green"
              >
                {copied ? 'COPIED ✓' : ''}
              </div>
            </div>
          </div>
        </div>

        <div className={`${ROW} flex flex-wrap items-end justify-end px-6 pb-[34px]`}>
          <a href="#gallery" className="font-mono text-[10.5px] tracking-[1.2px] text-green">
            SCROLL ↓
          </a>
        </div>
      </div>
    </section>
  );
}
