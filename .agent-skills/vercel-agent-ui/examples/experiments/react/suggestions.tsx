import * as React from "react"
import {
  createChange,
  createRovingFocus,
  css,
  definePrimitive,
  dispatch,
  live,
  selects,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createAgent } from "@ui-sdk/react/agent"
import { elementOf } from "@ui-sdk/react/observe"
import { createParts } from "@ui-sdk/react/primitive"
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/react/slider"
import { Switch, SwitchThumb } from "@ui-sdk/react/switch"
import { stageChanges } from "@ui-sdk/react/history"
import { CheckIcon, XIcon } from "lucide-react"

type Agent = ReturnType<typeof createAgent>

type Suggestion = {
  id: string
  ref: string
  key?: string
  value: unknown
  reason?: string
}

type SuggestionStatus = "pending" | "accepted" | "rejected"

type SuggestionsState = {
  suggestions: Suggestion[]
  status: Record<string, SuggestionStatus>
  previewing: string | null
  spot: { left: number; top: number; width: number; height: number } | null
  focused: string | null
}

type SuggestionsDecisionReason = "item-press" | "imperative"

type SuggestionsOptions = {
  agent: Agent
  suggestions: Suggestion[]
  status?: Record<string, SuggestionStatus>
  defaultStatus?: Record<string, SuggestionStatus>
  onStatusChange?: (
    status: Record<string, SuggestionStatus>,
    details: ChangeDetails<SuggestionsDecisionReason>
  ) => void
  onAccept?: (
    suggestion: Suggestion,
    details: ChangeDetails<SuggestionsDecisionReason>
  ) => void
  onReject?: (
    suggestion: Suggestion,
    details: ChangeDetails<SuggestionsDecisionReason>
  ) => void
}

type SuggestionsListState = {
  pending: number
  previewing: string | null
}
type SuggestionsItemState = {
  suggestion: Suggestion | undefined
  status: SuggestionStatus
  previewing: boolean
}
type SuggestionsAcceptAllState = { disabled: boolean }

function showValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(", ") || "none"
  }
  if (typeof value === "boolean") {
    return value ? "on" : "off"
  }
  return String(value)
}

const statusOf = (state: SuggestionsState, id: string) =>
  state.status[id] ?? "pending"
const anyPending = (state: SuggestionsState) =>
  state.suggestions.some((s) => statusOf(state, s.id) === "pending")

const suggestions = /* @__PURE__ */ definePrimitive({
  name: "suggestions",
  options: {
    agent: "value",
    suggestions: "value",
    status: "value",
    defaultStatus: "value",
    onStatusChange: "callback",
    onAccept: "callback",
    onReject: "callback",
  },
  state: (options: SuggestionsOptions): SuggestionsState => ({
    suggestions: options.suggestions,
    status: options.status ?? options.defaultStatus ?? {},
    previewing: null,
    spot: null,
    focused: null,
  }),
  sync: (options) => ({
    suggestions: options.suggestions,
    ...(options.status === undefined ? {} : { status: options.status }),
  }),
  controlled: ["status"],
  live: ["spot"],
  api: (context) => {
    const { store, options, onDestroy } = context
    const change = createChange(context)
    const roving = createRovingFocus<SuggestionsState, { value: string }>(
      context,
      {
        slot: "item",
        key: "focused",
      }
    )
    let queue: Promise<unknown> = Promise.resolve()
    const run = (task: () => Promise<unknown>) =>
      (queue = queue.then(task, task))
    let staged: {
      id: string
      revert: () => Promise<unknown>
      ref?: string
    } | null = null

    const get = (id: string) => store.get().suggestions.find((s) => s.id === id)
    const stage = async (suggestion: Suggestion) => {
      const done = await stageChanges(options().agent, [
        { ref: suggestion.ref, key: suggestion.key, value: suggestion.value },
      ])
      return {
        id: suggestion.id,
        revert: done.revert,
        ref: done.applied[0]?.ref,
      }
    }
    const place = () => {
      const el = staged?.ref ? elementOf(staged.ref) : undefined
      if (!el) {
        return store.set({ spot: null })
      }
      const box = el.getBoundingClientRect()
      store.set({
        spot: {
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        },
      })
    }
    const restore = async () => {
      const current = staged
      staged = null
      await current?.revert()
    }
    onDestroy(() => void restore())

    const decide = (
      id: string,
      status: SuggestionStatus,
      details: { reason: SuggestionsDecisionReason; event?: Event }
    ) => change("status", { ...store.get().status, [id]: status }, details)

    const api = {
      roving,
      preview(id: string) {
        return run(async () => {
          const suggestion = get(id)
          if (
            !suggestion ||
            statusOf(store.get(), id) !== "pending" ||
            store.get().previewing === id
          ) {
            return
          }
          await restore()
          store.set({ previewing: id })
          staged = await stage(suggestion)
          place()
        })
      },
      unpreview(id?: string) {
        return run(async () => {
          if (id && store.get().previewing !== id) {
            return
          }
          store.set({ previewing: null, spot: null })
          await restore()
        })
      },
      accept(
        id: string,
        details: { reason: SuggestionsDecisionReason; event?: Event } = {
          reason: "imperative",
        }
      ) {
        return run(async () => {
          const suggestion = get(id)
          if (!suggestion || statusOf(store.get(), id) !== "pending") {
            return
          }
          if (staged?.id === id) {
            staged = null
          } else {
            await restore()
            await stage(suggestion)
          }
          store.set({ previewing: null, spot: null })
          if (decide(id, "accepted", details)) {
            dispatch(context, "onAccept", suggestion, details)
          }
        })
      },
      reject(
        id: string,
        details: { reason: SuggestionsDecisionReason; event?: Event } = {
          reason: "imperative",
        }
      ) {
        return run(async () => {
          const suggestion = get(id)
          if (!suggestion || statusOf(store.get(), id) !== "pending") {
            return
          }
          if (store.get().previewing === id) {
            store.set({ previewing: null, spot: null })
            await restore()
          }
          if (decide(id, "rejected", details)) {
            dispatch(context, "onReject", suggestion, details)
          }
        })
      },
      acceptAll(
        details: { reason: SuggestionsDecisionReason; event?: Event } = {
          reason: "imperative",
        }
      ) {
        for (const suggestion of store.get().suggestions) {
          if (statusOf(store.get(), suggestion.id) === "pending") {
            void api.accept(suggestion.id, details)
          }
        }
        return queue
      },
      place,
      itemKeydown(event: KeyboardEvent, el: HTMLElement, id: string) {
        if (event.key === "Enter") {
          event.preventDefault()
          void api.accept(id, { reason: "item-press", event })
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault()
          void api.reject(id, { reason: "item-press", event })
        } else if (event.key === "Escape") {
          void api.unpreview()
        } else {
          roving.keydown(event, el)
        }
      },
    }
    return api
  },
  slots: (slot) => ({
    list: slot<{}, SuggestionsListState>({
      state: (state) => ({
        pending: state.suggestions.filter(
          (s) => statusOf(state, s.id) === "pending"
        ).length,
        previewing: state.previewing,
      }),
      attrs: () => ({
        role: "listbox",
        "aria-roledescription": "suggestions",
        "aria-orientation": "vertical",
      }),
      on: {
        focusout: (event, { el, api }) => {
          if (!el?.contains(event.relatedTarget as Node)) {
            void api.unpreview()
          }
        },
        pointerleave: (_event, { el, api }) => {
          if (!el?.contains(document.activeElement)) {
            void api.unpreview()
          }
        },
      },
    }),
    item: slot<{ value: string }, SuggestionsItemState>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key }) => ({
        suggestion: state.suggestions.find((s) => s.id === key),
        status: statusOf(state, key),
        previewing: state.previewing === key,
      }),
      attrs: (state, part) => {
        const status = statusOf(state, part.key)
        return {
          role: "option",
          "aria-selected": String(state.previewing === part.key),
          "aria-disabled": status === "pending" ? undefined : "true",
          "aria-keyshortcuts": "Enter Delete",
          tabindex: part.api.roving.tabIndex(state, part),
          "data-status": status,
          "data-previewing": state.previewing === part.key ? "" : undefined,
        }
      },
      on: {
        keydown: (event, { el, api, key }) =>
          el && api.itemKeydown(event, el, key),
        focus: (_event, { api, key }) => void api.preview(key),
        pointerenter: (_event, { api, key }) => void api.preview(key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    accept: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", tabindex: "-1" }),
      press: ({ api, props }, event) =>
        void api.accept(props.value, { reason: "item-press", event }),
    }),
    reject: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", tabindex: "-1" }),
      press: ({ api, props }, event) =>
        void api.reject(props.value, { reason: "item-press", event }),
    }),
    "accept-all": slot<{}, SuggestionsAcceptAllState>({
      state: (state) => ({ disabled: !anyPending(state) }),
      attrs: (state) => ({
        type: "button",
        disabled: anyPending(state) ? undefined : "",
      }),
      press: ({ api }, event) =>
        void api.acceptAll({ reason: "item-press", event }),
    }),
    spotlight: slot({
      present: (state) => !!state.previewing,
      attrs: () => ({ "aria-hidden": "true" }),
      live: live<SuggestionsState, any, {}>((state) =>
        state.spot
          ? {
              "data-placed": "",
              style: css({
                position: "fixed",
                "pointer-events": "none",
                left: `${state.spot.left}px`,
                top: `${state.spot.top}px`,
                width: `${state.spot.width}px`,
                height: `${state.spot.height}px`,
              }),
            }
          : { style: css({ display: "none" }) }
      ),
      bind: (_el, { api }) => {
        const update = () => api.place()
        addEventListener("scroll", update, true)
        addEventListener("resize", update)
        return () => {
          removeEventListener("scroll", update, true)
          removeEventListener("resize", update)
        }
      },
    }),
  }),
})

const parts = createParts(suggestions, {
  list: "div",
  item: "div",
  accept: "button",
  reject: "button",
  "accept-all": "button",
  spotlight: "div",
})

const Suggestions = parts.Root

const SuggestionsList = parts.List

const SuggestionsItem = parts.Item

const SuggestionsAccept = parts.Accept

const SuggestionsReject = parts.Reject

const SuggestionsAcceptAll = parts.AcceptAll

const SuggestionsSpotlight = parts.Spotlight

const agent = createAgent()

const proposed: Suggestion[] = [
  {
    id: "volume",
    ref: "Volume",
    value: 35,
    reason: "Quieter for an open office",
  },
  {
    id: "focus",
    ref: "Focus mode",
    key: "checked",
    value: true,
    reason: "You have a review at 3",
  },
  {
    id: "brightness",
    ref: "Brightness",
    value: 80,
    reason: "The room is bright",
  },
]

function Example() {
  return (
    <Suggestions agent={agent} suggestions={proposed}>
      <div data-slot="suggestions-layout">
        <Settings />
        <div data-slot="suggestions-panel">
          <SuggestionsList aria-label="Suggestions">
            {proposed.map((suggestion) => (
              <SuggestionsItem key={suggestion.id} value={suggestion.id}>
                <span data-slot="stack">
                  <span>
                    {suggestion.ref} to {showValue(suggestion.value)}
                  </span>
                  <span data-slot="hint">{suggestion.reason}</span>
                </span>
                <SuggestionsAccept value={suggestion.id} aria-label="Accept">
                  <CheckIcon />
                </SuggestionsAccept>
                <SuggestionsReject value={suggestion.id} aria-label="Reject">
                  <XIcon />
                </SuggestionsReject>
              </SuggestionsItem>
            ))}
          </SuggestionsList>
          <SuggestionsAcceptAll data-variant="solid">
            Accept all
          </SuggestionsAcceptAll>
        </div>
        <SuggestionsSpotlight />
      </div>
    </Suggestions>
  )
}

function Level({ label, value }: { label: string; value: number }) {
  return (
    <div data-slot="row">
      <span>{label}</span>
      <Slider defaultValue={value}>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb aria-label={label} />
          </SliderTrack>
        </SliderControl>
      </Slider>
    </div>
  )
}

function Settings() {
  return (
    <div data-slot="suggestions-settings">
      <Level label="Volume" value={70} />
      <Level label="Brightness" value={40} />
      <label data-slot="label">
        <span>Focus mode</span>
        <Switch>
          <SwitchThumb />
        </Switch>
      </label>
    </div>
  )
}

export {
  Example,
  showValue,
  type Suggestion,
  suggestions,
  Suggestions,
  SuggestionsAccept,
  SuggestionsAcceptAll,
  type SuggestionsAcceptAllState,
  type SuggestionsDecisionReason,
  SuggestionsItem,
  type SuggestionsItemState,
  SuggestionsList,
  type SuggestionsListState,
  type SuggestionsOptions,
  SuggestionsReject,
  SuggestionsSpotlight,
  type SuggestionStatus,
}
