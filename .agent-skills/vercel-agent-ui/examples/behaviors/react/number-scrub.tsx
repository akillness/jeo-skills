import * as React from "react"
import {
  formatNumber,
  fractionOf,
  scrubTo,
  stepBy,
  stepFromKey,
} from "@ui-sdk/core/number"

const sections = [
  { at: 0, label: "Intro" },
  { at: 9.5, label: "Verse" },
  { at: 24, label: "Chorus" },
  { at: 38.5, label: "Bridge" },
  { at: 52, label: "Outro" },
]

const range = {
  min: 0,
  max: 60,
  step: 0.1,
  largeStep: 5,
  snap: { points: sections.map((section) => section.at), threshold: 1.5 },
}

const clock = (time: number) =>
  `${Math.floor(time / 60)}:${formatNumber(time % 60, "en-US", {
    minimumIntegerDigits: 2,
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}`

function Example() {
  const [time, setTime] = React.useState(17)
  const free = React.useRef(false)
  const section = sections.find((candidate) => candidate.at === time)
  const track = (event: React.PointerEvent) => {
    free.current = event.metaKey || event.ctrlKey
  }
  return (
    <div data-slot="scrubber">
      <div data-slot="scrubber-track">
        {sections.map((candidate) => (
          <div
            key={candidate.label}
            data-slot="scrubber-section"
            data-active={candidate === section || undefined}
            style={{ left: `${fractionOf(candidate.at, range) * 100}%` }}
          >
            {candidate.label}
          </div>
        ))}
        <div
          data-slot="scrubber-playhead"
          data-playhead
          style={{ left: `${fractionOf(time, range) * 100}%` }}
        />
      </div>
      <input
        type="range"
        aria-label="Playhead"
        aria-valuetext={
          section ? `${clock(time)}, ${section.label}` : clock(time)
        }
        min={range.min}
        max={range.max}
        step={range.step}
        value={time}
        onPointerDown={track}
        onPointerMove={track}
        onChange={(event) =>
          setTime(
            scrubTo(Number(event.target.value), range, { snap: !free.current })
              .value
          )
        }
        onKeyDown={(event) => {
          const move = stepFromKey(event)
          if (!move) {
            return
          }
          event.preventDefault()
          setTime(
            stepBy(time, move, range, {
              snap: !(event.metaKey || event.ctrlKey),
            })
          )
        }}
      />
      <p data-slot="scrubber-readout">
        <span data-time>{clock(time)}</span>
        <span data-section>{section?.label ?? "Between sections"}</span>
      </p>
      <p data-slot="hint">Hold ⌘ or Ctrl to scrub freely.</p>
    </div>
  )
}

export { Example }
