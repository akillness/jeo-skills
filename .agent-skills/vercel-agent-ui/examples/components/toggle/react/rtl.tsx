import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle"
import { BookmarkIcon } from "lucide-react"

export function Example() {
  return (
    <div dir="rtl">
      <Toggle>
        <ToggleIcon data-variant="fill">
          <BookmarkIcon />
        </ToggleIcon>
        إشارة مرجعية
      </Toggle>
    </div>
  )
}
