import * as React from "react"
import { createPointerKind } from "@ui-sdk/core"
import { usePreference } from "@ui-sdk/react/preferences"
import { useLog } from "../../shared/react/log"

const pointerKind = createPointerKind()

function Example() {
  const log = useLog()
  const kind = usePreference(pointerKind)
  const [open, setOpen] = React.useState(false)
  const hovers = kind.hover === "hover"
  React.useEffect(() => {
    log(
      `pointer ${kind.pointer}, hover ${kind.hover}, anyPointer ${kind.anyPointer}, anyHover ${kind.anyHover}`
    )
  }, [log, kind.pointer, kind.hover, kind.anyPointer, kind.anyHover])
  return (
    <div data-slot="pointer-kind">
      <button
        type="button"
        aria-expanded={open}
        onPointerEnter={hovers ? () => setOpen(true) : undefined}
        onPointerLeave={hovers ? () => setOpen(false) : undefined}
        onClick={() => setOpen((open) => !open)}
      >
        {kind.hover === "unknown"
          ? "Shipping"
          : hovers
            ? "Shipping (hover for details)"
            : "Shipping (tap for details)"}
      </button>
      <p
        role="status"
        data-slot="pointer-kind-details"
        data-open={open ? "" : undefined}
      >
        {open && "Free over $50. Arrives in 2 to 4 days."}
      </p>
    </div>
  )
}

export { Example }
