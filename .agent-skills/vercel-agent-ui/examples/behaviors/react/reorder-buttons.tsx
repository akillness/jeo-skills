import * as React from "react"
import {
  createChange,
  createReorder,
  createRovingFocus,
  definePrimitive,
  type ReorderDraft,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"

type RecipeState = {
  value: string[]
  focused: string | null
  moving: ReorderDraft | null
}

const recipe = definePrimitive({
  name: "recipe",
  state: (): RecipeState => ({
    value: ["Boil water", "Add pasta", "Make the sauce", "Drain", "Serve"],
    focused: "Boil water",
    moving: null,
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const reorder = createReorder<RecipeState>(context, {
      slot: "step",
      key: "value",
      draft: "moving",
      set: (value, details) => change("value", value, details),
    })
    return {
      roving: createRovingFocus<RecipeState, { value: string }>(context, {
        slot: "step",
        key: "focused",
      }),
      reorder,
      act(action: string) {
        const { focused, moving } = store.get()
        if (action === "grab" && focused) {
          reorder.grab(focused)
        } else if (moving && (action === "up" || action === "down")) {
          const index = moving.order.indexOf(moving.key)
          reorder.moveTo(index + (action === "up" ? -1 : 1))
        } else if (action === "drop") {
          reorder.drop()
        } else if (action === "cancel") {
          reorder.cancel()
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, { order: string[] }>({
      state: (state, { api }) => ({ order: api.reorder.order(state) }),
    }),
    list: slot({
      attrs: () => ({
        role: "listbox",
        "aria-roledescription": "sortable list",
      }),
    }),
    step: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        role: "option",
        "aria-roledescription": "sortable item",
        "aria-selected": String(state.moving?.key === part.key),
        tabindex: part.api.roving.tabIndex(state, part),
        "data-grabbed": state.moving?.key === part.key ? "" : undefined,
        style: "touch-action:none;user-select:none",
      }),
      on: {
        keydown: (event, { el, api, key }) =>
          api.reorder.keydown(event, key) || api.roving.keydown(event, el!),
        pointerdown: (event, { api, key }) =>
          api.reorder.pointerdown(event, key),
      },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.reorder.bind(el, part),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
    toTop: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (_state, part) => ({
        type: "button",
        tabindex: "-1",
        "aria-label": `Move ${part.key} to top`,
      }),
      on: { pointerdown: (event) => event.preventDefault() },
      press: ({ api, key }) => api.reorder.move(key, 0),
    }),
    action: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        disabled: (part.key === "grab") === !!state.moving ? "" : undefined,
      }),
      on: { pointerdown: (event) => event.preventDefault() },
      press: ({ api, key }) => api.act(key),
    }),
  }),
})

const parts = createParts(recipe, {
  root: "div",
  list: "div",
  step: "div",
  toTop: "button",
  action: "button",
})

const Recipe = parts.Root

const RecipeList = parts.List

const RecipeStep = parts.Step

const RecipeToTop = parts.ToTop

const RecipeAction = parts.Action

function Example() {
  return (
    <Recipe>
      {({ order }) => (
        <>
          <div data-slot="controls">
            <RecipeAction data-size="sm" value="grab">
              Pick Up
            </RecipeAction>
            <RecipeAction data-size="sm" value="up" aria-label="Move up">
              <ArrowUpIcon aria-hidden="true" />
            </RecipeAction>
            <RecipeAction data-size="sm" value="down" aria-label="Move down">
              <ArrowDownIcon aria-hidden="true" />
            </RecipeAction>
            <RecipeAction data-size="sm" value="drop">
              Drop
            </RecipeAction>
            <RecipeAction data-size="sm" value="cancel">
              Cancel
            </RecipeAction>
          </div>
          <RecipeList aria-label="Recipe">
            {order.map((step) => (
              <RecipeStep key={step} value={step}>
                {step}
                <RecipeToTop value={step}>
                  <ArrowUpIcon aria-hidden="true" />
                  Top
                </RecipeToTop>
              </RecipeStep>
            ))}
          </RecipeList>
        </>
      )}
    </Recipe>
  )
}

export { Example }
