import * as React from "react"
import {
  createChange,
  createRovingFocus,
  createSwipeActions,
  css,
  definePrimitive,
  live,
  selects,
  type ChangeDetails,
  type SwipeDraft,
  type SwipeOpen,
  type SwipeSide,
} from "@ui-sdk/core"
import { createParts, usePart, type PartProps } from "@ui-sdk/react/primitive"

type InboxMessageData = {
  id: string
  from: string
  subject: string
  preview: string
  time: string
  unread?: boolean
  flagged?: boolean
}

type InboxAction = "read" | "flag" | "archive"

type InboxMessagesChangeReason = InboxAction | "imperative"

type InboxOptions = {
  messages?: InboxMessageData[]
  defaultMessages?: InboxMessageData[]
  onMessagesChange?: (
    messages: InboxMessageData[],
    details: ChangeDetails<InboxMessagesChangeReason>
  ) => void
}

type InboxState = {
  messages: InboxMessageData[]
  open: SwipeOpen | null
  swiping: SwipeDraft | null
  focused: string | null
}

type InboxListState = { messages: InboxMessageData[] }
type InboxMessageState = {
  message: InboxMessageData
  open: SwipeSide | undefined
}
type InboxActionState = { message: InboxMessageData }

const inbox = /* @__PURE__ */ definePrimitive({
  name: "inbox",
  options: {
    messages: "value",
    defaultMessages: "value",
    onMessagesChange: "callback",
  },
  state: (options: InboxOptions): InboxState => ({
    messages: options.messages ?? options.defaultMessages ?? [],
    open: null,
    swiping: null,
    focused: null,
  }),
  sync: (options) =>
    options.messages === undefined ? {} : { messages: options.messages },
  controlled: ["messages"],
  live: ["swiping"],
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const roving = createRovingFocus<InboxState, { value: string }>(context, {
      slot: "message",
      key: "focused",
    })
    function run(id: string, action: InboxAction, event?: Event) {
      const { messages } = store.get()
      const index = messages.findIndex((message) => message.id === id)
      if (index === -1) {
        return false
      }
      const next =
        action === "archive"
          ? messages.filter((message) => message.id !== id)
          : messages.map((message) =>
              message.id !== id
                ? message
                : action === "read"
                  ? { ...message, unread: !message.unread }
                  : { ...message, flagged: !message.flagged }
            )
      const focused = !!context
        .element("list")
        ?.contains(document.activeElement)
      swipe.close({ focus: focused })
      if (!change("messages", next, { reason: action, event })) {
        return false
      }
      if (action === "archive" && focused) {
        const after = next[Math.min(index, next.length - 1)]
        if (after) {
          queueMicrotask(() => roving.focus(after.id))
        }
      }
      return true
    }
    const swipe = createSwipeActions<InboxState>(context, {
      key: "open",
      draft: "swiping",
      onFullSwipe: (id, side, { event }) =>
        run(id, side === "start" ? "read" : "archive", event),
    })
    const api = {
      roving,
      swipe,
      run,
      message: (id: string) =>
        store.get().messages.find((message) => message.id === id),
    }
    return api
  },
  slots: (slot) => ({
    list: slot<{}, InboxListState>({
      state: (state) => ({ messages: state.messages }),
      attrs: () => ({ role: "list" }),
    }),
    message: slot<{ value: string }, InboxMessageState>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key, api }) => ({
        message: api.message(key)!,
        open: state.open?.key === key ? state.open.side : undefined,
      }),
      attrs: (state, part) => {
        const message = part.api.message(part.key)
        return {
          role: "listitem",
          tabindex: part.api.roving.tabIndex(state, part),
          "aria-label": message
            ? `${message.unread ? "Unread, " : ""}${message.flagged ? "flagged, " : ""}${message.from}, ${message.subject}, ${message.time}`
            : undefined,
          "aria-describedby": `${part.id}-instructions`,
          "data-unread": message?.unread ? "" : undefined,
          "data-open":
            state.open?.key === part.key ? state.open.side : undefined,
          style: css({
            position: "relative",
            overflow: "hidden",
            "touch-action": "pan-y",
          }),
        }
      },
      on: {
        pointerdown: (event, { el, api, key }) =>
          el && api.swipe.pointerdown(event, key, el),
        keydown: (event, { el, api, key }) =>
          api.swipe.keydown(event, key) ||
          (el && event.target === el && api.roving.keydown(event, el)),
      },
      bind: (el, part) => {
        const leave = part.api.roving.bind(el, part)
        const unbind = part.api.swipe.bindRow(el, part.key)
        return () => {
          unbind()
          leave()
        }
      },
    }),
    content: slot<{ value: string }>({
      props: { value: { kind: "string", from: "message" } },
      attrs: () => ({
        style: css({
          position: "relative",
          "z-index": "1",
          transform: "translateX(var(--swipe-x, 0px))",
        }),
      }),
      live: live<InboxState, any, { value: string }>((state, { api, key }) =>
        api.swipe.contentAttrs(state, key)
      ),
    }),
    actions: slot<{ id: string; message: string; side: SwipeSide }>({
      props: { message: "string", side: "string" },
      attrs: (state, { props, api }) => ({
        ...api.swipe.actionsAttrs(state, props.message, props.side),
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
        api.swipe.bindActions(el, props.message, props.side),
    }),
    action: slot<
      { id: string; message: string; action: InboxAction },
      InboxActionState
    >({
      props: { message: "string", action: "string" },
      state: (_state, { props, api }) => ({
        message: api.message(props.message)!,
      }),
      attrs: () => ({ type: "button", tabindex: "-1" }),
      on: {
        click: (event, { props, api }) =>
          api.run(props.message, props.action, event),
      },
    }),
    instructions: slot({
      attrs: (_state, { id }) => ({ id: `${id}-instructions`, hidden: "" }),
    }),
  }),
})

const parts = createParts(inbox, { list: "div", instructions: "div" })

const InboxMessageContext = React.createContext<string | null>(null)

function useInboxMessage() {
  const id = React.useContext(InboxMessageContext)
  if (id === null) {
    throw new Error(
      "InboxContent, InboxActions and InboxAction must be used inside <InboxMessage>."
    )
  }
  return id
}

const Inbox = parts.Root

const InboxList = parts.List

function InboxMessage({
  value,
  ...props
}: { value: string } & PartProps<"div", InboxMessageState>) {
  return (
    <InboxMessageContext.Provider value={value}>
      {usePart(inbox, "message", { value }, props)}
    </InboxMessageContext.Provider>
  )
}

function InboxContent(props: PartProps<"div">) {
  return usePart(inbox, "content", { value: useInboxMessage() }, props)
}

function InboxActions({
  side,
  ...props
}: { side: SwipeSide } & PartProps<"div">) {
  const message = useInboxMessage()
  return usePart(
    inbox,
    "actions",
    { id: `${side}-${message}`, message, side },
    props
  )
}

function InboxAction({
  action,
  ...props
}: { action: InboxAction } & PartProps<"button", InboxActionState>) {
  const message = useInboxMessage()
  return usePart(
    inbox,
    "action",
    { id: `${action}-${message}`, message, action },
    props,
    "button"
  )
}

const InboxInstructions = parts.Instructions

const mail: InboxMessageData[] = [
  {
    id: "1",
    from: "Ada",
    subject: "Grid focus review",
    preview: "Left two notes on the virtualized rows. The rest reads well.",
    time: "9:41",
    unread: true,
  },
  {
    id: "2",
    from: "Grace",
    subject: "Offsite dates",
    preview: "Does the second week of November work for everyone?",
    time: "9:12",
    unread: true,
  },
  {
    id: "3",
    from: "Linus",
    subject: "Re: release notes",
    preview: "Shipped. Thanks for the quick turnaround on the changelog.",
    time: "Yesterday",
    flagged: true,
  },
  {
    id: "4",
    from: "Margaret",
    subject: "Launch checklist",
    preview: "Everything is green except the docs search index.",
    time: "Yesterday",
  },
  {
    id: "5",
    from: "Alan",
    subject: "Lunch?",
    preview: "Thinking the noodle place around the corner, 12:30.",
    time: "Mon",
  },
]

function Example() {
  const [messages, setMessages] = React.useState(mail)
  const [notice, setNotice] = React.useState("")
  return (
    <Inbox
      messages={messages}
      onMessagesChange={(next, { reason }) => {
        setMessages(next)
        if (reason === "archive") {
          setNotice("Archived.")
        }
      }}
    >
      <div data-slot="stack">
        <InboxList>
          {({ messages }) =>
            messages.map((message) => (
              <InboxMessage key={message.id} value={message.id}>
                <div data-slot="inbox-side" data-show="start">
                  <div data-slot="inbox-fill" aria-hidden="true" />
                  <InboxActions side="start">
                    <InboxAction action="read">
                      {({ message }) => (message.unread ? "Read" : "Unread")}
                    </InboxAction>
                  </InboxActions>
                </div>
                <div data-slot="inbox-side" data-show="end">
                  <div data-slot="inbox-fill" aria-hidden="true" />
                  <InboxActions side="end">
                    <InboxAction action="flag">
                      {({ message }) => (message.flagged ? "Unflag" : "Flag")}
                    </InboxAction>
                    <InboxAction action="archive">Archive</InboxAction>
                  </InboxActions>
                </div>
                <InboxContent>
                  <span data-slot="inbox-dot" aria-hidden="true" />
                  <span data-slot="stack">
                    <span data-slot="row">
                      <span data-slot="inbox-from">{message.from}</span>
                      {message.flagged && (
                        <span data-slot="inbox-flag" aria-hidden="true" />
                      )}
                      <span data-slot="hint">{message.time}</span>
                    </span>
                    <span>{message.subject}</span>
                    <span data-slot="hint">{message.preview}</span>
                  </span>
                </InboxContent>
              </InboxMessage>
            ))
          }
        </InboxList>
        <InboxInstructions>
          Left and Right show the message's actions, and Escape hides them. Up
          and Down move between messages.
        </InboxInstructions>
        <p data-slot="output" aria-live="polite">
          {notice ||
            "Swipe a message left or right, or press Left or Right on it."}
        </p>
        {messages.length < mail.length && (
          <button
            type="button"
            data-variant="link"
            onClick={() => {
              setMessages(mail)
              setNotice("")
            }}
          >
            Bring back archived messages
          </button>
        )}
      </div>
    </Inbox>
  )
}

export {
  Example,
  inbox,
  Inbox,
  InboxAction,
  type InboxActionState,
  InboxActions,
  InboxContent,
  InboxInstructions,
  InboxList,
  type InboxListState,
  InboxMessage,
  type InboxMessageData,
  type InboxMessageState,
  type InboxMessagesChangeReason,
  type InboxOptions,
}
