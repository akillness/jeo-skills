import {
  Timeline,
  TimelineConnector,
  TimelineDescription,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
} from "@ui-sdk/solid/timeline"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const updates = [
  {
    id: 1,
    author: "Ada",
    date: "2026-11-10",
    time: "Nov 10",
    text: "Shipped the new onboarding flow.",
  },
  {
    id: 2,
    author: "Grace",
    date: "2026-11-10",
    time: "Nov 10",
    text: "Fixed the flaky upload test.",
  },
  {
    id: 3,
    author: "Linus",
    date: "2026-11-09",
    time: "Nov 9",
    text: "Moved the docs to the new theme.",
  },
  {
    id: 4,
    author: "Margaret",
    date: "2026-11-09",
    time: "Nov 9",
    text: "Wrote the launch checklist.",
  },
  {
    id: 5,
    author: "Ada",
    date: "2026-11-08",
    time: "Nov 8",
    text: "Cut search latency in half.",
  },
  {
    id: 6,
    author: "Grace",
    date: "2026-11-07",
    time: "Nov 7",
    text: "Added keyboard shortcuts to the editor.",
  },
  {
    id: 7,
    author: "Linus",
    date: "2026-11-06",
    time: "Nov 6",
    text: "Cleaned up the old billing code.",
  },
  {
    id: 8,
    author: "Margaret",
    date: "2026-11-05",
    time: "Nov 5",
    text: "Ran the accessibility review.",
  },
  {
    id: 9,
    author: "Ada",
    date: "2026-11-04",
    time: "Nov 4",
    text: "Started the mobile layout.",
  },
]

const pageSize = 3

function Example() {
  const log = useLog()
  const [count, setCount] = createSignal(pageSize)
  const [busy, setBusy] = createSignal(false)

  function loadMore() {
    setBusy(true)
    setTimeout(() => {
      setCount((count) => count + pageSize)
      setBusy(false)
      log(`Loaded ${pageSize} more updates`)
    }, 600)
  }

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          disabled={busy() || count() >= updates.length}
          onClick={loadMore}
        >
          {busy() ? "Loading…" : "Load More"}
        </button>
      </div>
      <Timeline feed busy={busy()} aria-label="Team updates">
        <For each={updates.slice(0, count())}>
          {(update) => (
            <TimelineItem>
              <TimelineMarker />
              <TimelineConnector />
              <TimelineTitle>{update.author}</TimelineTitle>
              <TimelineTime datetime={update.date}>{update.time}</TimelineTime>
              <TimelineDescription>{update.text}</TimelineDescription>
            </TimelineItem>
          )}
        </For>
      </Timeline>
    </div>
  )
}

export { Example }
