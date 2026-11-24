import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import {
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/react/toast"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

const sides = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
]
const aligns = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]
type Side = "top" | "bottom"
type Align = "start" | "center" | "end"

function Example() {
  const [toast] = React.useState(() => createToaster())
  const [side, setSide] = React.useState<Side>("bottom")
  const [align, setAlign] = React.useState<Align>("end")
  React.useEffect(
    () => () => {
      toast.dismiss()
    },
    [toast]
  )

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select
          items={sides}
          value={side}
          onValueChange={(next) => next && setSide(next as Side)}
        >
          <SelectLabel>Side</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon aria-hidden="true" />
          </SelectTrigger>
          <SelectContent>
            {sides.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                <SelectItemIndicator>
                  <CheckIcon aria-hidden="true" />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={aligns}
          value={align}
          onValueChange={(next) => next && setAlign(next as Align)}
        >
          <SelectLabel>Align</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon aria-hidden="true" />
          </SelectTrigger>
          <SelectContent>
            {aligns.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                <SelectItemIndicator>
                  <CheckIcon aria-hidden="true" />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <button
        onClick={() =>
          toast("Event created", { description: "Friday, June 12 at 10:00 AM" })
        }
      >
        Create Event
      </button>
      <ToastRegion toaster={toast} side={side} align={align}>
        {() => (
          <Toast>
            <div data-slot="stack">
              <ToastTitle />
              <ToastDescription />
            </div>
          </Toast>
        )}
      </ToastRegion>
    </div>
  )
}

export { Example }
