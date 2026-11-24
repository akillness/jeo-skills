import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover"

function Example() {
  return (
    <div data-slot="popover-frame">
      <div data-slot="popover-corner">
        <Popover>
          <PopoverTrigger>Feedback</PopoverTrigger>
          <PopoverContent inline>
            <PopoverTitle>Send feedback</PopoverTitle>
            <PopoverDescription>
              The panel sits in the corner box, above its trigger.
            </PopoverDescription>
            <div data-slot="row">
              <PopoverClose>Close</PopoverClose>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

export { Example }
