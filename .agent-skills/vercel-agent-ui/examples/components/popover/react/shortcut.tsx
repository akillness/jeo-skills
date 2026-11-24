import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverShortcut,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover"

function Example() {
  return (
    <Popover>
      <PopoverTrigger shortcut="mod+i">
        Invite
        <PopoverShortcut />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Invite people</PopoverTitle>
        <PopoverDescription>
          They'll get an email with a link to join.
        </PopoverDescription>
        <Field>
          <FieldLabel>Email</FieldLabel>
          <Input type="email" placeholder="wren@example.com" />
        </Field>
        <div data-slot="row">
          <PopoverClose>Cancel</PopoverClose>
          <PopoverClose data-variant="solid">Send Invite</PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { Example }
