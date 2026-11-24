import * as React from "react"
import {
  createFocusRecovery,
  createRovingFocus,
  definePrimitive,
  selects,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type TasksState = { focused: string | null }

type TaskProps = { value: string; index: number }

const tasks = definePrimitive({
  name: "tasks",
  state: (): TasksState => ({ focused: null }),
  api: (context) => {
    const roving = createRovingFocus<TasksState, TaskProps>(context, {
      slot: "task",
      key: "focused",
    })
    const recovery = createFocusRecovery<TaskProps>({
      fallback: (lost) => {
        const items = roving.items()
        return (items[lost.props.index] ?? items.at(-1))?.el
      },
    })
    return { roving, recovery }
  },
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "list" }) }),
    task: slot<TaskProps>({
      props: { value: "string", index: "number" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        role: "listitem",
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: { keydown: (event, { el, api }) => api.roving.keydown(event, el!) },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.recovery.bind(el, part),
        ]
        return () => cleanups.forEach((cleanup) => cleanup?.())
      },
    }),
  }),
})

const parts = createParts(tasks, { root: "div", task: "div" })

const Tasks = parts.Root

const TasksItem = parts.Task

function Example() {
  const [list, setList] = React.useState([
    "Write the intro",
    "Add examples",
    "Fix the links",
    "Ship it",
  ])
  const done = (task: string) =>
    setList((current) => current.filter((other) => other !== task))
  return (
    <Tasks aria-label="Tasks">
      {list.map((task, index) => (
        <TasksItem
          key={task}
          value={task}
          index={index}
          onKeyDown={(event) => event.key === "Delete" && done(task)}
        >
          {task}
          <button
            type="button"
            tabIndex={-1}
            data-variant="ghost"
            data-size="sm"
            onClick={() => done(task)}
          >
            Done
          </button>
        </TasksItem>
      ))}
      {!list.length && <p data-slot="hint">All done.</p>}
    </Tasks>
  )
}

export { Example, tasks, Tasks, TasksItem, type TaskProps, type TasksState }
