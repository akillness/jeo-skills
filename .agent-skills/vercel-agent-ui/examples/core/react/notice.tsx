import * as React from "react"
import {
  createChange,
  definePrimitive,
  isDismissal,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type NoticeOptions = {
  defaultOpen?: boolean
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<"close-press" | "escape-key">
  ) => void
}

type NoticeState = { open: boolean }

const notice = definePrimitive({
  name: "notice",
  options: { defaultOpen: "boolean", onOpenChange: "callback" },
  state: (options: NoticeOptions): NoticeState => ({
    open: options.defaultOpen ?? true,
  }),
  api: (context) => {
    const change = createChange(context)
    return {
      close: (
        details:
          | { reason: "close-press"; event?: Event }
          | { reason: "escape-key"; event: KeyboardEvent }
      ) => change("open", false, details),
    }
  },
  slots: (slot) => ({
    root: slot<{}>({
      present: (state) => state.open,
      attrs: () => ({ role: "region" }),
      on: {
        keydown: (event, { api }) => {
          if (event.key === "Escape") {
            api.close({ reason: "escape-key", event })
          }
        },
      },
    }),
    close: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }, event) => api.close({ reason: "close-press", event }),
    }),
  }),
})

const parts = createParts(notice, { root: "div", close: "button" })

const Notice = parts.Root

const NoticeClose = parts.Close

function Example() {
  const log = useLog()
  const [round, setRound] = React.useState(0)
  const [strict, setStrict] = React.useState(false)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <input
            type="checkbox"
            checked={strict}
            onChange={(event) => setStrict(event.target.checked)}
          />
          Close only with the button
        </label>
        <button type="button" onClick={() => setRound((count) => count + 1)}>
          Show Tip Again
        </button>
      </div>
      <Notice
        key={round}
        aria-label="Tip"
        onOpenChange={(_open, details) => {
          if (strict && isDismissal(details.reason)) {
            details.cancel()
          }
          log(`Close: ${details.reason}${details.canceled ? ", canceled" : ""}`)
        }}
      >
        <p>Press Escape here, or use the button, to close this tip.</p>
        <NoticeClose data-size="sm">Got It</NoticeClose>
      </Notice>
    </div>
  )
}

export {
  Example,
  notice,
  Notice,
  NoticeClose,
  type NoticeOptions,
  type NoticeState,
}
