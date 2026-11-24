import * as React from "react"
import { bindViewport, type ViewportState } from "@ui-sdk/core"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"
import { useLog } from "../../shared/react/log"

function describe(viewport: ViewportState) {
  return `Keyboard ${viewport.keyboard}px, panned ${viewport.offsetTop}px, zoom ${Math.round(viewport.scale * 100)}%`
}

function Example() {
  const log = useLog()
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    let last = ""
    return bindViewport(ref.current!, {
      onChange: (viewport) => {
        const line = describe(viewport)
        if (line !== last) {
          log(line)
        }
        last = line
      },
    })
  }, [log])
  return (
    <div ref={ref} data-slot="stack">
      <Field>
        <FieldLabel>Message</FieldLabel>
        <FieldControl placeholder="Tap here on a phone" />
      </Field>
    </div>
  )
}

export { Example }
