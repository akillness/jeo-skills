// Compiled by `pnpm typecheck`, never run. Each `@ts-expect-error` fails the
// build if its line stops being an error.
import type {
  CommandData,
  CommandDataGroup,
  CommandDataItem,
} from "../src/components/command/command"
import type { MenuData } from "../src/components/menu/menu"
import type {
  TriggerMenuData,
  TriggerMenuDataGroup,
  TriggerMenuDataItem,
} from "../src/components/trigger-menu/trigger-menu"
import type { ListItem } from "../src/foundation/lists/listbox"

const copy: ListItem = {
  value: "copy",
  label: "Copy",
  keywords: ["duplicate"],
  disabled: true,
}

const command: CommandDataItem = {
  ...copy,
  shortcut: "mod+c",
  items: ["Paste"],
}
const commandGroup: CommandDataGroup = {
  type: "group",
  label: "Edit",
  items: [command, "Cut"],
}
const commands: CommandData = [
  command,
  commandGroup,
  { type: "separator" },
  "Undo",
]
// @ts-expect-error `after` is a Trigger Menu item's own field.
const commandWithAfter: CommandDataItem = { ...copy, after: "submit" }

const suggestion: TriggerMenuDataItem = { ...copy, after: "continue" }
const suggestionGroup: TriggerMenuDataGroup = {
  type: "group",
  items: [suggestion, "Mention"],
}
const suggestions: TriggerMenuData = [
  suggestion,
  suggestionGroup,
  { type: "separator" },
  "Emoji",
]

const menu: MenuData = [
  "Cut",
  { ...copy, shortcut: "mod+c", destructive: true },
  { type: "submenu", label: "Paste as", items: ["Plain text"] },
]
// @ts-expect-error A menu item needs a label.
const unlabelled: MenuData = [{ value: "copy" }]

export {
  commandGroup,
  commands,
  commandWithAfter,
  menu,
  suggestionGroup,
  suggestions,
  unlabelled,
}
