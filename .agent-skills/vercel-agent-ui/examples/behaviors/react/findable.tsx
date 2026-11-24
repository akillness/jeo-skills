import * as React from "react"
import {
  bindFindable,
  definePrimitive,
  hiddenAttrs,
  supportsHiddenUntilFound,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"

type RecipeState = { shown: boolean }

const recipe = definePrimitive({
  name: "recipe",
  state: (): RecipeState => ({ shown: false }),
  api: (context) => ({
    toggle: () => context.store.set({ shown: !context.store.get().shown }),
    show: () => context.store.set({ shown: true }),
  }),
  slots: (slot) => ({
    root: slot<{}, { shown: boolean; findable: boolean }>({
      state: (state) => ({
        shown: state.shown,
        findable: supportsHiddenUntilFound(),
      }),
    }),
    toggle: slot({
      attrs: (state, { id }) => ({
        type: "button",
        "aria-expanded": String(state.shown),
        "aria-controls": `${id}-method`,
      }),
      press: ({ api }) => api.toggle(),
    }),
    method: slot({
      attrs: (state, { id }) => ({
        id: `${id}-method`,
        ...hiddenAttrs(state.shown, true),
      }),
      bind: (el, { api, store }) => {
        const findable = bindFindable(el, {
          shown: () => store.get().shown,
          findable: () => true,
          reveal: () => api.show(),
        })
        const unsubscribe = store.subscribe(findable.check)
        return () => {
          unsubscribe()
          findable()
        }
      },
    }),
  }),
})

const parts = createParts(recipe, {
  root: "div",
  toggle: "button",
  method: "div",
})

const Recipe = parts.Root

const RecipeToggle = parts.Toggle

const RecipeMethod = parts.Method

function Example() {
  return (
    <Recipe>
      {({ shown, findable }) => (
        <>
          <p data-slot="label">Tomato soup</p>
          <RecipeToggle data-size="sm">
            {shown ? "Hide Method" : "Show Method"}
          </RecipeToggle>
          <div data-slot="findable-method">
            <RecipeMethod>
              Soften the onion in butter, add the tomatoes and stock, and simmer
              for twenty minutes. Blend until smooth.
            </RecipeMethod>
          </div>
          <p data-findable data-slot="hint">
            {findable
              ? "Find in page can show the method."
              : "This browser can't find hidden text."}
          </p>
        </>
      )}
    </Recipe>
  )
}

export { Example, recipe, Recipe, RecipeMethod, type RecipeState, RecipeToggle }
