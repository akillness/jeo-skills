// "How one sentence becomes a scene": the prompt, the three deciding steps, the routing chips
// beside the host probe, the dashed build/look/refine loop and the reporting row. The copy is the
// design's, in loop-copy.ts; the slight rotations are the design's too. Each block rises into
// place the first time it is scrolled to (loop-motion.tsx / loop-motion.css); with JavaScript off
// or reduced motion on, `armed` is false and the section renders exactly as it did before.
import { Fragment } from 'react';
import {
  DECIDE_KICKER,
  DECIDE_TILES,
  LOOP_HEADING,
  LOOP_LEDE,
  PROMPT,
  REPORT_CHIPS,
  REPORT_KICKER,
  REPORT_LEDE,
} from './loop-copy';
import { CARD, CHIP, KICKER, LoopBox, ProbeCard, RouteCard, TONES } from './loop-cards';
import { Connector, stagger, useLoopArmed, useReveal } from './loop-motion';

const PROMPT_WORDS = PROMPT.split(' ');

export default function LoopSection() {
  const armed = useLoopArmed();
  const prompt = useReveal<HTMLParagraphElement>();
  const decide = useReveal<HTMLDivElement>();
  const report = useReveal<HTMLDivElement>();

  return (
    <section
      id="loop"
      className={`${armed ? 'loop-motion ' : ''}relative mx-auto max-w-[1240px] px-6 pt-5 pb-[62px]`}
    >
      <div className="mb-[34px] max-w-[660px]">
        <h2 className="m-0 mb-2.5 text-[clamp(28px,3.6vw,44px)] leading-[1.12] font-extrabold tracking-[-0.012em] text-ink">
          {LOOP_HEADING}
        </h2>
        <p className="m-0 text-[16px] leading-[1.6] text-pretty text-mute">{LOOP_LEDE}</p>
      </div>

      <div className="flex flex-col items-stretch">
        <p
          ref={prompt.ref}
          style={prompt.style}
          className={`loop-reveal ${prompt.state} m-0 self-start rotate-[-0.7deg] rounded-full bg-ink px-6 py-[13px] text-[15px] font-semibold text-white shadow-[0_12px_28px_#1c2a2321]`}
        >
          {PROMPT_WORDS.map((word, index) => (
            <Fragment key={`${index}-${word}`}>
              {index > 0 ? ' ' : null}
              <span className="loop-word" style={stagger(140 + index * 70)}>
                {word}
              </span>
            </Fragment>
          ))}
        </p>
        <Connector />

        <div ref={decide.ref} style={decide.style} className={`${CARD} loop-reveal ${decide.state} rotate-[0.35deg]`}>
          <p className={`${KICKER} m-0 mb-3.5`}>{DECIDE_KICKER}</p>
          <div className="flex flex-wrap gap-3">
            {DECIDE_TILES.map((tile, index) => (
              <div
                key={tile.title}
                style={stagger(index * 60)}
                className="loop-item flex-[1_1_200px] rounded-[22px] bg-tile px-[18px] py-[15px]"
              >
                <h3 className="m-0 mb-[3px] text-[16px] font-bold text-ink">{tile.title}</h3>
                <p className="m-0 text-[14px] leading-[1.5] text-mute">{tile.text}</p>
              </div>
            ))}
          </div>
        </div>
        <Connector />

        {/* Stretched, not `items-start` as the design had it: the connector below the row hangs from
            the row's bottom edge, so a shorter route card would leave the dashed line broken. The
            420 px track (the design's was 300) keeps the two side by side only while the probe
            card is wide enough to draw its diagram in two lanes; below that they stack. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-[18px]">
          <RouteCard />
          <ProbeCard />
        </div>
        <Connector />

        <LoopBox />
        <Connector />

        <div
          ref={report.ref}
          style={report.style}
          className={`${CARD} loop-reveal ${report.state} flex flex-wrap items-center justify-between gap-4 rotate-[-0.3deg]`}
        >
          <div>
            <p className={`${KICKER} m-0 mb-1.5`}>{REPORT_KICKER}</p>
            <p className="m-0 text-[16px] font-semibold text-ink">{REPORT_LEDE}</p>
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-[9px] p-0">
            {REPORT_CHIPS.map((chip, index) => (
              <li
                key={chip.label}
                style={stagger(120 + index * 80)}
                className={`${CHIP} ${TONES[chip.tone]} loop-chip ${chip.tone === 'rose' ? 'loop-chip-shake' : ''}`}
              >
                {chip.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
