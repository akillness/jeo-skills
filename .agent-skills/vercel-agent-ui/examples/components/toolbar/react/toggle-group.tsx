"use client"

import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/react/toggle"
import { Toolbar, ToolbarSeparator } from "@ui-sdk/react/toolbar"
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ListIcon,
  ListOrderedIcon,
} from "lucide-react"
import { useLog } from "../../../shared/react/log"

const alignments = [
  { value: "left", label: "Align left", icon: AlignLeftIcon },
  { value: "center", label: "Align center", icon: AlignCenterIcon },
  { value: "right", label: "Align right", icon: AlignRightIcon },
]

const lists = [
  { value: "bulleted", label: "Bulleted list", icon: ListIcon },
  { value: "numbered", label: "Numbered list", icon: ListOrderedIcon },
]

function Example() {
  const log = useLog()
  return (
    <Toolbar aria-label="Paragraph">
      <ToggleGroup
        defaultValue={["left"]}
        deselectable={false}
        aria-label="Alignment"
        onValueChange={([value]) => log(`Align ${value}`)}
      >
        {alignments.map(({ value, label, icon: Icon }) => (
          <Toggle key={value} value={value} aria-label={label}>
            <ToggleIcon>
              <Icon />
            </ToggleIcon>
          </Toggle>
        ))}
      </ToggleGroup>
      <ToolbarSeparator />
      <ToggleGroup
        aria-label="List"
        onValueChange={([value]) =>
          log(lists.find((list) => list.value === value)?.label ?? "No list")
        }
      >
        {lists.map(({ value, label, icon: Icon }) => (
          <Toggle key={value} value={value} aria-label={label}>
            <ToggleIcon>
              <Icon />
            </ToggleIcon>
          </Toggle>
        ))}
      </ToggleGroup>
    </Toolbar>
  )
}

export { Example }
