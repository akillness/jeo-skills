"use client"

import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle"
import { HeartIcon } from "lucide-react"

function Example() {
  return (
    <Toggle
      aria-label="Favorite"
      render={(props, state) => (
        <button {...props}>
          <ToggleIcon>
            <HeartIcon fill={state.pressed ? "currentColor" : "none"} />
          </ToggleIcon>
        </button>
      )}
    />
  )
}

export { Example }
