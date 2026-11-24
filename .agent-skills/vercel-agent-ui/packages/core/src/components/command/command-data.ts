// Commands as data: finding a command anywhere in the tree, the commands of
// the current page, and every shortcut to bind. Pure, so it's unit tested
// without a DOM.
import type { CommandData, CommandDataItem } from "./command"

// A command from data: an object, or a plain string that's its own value and label.
const asCommand = (entry: CommandDataItem | string) =>
  typeof entry === "string" ? { value: entry, label: entry } : entry

// Every command at one level, inside groups too, without descending into pages.
function* commandsAt(items: CommandData) {
  for (const entry of items) {
    if (typeof entry === "string" || !("type" in entry)) {
      yield asCommand(entry)
    } else if (entry.type === "group") {
      for (const child of entry.items) {
        yield asCommand(child)
      }
    }
  }
}

// The commands a stack of pages shows: each page is the `items` of the
// command with that value on the page below. Undefined when a page isn't in
// the data, so composed pages can supply their own.
function pageItems(items: CommandData | undefined, pages: readonly string[]) {
  let level = items
  for (const page of pages) {
    if (!level) {
      return undefined
    }
    let next: CommandData | undefined
    for (const command of commandsAt(level)) {
      if (command.value === page) {
        next = command.items
      }
    }
    level = next
  }
  return level
}

// The command with this value anywhere in the data, pages included.
// check-code: allow return-type recursive, so TypeScript cannot infer it.
function findCommand(
  items: CommandData | undefined,
  value: string
): CommandDataItem | undefined {
  if (!items) {
    return undefined
  }
  for (const command of commandsAt(items)) {
    if (command.value === value) {
      return command
    }
    const nested = findCommand(command.items, value)
    if (nested) {
      return nested
    }
  }
}

// Every enabled command with a shortcut, pages included.
function commandShortcuts(items: CommandData | undefined) {
  const found: { value: string; shortcut: string }[] = []
  const visit = (level: CommandData) => {
    for (const command of commandsAt(level)) {
      if (command.shortcut && !command.disabled) {
        found.push({ value: command.value, shortcut: command.shortcut })
      }
      if (command.items) {
        visit(command.items)
      }
    }
  }
  if (items) {
    visit(items)
  }
  return found
}

export { commandShortcuts, findCommand, pageItems }
