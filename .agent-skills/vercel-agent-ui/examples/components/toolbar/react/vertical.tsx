"use client"

import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/react/toggle"
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@ui-sdk/react/toolbar"
import {
  MousePointer2Icon,
  PencilIcon,
  SquareIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react"
import { useLog } from "../../../shared/react/log"

const tools = [
  { value: "select", label: "Select", icon: MousePointer2Icon },
  { value: "draw", label: "Draw", icon: PencilIcon },
  { value: "shape", label: "Shape", icon: SquareIcon },
  { value: "text", label: "Text", icon: TypeIcon },
]

function Example() {
  const log = useLog()
  return (
    <Toolbar orientation="vertical" aria-label="Canvas">
      <ToggleGroup
        defaultValue={["select"]}
        deselectable={false}
        orientation="vertical"
        aria-label="Tool"
        onValueChange={([value]) =>
          log(`${tools.find((tool) => tool.value === value)?.label} tool`)
        }
      >
        {tools.map(({ value, label, icon: Icon }) => (
          <Toggle key={value} value={value} aria-label={label}>
            <ToggleIcon>
              <Icon />
            </ToggleIcon>
          </Toggle>
        ))}
      </ToggleGroup>
      <ToolbarSeparator />
      <ToolbarButton
        aria-label="Delete"
        onClick={() => log("Deleted selection")}
      >
        <Trash2Icon aria-hidden="true" />
      </ToolbarButton>
    </Toolbar>
  )
}

export { Example }
