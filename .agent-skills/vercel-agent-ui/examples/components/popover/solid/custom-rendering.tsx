import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverShortcut,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/solid/popover"

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
        <PopoverTitle render={(props) => <h3 {...props} />}>
          Updates
        </PopoverTitle>
        <PopoverDescription>
          Version 2.4 adds threaded comments.
        </PopoverDescription>
        <PopoverClose render={(props) => <a {...props} href="#" />}>
          Read the Changelog
        </PopoverClose>
      </PopoverContent>
    </Popover>
  )
}

export { Example }
