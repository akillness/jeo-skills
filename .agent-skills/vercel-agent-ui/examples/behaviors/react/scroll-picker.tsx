import * as React from "react"
import { bindScrollPicker } from "@ui-sdk/core"
import { Listbox, ListboxItem } from "@ui-sdk/react/listbox"
import { useLog } from "../../shared/react/log"

const hours = Array.from({ length: 12 }, (_, index) => String(index + 1))

const minutes = Array.from({ length: 12 }, (_, index) =>
  String(index * 5).padStart(2, "0")
)

function Wheel({
  label,
  options,
  value,
  onValueChange,
}: {
  label: string
  options: string[]
  value: string
  onValueChange: (value: string) => void
}) {
  const list = React.useRef<HTMLDivElement>(null)
  const select = React.useEffectEvent((index: number) =>
    onValueChange(options[index])
  )

  React.useLayoutEffect(
    () =>
      bindScrollPicker(list.current!, { onSelect: (index) => select(index) }),
    []
  )

  return (
    <div data-slot="wheel">
      <Listbox
        ref={list}
        aria-label={label}
        keepInView={false}
        value={value}
        onValueChange={(next) => next && onValueChange(next)}
      >
        {options.map((option) => (
          <ListboxItem key={option} value={option}>
            {option}
          </ListboxItem>
        ))}
      </Listbox>
    </div>
  )
}

function Example() {
  const log = useLog()
  const [hour, setHour] = React.useState("9")
  const [minute, setMinute] = React.useState("30")
  return (
    <div data-slot="wheels">
      <Wheel
        label="Hour"
        options={hours}
        value={hour}
        onValueChange={(next) => {
          setHour(next)
          log(`${next}:${minute}`)
        }}
      />
      <Wheel
        label="Minute"
        options={minutes}
        value={minute}
        onValueChange={(next) => {
          setMinute(next)
          log(`${hour}:${next}`)
        }}
      />
    </div>
  )
}

export { Example }
