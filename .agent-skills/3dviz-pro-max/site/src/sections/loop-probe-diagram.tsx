// STEP 05 as a small flow chart: the probe node, a bus that forks into the two lanes, and per
// branch a tool mark, the condition it tests and the outcome that condition forces. The lines are
// SVG paths with `pathLength={1}`, so one keyframe draws any of them; the nodes pop in after the
// line that points at them (loop-motion.css). Screen readers get the sr-only list instead.
import type { ComponentType } from 'react';
import { PROBE_LANES, PROBE_NODE } from './loop-copy';
import { stagger } from './loop-motion';
import { BlenderMark, ChromiumMark, ThreeJsMark } from '../components/brand-logos';

type MarkName = (typeof PROBE_LANES)[number]['branches'][number]['mark'];

const MARKS: Record<MarkName, ComponentType<{ className?: string }> | null> = {
  blender: BlenderMark,
  three: ThreeJsMark,
  chromium: ChromiumMark,
  none: null,
};

const LINE = 'loop-line stroke-dark-mute/40';
const CHIP =
  'rounded-full bg-dark-mint/12 px-2.5 py-[3px] font-mono text-[11.5px] text-dark-mint';

/** The tool's mark in a 26 px tile, or a mono "CPU" for the branch that has no tool. */
function MarkTile({ mark }: { mark: MarkName }) {
  const Logo = MARKS[mark];
  return (
    <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[9px] bg-white/8 text-dark-mint">
      {Logo ? (
        <Logo className="h-[17px] w-[17px]" />
      ) : (
        <span className="font-mono text-[8.5px] tracking-[0.5px] text-dark-dim">CPU</span>
      )}
    </span>
  );
}

/** One lane: its label, then a branch row and the outcome the branch leads to. */
function Lane({ lane, index }: { lane: (typeof PROBE_LANES)[number]; index: number }) {
  const base = 380 + index * 120;

  return (
    <div className="flex flex-col">
      {/* Stacked in a narrow card, the lanes chain downwards, so each gets its own drop line. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 16"
        className={`${LINE} h-4 w-6 @min-[26rem]:hidden`}
        style={stagger(base - 60)}
        fill="none"
        strokeWidth={1.5}
      >
        <path d="M12 0V16" pathLength={1} strokeDasharray={1} />
      </svg>
      <p
        className="loop-item m-0 mb-1 font-mono text-[10px] tracking-[1.4px] text-dark-dim uppercase"
        style={stagger(base)}
      >
        {lane.lane}
      </p>
      {lane.branches.map((branch, position) => (
        <div key={branch.condition} className="mb-1 last:mb-0">
          <div className="loop-item flex items-center gap-2.5" style={stagger(base + 80 + position * 160)}>
            <MarkTile mark={branch.mark} />
            <span className="font-mono text-[12px] text-dark-mute">{branch.condition}</span>
          </div>
          <div className="ml-[13px] flex items-center gap-1.5">
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className={`${LINE} h-4 w-4 flex-none`}
              style={stagger(base + 120 + position * 160)}
              fill="none"
              strokeWidth={1.5}
            >
              <path d="M1 0V9a4 4 0 0 0 4 4h11" pathLength={1} strokeDasharray={1} />
            </svg>
            <span className={`loop-item ${CHIP}`} style={stagger(base + 200 + position * 160)}>
              {branch.outcome}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProbeDiagram() {
  return (
    <div className="@container mt-3.5">
      <ul className="sr-only">
        {PROBE_LANES.flatMap((lane) =>
          lane.branches.map((branch) => (
            <li key={branch.condition}>{`${lane.lane}: ${branch.condition} → ${branch.outcome}`}</li>
          )),
        )}
      </ul>
      <div aria-hidden="true" className="flex flex-col items-start">
        <span
          className="loop-item rounded-full border border-dark-mint/40 px-3 py-[5px] font-mono text-[12px] text-dark-mint"
          style={stagger(220)}
        >
          {PROBE_NODE}
        </span>
        {/* The bus: a drop into the first lane and a sweep into the second. Authored at the widest
            card (540 px) and stretched horizontally, so the elbow flattens a little on a narrower
            card. No `non-scaling-stroke` here on purpose: with it, Chrome measures the dash in
            device space and a stretched line stops short of its own end. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 540 20"
          preserveAspectRatio="none"
          className={`${LINE} hidden h-5 w-full @min-[26rem]:block`}
          fill="none"
          strokeWidth={1.5}
          style={stagger(300)}
        >
          <path d="M22 0V20" pathLength={1} strokeDasharray={1} />
          <path d="M22 7h252a6 6 0 0 1 6 6v7" pathLength={1} strokeDasharray={1} />
        </svg>
        <div className="grid w-full gap-x-5 @min-[26rem]:grid-cols-2">
          {PROBE_LANES.map((lane, index) => (
            <Lane key={lane.lane} lane={lane} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
