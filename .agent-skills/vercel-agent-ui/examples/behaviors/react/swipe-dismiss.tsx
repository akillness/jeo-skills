import * as React from "react"
import { bindDrag, dragThreshold } from "@ui-sdk/core"
import { scrubTo } from "@ui-sdk/core/number"
import { XIcon } from "lucide-react"

const initial = [
  { id: 1, title: "Event created", body: "Design review, Friday at 10:00" },
  { id: 2, title: "Invite sent", body: "Inès Moreau can now edit" },
  { id: 3, title: "Upload finished", body: "launch-video.mp4 is ready" },
]

type Toast = (typeof initial)[number]

function SwipeToast({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: () => void
}) {
  const [offset, setOffset] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const [dismissing, setDismissing] = React.useState(false)
  const stop = React.useRef<(() => void) | undefined>(undefined)
  React.useEffect(() => () => stop.current?.(), [])

  const dismiss = (side: number, width: number) => {
    setOffset(side * width)
    setTimeout(onDismiss, 200)
  }

  const pointerdown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) {
      return
    }
    const width = event.currentTarget.offsetWidth
    const keeps = {
      min: -width,
      max: width,
      step: 1,
      snap: { points: [0], threshold: width * 0.3 },
    }
    const startX = event.clientX
    let moved = 0
    stop.current?.()
    stop.current = bindDrag(event.currentTarget, event.nativeEvent, {
      threshold: dragThreshold,
      cancelOnEscape: true,
      onStart: () => setDragging(true),
      onMove: ({ x }) => {
        moved = x - startX
        setOffset(moved)
        setDismissing(scrubTo(moved, keeps).point === undefined)
      },
      onEnd: (_end, canceled) => {
        stop.current = undefined
        setDragging(false)
        setDismissing(false)
        if (!canceled && scrubTo(moved, keeps).point === undefined) {
          dismiss(Math.sign(moved), width)
        } else {
          setOffset(0)
        }
      },
    })
  }

  return (
    <li data-slot="dismiss-item">
      <div
        aria-hidden
        data-slot="dismiss-layer"
        data-side={offset < 0 ? "end" : "start"}
        data-dismissing={dismissing || undefined}
        hidden={!dragging}
      >
        {dismissing ? "Release to dismiss" : "Dismiss"}
      </div>
      <div
        data-slot="dismiss-toast"
        data-dragging={dragging || undefined}
        onPointerDown={pointerdown}
        style={{ "--dismiss-x": `${offset}px` } as React.CSSProperties}
      >
        <div data-slot="stack">
          <span>{toast.title}</span>
          <span data-slot="hint">{toast.body}</span>
        </div>
        <button
          type="button"
          data-variant="ghost"
          data-size="sm"
          aria-label={`Dismiss ${toast.title}`}
          onClick={(event) =>
            dismiss(1, event.currentTarget.parentElement!.offsetWidth)
          }
        >
          <XIcon aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

function Example() {
  const [toasts, setToasts] = React.useState(initial)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          onClick={() => setToasts(initial)}
          disabled={toasts.length === initial.length}
        >
          Show All
        </button>
      </div>
      <ul data-slot="dismiss-list" aria-label="Notifications">
        {toasts.map((toast) => (
          <SwipeToast
            key={toast.id}
            toast={toast}
            onDismiss={() =>
              setToasts((current) =>
                current.filter((candidate) => candidate.id !== toast.id)
              )
            }
          />
        ))}
      </ul>
    </div>
  )
}

export { Example }
