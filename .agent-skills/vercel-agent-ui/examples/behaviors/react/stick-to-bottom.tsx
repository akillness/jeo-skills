import * as React from "react"
import {
  createStickToBottom,
  css,
  definePrimitive,
  type StickToBottomState,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type BuildLogJumpState = {
  away: boolean
  unseen: boolean
}

const buildLog = definePrimitive({
  name: "build-log",
  state: (): StickToBottomState => ({
    following: true,
    unseen: false,
    atBottom: true,
  }),
  api: (context) => {
    const stick = createStickToBottom({
      onChange: (state) => context.store.set(state),
    })
    return { stick }
  },
  slots: (slot) => ({
    root: slot({}),
    log: slot({
      attrs: () => ({
        role: "log",
        tabindex: "0",
        style: css({ overflow: "auto" }),
      }),
      bind: (el, { api }) => api.stick.connect(el),
    }),
    jump: slot<{}, BuildLogJumpState>({
      state: (state) => ({
        away: !state.following && !state.atBottom,
        unseen: state.unseen,
      }),
      attrs: (state) => ({
        type: "button",
        hidden: !state.following && !state.atBottom ? undefined : "",
        "data-unseen": state.unseen ? "" : undefined,
      }),
      press: ({ api }) => api.stick.scrollToBottom({ behavior: "smooth" }),
    }),
  }),
})

const parts = createParts(buildLog, { root: "div", log: "div", jump: "button" })

const BuildLog = parts.Root

const BuildLogLines = parts.Log

const BuildLogJump = parts.Jump

const steps = [
  "Resolving packages",
  "Compiling",
  "Bundling",
  "Checking types",
  "Running tests",
]

function Example() {
  const [lines, setLines] = React.useState<string[]>([])
  React.useEffect(() => {
    const timer = setInterval(() => {
      setLines((current) => {
        if (current.length >= 80) {
          clearInterval(timer)
          return [...current, "Done in 24s."]
        }
        return [
          ...current,
          `${steps[current.length % steps.length]} (${current.length + 1}/80)`,
        ]
      })
    }, 250)
    return () => clearInterval(timer)
  }, [])
  return (
    <BuildLog>
      <BuildLogLines aria-label="Build output">
        {lines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </BuildLogLines>
      <BuildLogJump data-size="sm">Jump to latest</BuildLogJump>
    </BuildLog>
  )
}

export {
  buildLog,
  BuildLog,
  BuildLogJump,
  BuildLogLines,
  Example,
  type BuildLogJumpState,
}
