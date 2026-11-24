import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover"

const aligns = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
] as const

function Example() {
  return (
    <div data-slot="row">
      {aligns.map((align) => (
        <Popover key={align.value}>
          <PopoverTrigger>{align.label}</PopoverTrigger>
          <PopoverContent align={align.value} sideOffset={8}>
            <PopoverTitle>Delivery window</PopoverTitle>
            <PopoverDescription>
              Arrives Tuesday between 9 AM and noon.
            </PopoverDescription>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  )
}

export { Example }
