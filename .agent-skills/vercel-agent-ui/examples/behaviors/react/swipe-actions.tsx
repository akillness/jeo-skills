import * as React from "react"
import {
  createRovingFocus,
  createSwipeActions,
  css,
  definePrimitive,
  live,
  selects,
  type SwipeDraft,
  type SwipeOpen,
  type SwipeSide,
} from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"

type RowsState = {
  open: SwipeOpen | null
  swiping: SwipeDraft | null
  focused: string | null
}

const rows = definePrimitive({
  name: "rows",
  state: (): RowsState => ({ open: null, swiping: null, focused: null }),
  live: ["swiping"],
  api: (context) => ({
    roving: createRovingFocus<RowsState, { value: string }>(context, {
      slot: "row",
      key: "focused",
    }),
    swipe: createSwipeActions<RowsState>(context, {
      key: "open",
      draft: "swiping",
    }),
  }),
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "list" }) }),
    row: slot<{ value: string }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        role: "listitem",
        tabindex: part.api.roving.tabIndex(state, part),
        "data-open": state.open?.key === part.key ? state.open.side : undefined,
        style: css({
          position: "relative",
          overflow: "hidden",
          "touch-action": "pan-y",
        }),
      }),
      on: {
        pointerdown: (event, { el, api, key }) =>
          api.swipe.pointerdown(event, key, el!),
        keydown: (event, { el, api, key }) =>
          api.swipe.keydown(event, key) ||
          (event.target === el && api.roving.keydown(event, el!)),
      },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.swipe.bindRow(el, part.key),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
    content: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        style: css({
          position: "relative",
          "z-index": "1",
          transform: "translateX(var(--swipe-x, 0px))",
        }),
      }),
      live: live<RowsState, any, { value: string }>((state, { api, key }) =>
        api.swipe.contentAttrs(state, key)
      ),
    }),
    actions: slot<{ id: string; row: string; side: SwipeSide }>({
      props: { row: "string", side: "string" },
      attrs: (state, { props, api }) => ({
        ...api.swipe.actionsAttrs(state, props.row, props.side),
        style: css({
          position: "absolute",
          top: "0",
          bottom: "0",
          [props.side === "start" ? "inset-inline-start" : "inset-inline-end"]:
            "0",
          display: "flex",
        }),
      }),
      bind: (el, { props, api }) =>
        api.swipe.bindActions(el, props.row, props.side),
    }),
  }),
})

const parts = createParts(rows, { root: "div", row: "div", content: "div" })

const Rows = parts.Root

const RowsItem = parts.Row

const RowsContent = parts.Content

function RowsActions({
  row,
  side,
  ...props
}: { row: string; side: SwipeSide } & PartProps<"div">) {
  return usePart(
    rows,
    "actions",
    { id: `${row}-${side}`, row, side },
    props,
    "div"
  )
}

function Example() {
  const [items, setItems] = React.useState([
    "Team lunch on Friday",
    "Your invoice is ready",
    "New comment on the docs",
  ])
  return (
    <Rows aria-label="Messages">
      {items.map((item) => (
        <RowsItem key={item} value={item}>
          <RowsContent value={item}>{item}</RowsContent>
          <RowsActions row={item} side="end">
            <button
              type="button"
              tabIndex={-1}
              data-variant="destructive"
              onClick={() =>
                setItems((current) => current.filter((other) => other !== item))
              }
            >
              Delete
            </button>
          </RowsActions>
        </RowsItem>
      ))}
    </Rows>
  )
}

export { Example }
