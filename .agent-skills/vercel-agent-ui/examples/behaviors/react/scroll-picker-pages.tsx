import * as React from "react"
import { bindScrollPicker } from "@ui-sdk/core"
import { Listbox, ListboxItem } from "@ui-sdk/react/listbox"
import { useLog } from "../../shared/react/log"

const pages = Array.from({ length: 40 }, (_, index) => String(index + 1))

function Example() {
  const log = useLog()
  const list = React.useRef<HTMLDivElement>(null)
  const [page, setPage] = React.useState("1")
  const choose = (next: string) => {
    setPage(next)
    log(`Page ${next}`)
  }
  const select = React.useEffectEvent((index: number) => choose(pages[index]))

  React.useLayoutEffect(
    () =>
      bindScrollPicker(list.current!, { onSelect: (index) => select(index) }),
    []
  )

  return (
    <div data-slot="thumbwheel">
      <Listbox
        ref={list}
        aria-label="Page"
        orientation="horizontal"
        keepInView={false}
        value={page}
        onValueChange={(next) => next && choose(next)}
      >
        {pages.map((option) => (
          <ListboxItem key={option} value={option}>
            {option}
          </ListboxItem>
        ))}
      </Listbox>
    </div>
  )
}

export { Example }
