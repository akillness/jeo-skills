// TriggerMenu's choosing: an item, its arguments one by one, then `onSelect`,
// the insertion and what the item does after.
import { createDetails } from "../../foundation/kernel/details"
import { changeSource } from "../../foundation/kernel/input-source"
import { toListItem, type ListData } from "../../foundation/lists/listbox"
import { isPromise } from "../../foundation/kernel/action"
import type {
  TextEditorAdapter,
  TextRange,
  TokenInsert,
} from "../../foundation/text/text-editor"
import type {
  TriggerDefinition,
  TriggerMenuData,
  TriggerMenuDataItem,
  TriggerMenuItemProps,
  TriggerMenuOptions,
  TriggerMenuSelectDetails,
} from "./trigger-menu"
import {
  argumentOf,
  type TriggerLevel,
  type TriggerLevels,
} from "./trigger-menu-levels"

type ItemMeta = TriggerMenuItemProps<unknown> & { group?: string }
type ChosenItem = TriggerMenuDataItem<unknown> & {
  onSelect?: ItemMeta["onSelect"]
}
type Pending = PromiseLike<void | Partial<TokenInsert>>

// Every data item by key, with what only the data knows, like its arguments.
function itemsByKey(
  data: ListData<unknown> | undefined,
  toKey: (value: unknown) => string
) {
  const map = new Map<string, TriggerMenuDataItem<unknown>>()
  const visit = (list: TriggerMenuData<unknown>) => {
    for (const entry of list) {
      if (typeof entry === "object" && "type" in entry) {
        if (entry.type === "group") {
          visit(entry.items as TriggerMenuData<unknown>)
        }
        continue
      }
      const item = toListItem(
        entry as TriggerMenuDataItem<unknown>
      ) as TriggerMenuDataItem<unknown>
      map.set(toKey(item.value), item)
    }
  }
  if (data) {
    visit(data as TriggerMenuData<unknown>)
  }
  return map
}

// A token where the editor takes them, else the trigger, the label and a space.
// A token's label is the item's alone; the trigger rides in its data, so a
// token turned back into text gets it back.
function defaultInsert(
  item: TriggerMenuDataItem<unknown>,
  level: TriggerLevel,
  rule: TriggerDefinition<unknown>,
  tokens: boolean,
  toKey: (value: unknown) => string
) {
  const values = Object.values(level.values)
  const trigger = level.continued ? "" : level.match.trigger
  if (!tokens) {
    return `${[`${trigger}${item.label}`, ...values].join(" ")} `
  }
  return {
    type: rule.type ?? "mention",
    value: toKey(item.value),
    label: [item.label, ...values].join(" "),
    data: { trigger, ...(values.length ? { arguments: level.values } : {}) },
  }
}

function createTriggerSelect({
  levels,
  editor,
  options,
  items,
  find,
  highlighted,
  itemProps,
  toKey,
  waiting,
}: {
  levels: TriggerLevels
  editor: () => TextEditorAdapter | undefined
  options: () => TriggerMenuOptions<any>
  // The current level's data items, and an item the listbox knows by key.
  items: () => ListData<unknown> | undefined
  find: (
    key: string
  ) =>
    | { value: unknown; label: string; keywords?: string[]; disabled: boolean }
    | undefined
  // The highlighted item while the list is open.
  highlighted: () => string | null
  itemProps: (key: string) => ItemMeta | undefined
  toKey: (value: unknown) => string
  waiting: (promise: Pending) => void
}) {
  let writing = false
  let byKey = itemsByKey(undefined, toKey)
  let byKeyData: ListData<unknown> | undefined

  // The item a key names: from the data, or a composed item's props.
  function itemFor(key: string) {
    const data = items()
    if (data !== byKeyData) {
      byKeyData = data
      byKey = itemsByKey(data, toKey)
    }
    const fromData = byKey.get(key)
    if (fromData) {
      return fromData
    }
    const entry = find(key)
    if (!entry) {
      return undefined
    }
    const props = itemProps(key)
    // Only a handler the item was given: web components turn any callback into an event.
    const onSelect = props && "onSelect" in props ? props.onSelect : undefined
    const composed: ChosenItem = {
      value: entry.value,
      label: entry.label,
      keywords: entry.keywords,
      disabled: entry.disabled,
      onSelect,
    }
    return composed
  }

  // Writes to the editor as one step, without following it as a person's edit.
  function write(
    range: TextRange,
    content: string | TokenInsert,
    pending?: Pending
  ) {
    const target = editor()
    if (!target) {
      return
    }
    writing = true
    try {
      target.replace(range, content, pending ? { pending } : undefined)
    } finally {
      writing = false
    }
  }

  // Choosing a highlighted item: an item with arguments asks for them first.
  function choose(key: string, event?: Event, { tab = false } = {}) {
    const level = levels.current()
    if (!level) {
      return
    }
    if (level.item) {
      return accept(event, { tab })
    }
    const item = itemFor(key)
    const at = levels.caret()
    if (!item || item.disabled || at === null) {
      return
    }
    if (!item.arguments?.length) {
      return complete(item, level, at, event, { tab })
    }
    const text = `${level.match.trigger}${item.label} `
    write({ start: level.match.start, end: at }, text)
    const start = level.match.start + text.length
    levels.enter(
      {
        ...level,
        item,
        starts: [start],
        values: {},
        queryStart: start,
        match: { ...level.match, end: start },
      },
      "",
      "item-press",
      "item-press",
      event
    )
  }

  // Accepts the current argument: the highlighted suggestion, else the typed text.
  function accept(event?: Event, { tab = false } = {}) {
    const level = levels.current()!
    const argument = argumentOf(level)
    const at = levels.caret()
    if (!argument || at === null) {
      return
    }
    const query = (levels.textFrom(level.queryStart) ?? "").trim()
    const key = highlighted()
    const chosen = key !== null ? itemFor(key) : undefined
    const value = chosen
      ? toKey(chosen.value)
      : argument.allowCustomValue !== false
        ? query
        : ""
    if (!value && argument.required) {
      return
    }
    const values = {
      ...level.values,
      ...(value ? { [argument.name]: value } : {}),
    }
    const label = chosen ? chosen.label : query
    const index = level.starts.length - 1
    const rest = level.item!.arguments!.slice(index + 1)
    // Enter finishes once only optional arguments are left. Tab moves to the next one.
    const finish =
      !rest.length || (!tab && rest.every((next) => !next.required))
    const text = label ? `${label} ` : ""
    if (text) {
      write({ start: level.queryStart, end: at }, text)
    }
    const next = level.queryStart + text.length
    if (finish) {
      return complete(level.item!, { ...level, values }, next, event, { tab })
    }
    levels.enter(
      {
        ...level,
        values,
        starts: [...level.starts, next],
        queryStart: next,
        match: { ...level.match, end: next },
      },
      "",
      "item-press",
      "item-press",
      event
    )
  }

  // Runs the item's and the menu's `onSelect`, inserts, then does what `after` says.
  function complete(
    item: ChosenItem,
    level: TriggerLevel,
    at: number,
    event?: Event,
    { tab = false } = {}
  ) {
    const rule = options().triggers[level.rule]
    const range = { start: level.match.start, end: at }
    const match = {
      ...level.match,
      end: at,
      query: level.continued
        ? (levels.textFrom(level.queryStart) ?? "")
        : level.match.query,
    }
    let prevented = false
    let inserted = false
    let waited: Pending | undefined
    const details = createDetails(
      {
        reason: "item-press",
        event,
        trigger: level.match.trigger,
        match,
        item,
        arguments: level.values,
        insert(content: string | TokenInsert) {
          inserted = true
          write(range, content)
        },
        waitUntil: (promise: Pending) => (waited = promise),
        preventDefault: () => (prevented = true),
      },
      changeSource("item-press", event)
    )
    // Read live, after both callbacks. A web component's canceled event cancels the details.
    Object.defineProperty(details, "defaultPrevented", {
      get: () => prevented || inserted || details.canceled,
    })
    const selectDetails =
      details as unknown as TriggerMenuSelectDetails<unknown>
    // The item hears first, then the menu. Either can prevent the insertion or return a Promise.
    const results = [
      item.onSelect?.(item.value, selectDetails),
      options().onSelect?.(item.value, selectDetails),
    ]
    const pending = (results.find(isPromise) as Pending | undefined) ?? waited
    if (pending) {
      waiting(pending)
    }
    if (!selectDetails.defaultPrevented) {
      const content =
        rule.insert?.(item as TriggerMenuDataItem<any>, {
          match,
          arguments: level.values,
        }) ?? defaultInsert(item, level, rule, !!editor()?.tokens, toKey)
      write(range, content, typeof content === "string" ? undefined : pending)
    }
    const after = item.after ?? "compose"
    if (after === "continue") {
      const start = levels.caret() ?? at
      return levels.enter(
        {
          rule: level.rule,
          match: { trigger: level.match.trigger, start, end: start, query: "" },
          queryStart: start,
          starts: [],
          values: {},
          continued: true,
        },
        "",
        "item-press",
        "item-press",
        event
      )
    }
    levels.end("item-press", event)
    if (after === "submit" && !tab) {
      editor()?.submit?.(event)
    }
  }

  return { choose, accept, write, isWriting: () => writing }
}

export { createTriggerSelect }
