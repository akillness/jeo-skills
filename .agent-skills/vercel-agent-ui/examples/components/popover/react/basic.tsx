import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
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
    <Popover>
      <PopoverTrigger>Share</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Share this document</PopoverTitle>
        <PopoverDescription>
          Anyone with the link can view it.
        </PopoverDescription>
        <Field>
          <FieldLabel>Link</FieldLabel>
          <Input readOnly defaultValue="acme.app/d/q3-roadmap" />
        </Field>
        <div data-slot="row">
          <PopoverClose>Cancel</PopoverClose>
          <PopoverClose data-variant="solid">Copy Link</PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { Example }
