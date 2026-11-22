// One study card: the GPU still of the page it opens, a muted loop that starts on hover or
// keyboard focus and rewinds when the pointer or focus leaves, and the Show 3D pill that opens the
// study in the gallery's modal. Clicking anywhere on the card opens it too; the pill stays the
// visible affordance and the only tab stop, so a card is still one keyboard control.
import { useRef, useState } from 'react';
import { mediaUrl } from '../lib/site-links';
import useReducedMotion from '../hooks/use-reduced-motion';
import type { Example } from '../types/generated-data';

export interface DemoCardProps {
  study: Example;
  /** The gallery owns the single modal; it also keeps the pill to return focus to. */
  onOpen: (study: Example, opener: HTMLButtonElement) => void;
}

const PILL =
  'absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-green px-[15px] py-[9px] ' +
  'text-[13px] font-semibold text-white shadow-[0_10px_22px_#1c2a2333] cursor-pointer ' +
  'transition duration-200 hover:bg-green-dark ' +
  'opacity-0 -translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0 ' +
  'group-focus-within:opacity-100 group-focus-within:translate-y-0 ' +
  // A touch screen has no hover to reveal it with, so there it is simply always on.
  '[@media(hover:none)]:opacity-100 [@media(hover:none)]:translate-y-0';

export default function DemoCard({ study, onOpen }: DemoCardProps) {
  const video = useRef<HTMLVideoElement>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const clip = reduced ? null : study.clip;

  function start(): void {
    const element = video.current;
    if (!element) return;
    setPlaying(true);
    // Autoplay can still be refused (low power mode, no user gesture yet); the still stays up.
    element.play().catch(() => setPlaying(false));
  }

  function stop(): void {
    const element = video.current;
    if (!element) return;
    setPlaying(false);
    element.pause();
    element.currentTime = 0;
  }

  // The whole card is a click target. A click that merely ended a text selection drag inside the
  // caption is not a request to open the study, and the pill routes through its own handler.
  function openFromCard(): void {
    if (window.getSelection()?.toString()) return;
    const button = pill.current;
    if (button) onOpen(study, button);
  }

  return (
    <figure
      className="group m-0 flex w-full cursor-pointer flex-col overflow-hidden rounded-[28px] border border-line bg-white shadow-[0_6px_18px_#1c2a230a] transition-shadow duration-200 hover:shadow-[0_16px_34px_#1c2a231a]"
      onClick={openFromCard}
      onPointerEnter={clip ? start : undefined}
      onPointerLeave={clip ? stop : undefined}
      onFocus={clip ? start : undefined}
      onBlur={clip ? stop : undefined}
    >
      <div className="relative">
        {/* Decorative: the title and the blurb below say what the frame shows. */}
        <img
          src={mediaUrl(study.thumb)}
          alt=""
          width={1280}
          height={800}
          loading="lazy"
          decoding="async"
          className={`block aspect-[16/10] w-full object-cover transition-opacity duration-300 ${
            playing ? 'opacity-0' : 'opacity-100'
          }`}
        />
        {clip ? (
          <video
            ref={video}
            muted
            loop
            playsInline
            preload="none"
            width={640}
            height={400}
            aria-hidden="true"
            tabIndex={-1}
            data-clip={study.id}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              playing ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <source src={`${mediaUrl(clip)}.webm`} type="video/webm" />
            <source src={`${mediaUrl(clip)}.mp4`} type="video/mp4" />
          </video>
        ) : null}
        <button
          ref={pill}
          type="button"
          onClick={(event) => {
            event.stopPropagation(); // the figure's handler would otherwise open it a second time
            onOpen(study, event.currentTarget);
          }}
          className={PILL}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2.6 21 7.4v9.2L12 21.4 3 16.6V7.4Z" />
            <path d="M3 7.4 12 12l9-4.6M12 12v9.4" />
          </svg>
          Show 3D<span className="sr-only">: {study.title}</span>
        </button>
      </div>
      <figcaption className="flex flex-1 flex-col gap-1.5 px-4 pt-3.5 pb-4">
        <div className="flex items-baseline justify-between gap-2.5">
          <h4 className="m-0 text-[15.5px] font-bold tracking-[-0.2px] text-ink">{study.title}</h4>
          <span className="flex-none font-mono text-[10.5px] text-mono-dim">{study.id}</span>
        </div>
        <p className="m-0 text-[13.5px] leading-[1.45] text-mute">{study.blurb}</p>
      </figcaption>
    </figure>
  );
}
