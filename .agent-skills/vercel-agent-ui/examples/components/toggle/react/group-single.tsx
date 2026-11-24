import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/react/toggle"
import {
  TextAlignCenterIcon,
  TextAlignEndIcon,
  TextAlignStartIcon,
} from "lucide-react"

const alignments = [
  {
    value: "start",
    label: "Align start",
    icon: TextAlignStartIcon,
    mirror: true,
  },
  {
    value: "center",
    label: "Align center",
    icon: TextAlignCenterIcon,
    mirror: false,
  },
  { value: "end", label: "Align end", icon: TextAlignEndIcon, mirror: true },
]

function Example() {
  return (
    <ToggleGroup
      defaultValue={["start"]}
      deselectable={false}
      aria-label="Text alignment"
    >
      {alignments.map((item) => (
        <Toggle key={item.value} value={item.value} aria-label={item.label}>
          <ToggleIcon mirror={item.mirror}>
            <item.icon />
          </ToggleIcon>
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

export { Example }
