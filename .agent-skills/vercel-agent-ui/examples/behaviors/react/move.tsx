import * as React from "react"
import {
  createChange,
  createMove,
  createRovingFocus,
  css,
  definePrimitive,
  live,
  spatialMove,
  type ChangeDetails,
  type MoveDraft,
  type MovePoint,
  type MoveReason,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

const emoji: Record<string, string> = {
  Cactus: "🌵",
  Lemon: "🍋",
  Rocket: "🚀",
}

type StickersState = {
  positions: Record<string, MovePoint>
  focused: string | null
  moving: MoveDraft | null
}

type StickersOptions = {
  defaultPositions: Record<string, MovePoint>
  onPositionsChange?: (
    positions: Record<string, MovePoint>,
    details: ChangeDetails<MoveReason>
  ) => void
}

const stickers = definePrimitive({
  name: "stickers",
  options: { defaultPositions: "value", onPositionsChange: "callback" },
  state: (options: StickersOptions): StickersState => ({
    positions: options.defaultPositions,
    focused: null,
    moving: null,
  }),
  live: ["moving"],
  api: (context) => {
    const change = createChange(context)
    return {
      roving: createRovingFocus<StickersState, { value: string }>(context, {
        slot: "sticker",
        key: "focused",
        move: spatialMove(),
      }),
      move: createMove<StickersState>(context, {
        key: "positions",
        draft: "moving",
        set: (value, details) => change("positions", value, details),
        step: () => 4,
        bounds: () => ({ minX: 0, minY: 0, maxX: 216, maxY: 120 }),
      }),
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: () => ({ role: "group", style: "position:relative" }),
    }),
    sticker: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => {
        const at = state.positions[part.key] ?? { x: 0, y: 0 }
        return {
          tabindex: part.api.roving.tabIndex(state, part),
          style: css({
            position: "absolute",
            left: `${at.x}px`,
            top: `${at.y}px`,
            "touch-action": "none",
          }),
        }
      },
      live: live<StickersState, any, { value: string }>(
        (state, { api, key }) => ({
          "data-dragging": api.move.dragging(state, key) ? "" : undefined,
          style: api.move.style(state, key),
        })
      ),
      on: {
        keydown: (event, { el, api, key }) =>
          api.move.keydown(event, key) || api.roving.keydown(event, el!),
        pointerdown: (event, { el, api, key }) =>
          api.move.pointerdown(event, key, el!),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(stickers, { root: "div", sticker: "div" })

const Stickers = parts.Root

const StickersItem = parts.Sticker

function Example() {
  const log = useLog()
  const positions = React.useRef<Record<string, MovePoint>>({
    Cactus: { x: 24, y: 28 },
    Lemon: { x: 108, y: 96 },
    Rocket: { x: 192, y: 20 },
  })
  return (
    <Stickers
      aria-label="Stickers"
      defaultPositions={positions.current}
      onPositionsChange={(next, details) => {
        for (const [sticker, at] of Object.entries(next)) {
          const was = positions.current[sticker]
          if (was.x !== at.x || was.y !== at.y) {
            log(`${sticker} moved to ${at.x}, ${at.y} (${details.reason})`)
          }
        }
        positions.current = next
      }}
    >
      {Object.keys(positions.current).map((sticker) => (
        <StickersItem key={sticker} value={sticker} aria-label={sticker}>
          {emoji[sticker]}
        </StickersItem>
      ))}
    </Stickers>
  )
}

export { Example }
