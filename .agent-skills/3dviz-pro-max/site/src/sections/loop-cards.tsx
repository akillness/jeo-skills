// The three heavier blocks of the loop flow — the routing card, the host-probe card and the
// dashed loop box — plus the card vocabulary the section shares with them. Copy is the design's
// (loop-copy.ts); the reveal classes are loop-motion.css's.
import { LOOP_BADGE, LOOP_CARDS, PROBE_KICKER, ROUTE_CHIPS, ROUTE_KICKER, ROUTE_LEDE } from './loop-copy';
import { stagger, useReveal } from './loop-motion';
import ProbeDiagram from './loop-probe-diagram';
import useInView from '../hooks/use-in-view';

export const KICKER = 'font-mono text-[10.5px] tracking-[1.4px] text-mono-dim';
export const CARD =
  'rounded-[32px] border border-line bg-white px-6 py-[22px] shadow-[0_8px_22px_#1c2a230a]';
export const CHIP = 'rounded-full px-[13px] py-2 text-[13.5px] font-semibold';

export const TONES: Record<string, string> = {
  mint: 'bg-mint text-green',
  leaf: 'bg-leaf text-leaf-ink',
  sky: 'bg-sky text-sky-ink',
  sand: 'bg-sand text-sand-ink',
  rose: 'bg-rose text-rose-ink',
};

/** Only the route chips are outlined; the report chips are flat fills. */
const OUTLINES: Record<string, string> = {
  mint: 'border border-mint-line',
  leaf: 'border border-leaf-line',
  sky: 'border border-sky-line',
  sand: 'border border-sand-line',
};

const LIFT =
  'transition-[translate,box-shadow] duration-200 ease-[cubic-bezier(.2,.7,.2,1)] ' +
  'hover:-translate-y-[2px] hover:shadow-[0_6px_14px_#1c2a2314]';

/** STEP 04: one route per object, chips popping in as the card arrives. */
export function RouteCard() {
  const card = useReveal<HTMLDivElement>();

  return (
    <div ref={card.ref} style={card.style} className={`${CARD} loop-reveal ${card.state} rotate-[-0.4deg]`}>
      <p className={`${KICKER} m-0 mb-1.5`}>{ROUTE_KICKER}</p>
      <p className="m-0 mb-3.5 text-[15px] leading-[1.55] text-mute">{ROUTE_LEDE}</p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {ROUTE_CHIPS.map((chip, index) => (
          <li
            key={chip.label}
            style={stagger(120 + index * 40)}
            className={`${CHIP} ${TONES[chip.tone]} ${OUTLINES[chip.tone]} ${LIFT} loop-chip`}
          >
            {chip.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** STEP 05: what the probe finds, drawn as a small flow chart (loop-probe-diagram.tsx). */
export function ProbeCard() {
  const card = useReveal<HTMLDivElement>(80);

  return (
    <div
      ref={card.ref}
      style={card.style}
      className={`loop-reveal ${card.state} rotate-[0.5deg] rounded-[32px] bg-dark px-6 py-[22px] text-white shadow-[0_14px_34px_#1c2a2321]`}
    >
      <p className="m-0 font-mono text-[10.5px] tracking-[1.4px] text-dark-dim">{PROBE_KICKER}</p>
      <ProbeDiagram />
    </div>
  );
}

// The badge reads "LOOP ↺ UNTIL IT HOLDS UP"; the glyph is wrapped so it alone can turn.
const [BADGE_HEAD = '', BADGE_TAIL = ''] = LOOP_BADGE.split('↺');

/** STEPS 06–09: build, look, refine — the dashed box that says the work goes round. The dashes are
 *  an inset SVG rect (a CSS border cannot march); the 2 px transparent border keeps the geometry. */
export function LoopBox() {
  const box = useReveal<HTMLDivElement>();
  // A second, non-once observer: the ants only march while the box is actually on screen.
  const [ants, marching] = useInView<SVGSVGElement>();

  return (
    <div
      ref={box.ref}
      style={box.style}
      className={`loop-reveal ${box.state} relative rounded-[38px] border-2 border-transparent px-[22px] pt-7 pb-6`}
    >
      <svg
        ref={ants}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 h-full w-full overflow-visible ${marching ? 'is-marching' : ''}`}
      >
        <rect
          className="loop-ants"
          width="100%"
          height="100%"
          rx="36"
          fill="none"
          stroke="var(--color-dash-line)"
          strokeWidth="2"
        />
      </svg>
      <p className="loop-badge absolute -top-[15px] right-[22px] m-0 rounded-full bg-lime px-4 py-[7px] font-mono text-[11px] tracking-[1px] text-lime-ink">
        {BADGE_HEAD}
        <span className="loop-glyph">↺</span>
        {BADGE_TAIL}
      </p>
      <div className="relative grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[18px]">
        {LOOP_CARDS.map((card, index) => (
          <div
            key={card.kicker}
            style={stagger(index * 60)}
            className="loop-item rounded-[28px] border border-line bg-white px-[22px] py-5 shadow-[0_8px_22px_#1c2a230a]"
          >
            <p className={`${KICKER} m-0 mb-2`}>{card.kicker}</p>
            {'command' in card ? (
              <pre className="m-0 mb-2.5 overflow-x-auto rounded-[14px] bg-tile px-3 py-2.5 font-mono text-[12px] whitespace-nowrap text-green">
                <code>{card.command}</code>
              </pre>
            ) : null}
            <p className="m-0 text-[15px] leading-[1.55] text-body">{card.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
