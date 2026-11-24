import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/react/toggle"
import { BoldIcon, ItalicIcon, UnderlineIcon } from "lucide-react"

function Example() {
  return (
    <ToggleGroup multiple aria-label="Text formatting">
      <Toggle value="bold" aria-label="Bold">
        <ToggleIcon>
          <BoldIcon />
        </ToggleIcon>
      </Toggle>
      <Toggle value="italic" aria-label="Italic">
        <ToggleIcon>
          <ItalicIcon />
        </ToggleIcon>
      </Toggle>
      <Toggle value="underline" aria-label="Underline">
        <ToggleIcon>
          <UnderlineIcon />
        </ToggleIcon>
      </Toggle>
    </ToggleGroup>
  )
}

export { Example }
