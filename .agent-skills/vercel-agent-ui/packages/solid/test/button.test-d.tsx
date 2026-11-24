// Compiled by `pnpm typecheck`, never run. Each `@ts-expect-error` fails the
// build if its line stops being an error.
import type { JSX } from "@solidjs/web"
import { Button } from "../src/button"

declare const onButtonClick: JSX.EventHandler<HTMLButtonElement, MouseEvent>
declare const onAnyClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>

// A handler typed for a <button>, like one passed down from a wrapper's props, fits.
const typed = <Button onClick={onButtonClick}>Save</Button>
const passedDown = <Button onClick={onAnyClick}>Save</Button>
const wrongEvent = (
  // @ts-expect-error A press is a mouse event, not a keyboard one.
  <Button onClick={(event: KeyboardEvent) => event.key}>Save</Button>
)

export { passedDown, typed, wrongEvent }
