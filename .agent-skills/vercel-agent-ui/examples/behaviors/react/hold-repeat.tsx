import * as React from "react"
import { bindRepeat } from "@ui-sdk/core"
import { MinusIcon, PlusIcon } from "lucide-react"

const min = 25
const max = 400

function ZoomButton({
  label,
  disabled,
  onStep,
  children,
}: {
  label: string
  disabled: boolean
  onStep: () => boolean
  children: React.ReactNode
}) {
  const button = React.useRef<HTMLButtonElement>(null)
  const step = React.useEffectEvent(onStep)

  React.useEffect(
    () => bindRepeat(button.current!, { repeat: 80, onStep: () => step() }),
    []
  )

  return (
    <button
      ref={button}
      type="button"
      data-variant="outline"
      aria-label={label}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Example() {
  const [zoom, setZoom] = React.useState(100)

  const zoomBy = (amount: number) => {
    const next = Math.min(Math.max(zoom + amount, min), max)
    setZoom(next)
    return next > min && next < max
  }

  return (
    <div data-slot="row">
      <ZoomButton
        label="Zoom Out"
        disabled={zoom === min}
        onStep={() => zoomBy(-5)}
      >
        <MinusIcon aria-hidden />
      </ZoomButton>
      <output aria-live="polite" data-slot="hold-zoom">
        {zoom}%
      </output>
      <ZoomButton
        label="Zoom In"
        disabled={zoom === max}
        onStep={() => zoomBy(5)}
      >
        <PlusIcon aria-hidden />
      </ZoomButton>
    </div>
  )
}
