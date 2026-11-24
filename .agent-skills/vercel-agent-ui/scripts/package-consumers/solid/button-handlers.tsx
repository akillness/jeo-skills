import { Button } from "@ui-sdk/solid/button"
import { withSource } from "@ui-sdk/solid/observe"
import type { JSX } from "@solidjs/web"

declare function removeRow(id: string, row: EventTarget | null): void
declare function markSaved(): void

// Every handler form a native button takes, and the press's source after an
// `await`. Under `strict`, a narrower `onClick` fails here.
function Buttons(props: {
  onArchive: JSX.EventHandlerUnion<HTMLElement, MouseEvent>
}) {
  const remove = (id: string, event: MouseEvent) =>
    removeRow(id, event.currentTarget)
  const save = () => new Promise((resolve) => setTimeout(resolve, 100))
  return (
    <>
      <Button onClick={[remove, "row-1"]}>Remove</Button>
      <Button onClick={props.onArchive}>Archive</Button>
      <Button
        onClick={async (_event, { source }) => {
          await save()
          withSource(source, markSaved)
        }}
      >
        Save
      </Button>
    </>
  )
}

export { Buttons }
