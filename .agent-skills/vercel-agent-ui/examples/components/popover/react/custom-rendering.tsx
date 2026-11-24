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
      <PopoverTrigger
        shortcut="mod+u"
        render={(props, state) => (
          <button {...props}>
            {state.open ? "Hide Updates" : "Show Updates"}
            <PopoverShortcut>{(shortcut) => shortcut.text}</PopoverShortcut>
          </button>
        )}
      />
      <PopoverContent>
        <PopoverTitle render={<h3 />}>Updates</PopoverTitle>
        <PopoverDescription>
          Version 2.4 adds threaded comments.
        </PopoverDescription>
        <PopoverClose render={<a href="#" />}>Read the Changelog</PopoverClose>
      </PopoverContent>
    </Popover>
  )
}

export { Example }
