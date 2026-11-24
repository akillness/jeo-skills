import * as React from "react"
import {
  bindDrag,
  bindDragPreview,
  createChange,
  definePrimitive,
  dragThreshold,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type TaggerState = { value: string[]; over: boolean }

type TaggerOptions = {
  onValueChange?: (
    value: string[],
    details: ChangeDetails<"drag" | "item-press">
  ) => void
}

const tagger = definePrimitive({
  name: "tagger",
  options: { onValueChange: "callback" },
  state: (_options: TaggerOptions): TaggerState => ({ value: [], over: false }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const add = (
      tag: string,
      details: { reason: "drag" | "item-press"; event?: Event }
    ) =>
      !store.get().value.includes(tag) &&
      change("value", [...store.get().value, tag], details)
    let stop: (() => void) | undefined
    context.onDestroy(() => stop?.())
    return {
      pointerdown(event: PointerEvent, el: HTMLElement, tag: string) {
        if (event.button !== 0) {
          return
        }
        const note = context.element("note")
        let preview: ReturnType<typeof bindDragPreview> | undefined
        const isOver = (x: number, y: number) => {
          const box = note?.getBoundingClientRect()
          return (
            !!box &&
            x >= box.left &&
            x <= box.right &&
            y >= box.top &&
            y <= box.bottom
          )
        }
        stop?.()
        stop = bindDrag(el, event, {
          threshold: dragThreshold,
          cancelOnEscape: true,
          onStart: () => {
            preview = bindDragPreview(el, {
              x: event.clientX,
              y: event.clientY,
            })
          },
          onMove: ({ x, y }) => {
            const over = isOver(x, y)
            preview?.move(x, y)
            preview?.el.toggleAttribute("data-over", over)
            store.set({ over })
          },
          onEnd: (end, canceled) => {
            const { over } = store.get()
            preview?.remove()
            stop = undefined
            store.set({ over: false })
            if (preview && over && !canceled) {
              add(tag, { reason: "drag", event: end })
            }
          },
        })
      },
      keydown(event: KeyboardEvent, tag: string) {
        if (event.key !== "Enter") {
          return
        }
        event.preventDefault()
        add(tag, { reason: "item-press", event })
      },
    }
  },
  slots: (slot) => ({
    tag: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        type: "button",
        style: "touch-action:none;user-select:none",
      }),
      on: {
        pointerdown: (event, { el, api, key }) =>
          api.pointerdown(event, el!, key),
        keydown: (event, { api, key }) => api.keydown(event, key),
      },
    }),
    note: slot<{}, { tags: string[] }>({
      state: (state) => ({ tags: state.value }),
      attrs: (state) => ({ "data-over": state.over ? "" : undefined }),
    }),
  }),
})

const parts = createParts(tagger, { tag: "button", note: "div" })

const Tagger = parts.Root

const TaggerTag = parts.Tag

const TaggerNote = parts.Note

function Example() {
  return (
    <Tagger>
      <div data-slot="stack">
        <div data-slot="row">
          {["Urgent", "Design", "Later"].map((tag) => (
            <TaggerTag data-size="sm" key={tag} value={tag}>
              {tag}
            </TaggerTag>
          ))}
        </div>
        <TaggerNote aria-label="Note">
          {({ tags }) => (
            <>
              <span data-slot="label">Launch plan</span>
              <div data-slot="row">
                {tags.length ? (
                  tags.map((tag) => (
                    <span key={tag} data-slot="badge">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span data-slot="hint">Drag a tag here.</span>
                )}
              </div>
            </>
          )}
        </TaggerNote>
      </div>
    </Tagger>
  )
}

export { Example }
