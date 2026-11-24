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
import { PinIcon } from "lucide-react"
import { useLog } from "../../shared/react/log"

type MailboxState = {
  open: SwipeOpen | null
  swiping: SwipeDraft | null
  focused: string | null
}

type MailboxOptions = {
  pinned?: string
  first?: string
  onAction?: (key: string, side: SwipeSide) => void
}

const mailbox = definePrimitive({
  name: "mailbox",
  options: { pinned: "string", first: "string", onAction: "callback" },
  state: (_options: MailboxOptions): MailboxState => ({
    open: null,
    swiping: null,
    focused: null,
  }),
  live: ["swiping"],
  api: (context) => {
    const swipe = createSwipeActions<MailboxState>(context, {
      key: "open",
      draft: "swiping",
      onFullSwipe: (key, side) => {
        context.options().onAction?.(key, side)
        return true
      },
      fullSwipe: () => 0.5,
      disabled: (key) => key === context.options().pinned,
    })
    return {
      roving: createRovingFocus<MailboxState, { value: string }>(context, {
        slot: "row",
        key: "focused",
      }),
      swipe,
      act(action: string) {
        const first = context.options().first
        if (action === "peek" && first) {
          swipe.show(first, "end")
        } else if (action === "close") {
          swipe.close()
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot({}),
    list: slot({ attrs: () => ({ role: "list" }) }),
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
      live: live<MailboxState, any, { value: string }>((state, { api, key }) =>
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
    action: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }) => api.act(key),
    }),
  }),
})

const parts = createParts(mailbox, {
  root: "div",
  list: "div",
  row: "div",
  content: "div",
  action: "button",
})

const Mailbox = parts.Root

const MailboxList = parts.List

const MailboxRow = parts.Row

const MailboxContent = parts.Content

const MailboxAction = parts.Action

function MailboxActions({
  row,
  side,
  ...props
}: { row: string; side: SwipeSide } & PartProps<"div">) {
  return usePart(
    mailbox,
    "actions",
    { id: `${row}-${side}`, row, side },
    props,
    "div"
  )
}

function Example() {
  const log = useLog()
  const [messages, setMessages] = React.useState([
    "Welcome to Acme",
    "Flight to Lisbon",
    "Weekly digest",
  ])
  const [read, setRead] = React.useState<string[]>([])
  const toggleRead = (message: string) => {
    log(
      `${read.includes(message) ? "Marked unread" : "Marked read"}: ${message}`
    )
    setRead((current) =>
      current.includes(message)
        ? current.filter((other) => other !== message)
        : [...current, message]
    )
  }
  const archive = (message: string) => {
    log(`Archived: ${message}`)
    setMessages((current) => current.filter((other) => other !== message))
  }
  return (
    <Mailbox
      pinned="Welcome to Acme"
      first={messages[1]}
      onAction={(key: string, side: SwipeSide) =>
        side === "start" ? toggleRead(key) : archive(key)
      }
    >
      <div data-slot="controls">
        <MailboxAction data-size="sm" value="peek">
          Peek
        </MailboxAction>
        <MailboxAction data-size="sm" value="close">
          Close
        </MailboxAction>
      </div>
      <MailboxList aria-label="Mailbox">
        {messages.map((message) => (
          <MailboxRow key={message} value={message}>
            <MailboxContent value={message}>
              {message}
              {message === "Welcome to Acme" ? (
                <PinIcon aria-hidden="true" />
              ) : (
                read.includes(message) && <span data-slot="hint">Read</span>
              )}
            </MailboxContent>
            <MailboxActions row={message} side="start">
              <button
                type="button"
                tabIndex={-1}
                data-variant="solid"
                onClick={() => toggleRead(message)}
              >
                {read.includes(message) ? "Unread" : "Read"}
              </button>
            </MailboxActions>
            <MailboxActions row={message} side="end">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => archive(message)}
              >
                Archive
              </button>
            </MailboxActions>
          </MailboxRow>
        ))}
      </MailboxList>
    </Mailbox>
  )
}

export { Example }
