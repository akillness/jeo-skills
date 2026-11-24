// Compiled by `pnpm typecheck`, never run. Each `@ts-expect-error` fails the
// build if its line stops being an error.
import { AlertDialog, AlertDialogContent } from "../src/alert-dialog"
import { Dialog, DialogContent } from "../src/dialog"
import { Drawer, DrawerContent } from "../src/drawer"
import { HoverCard, HoverCardContent } from "../src/hover-card"
import { Menu, MenuContent } from "../src/menu"
import { Popover, PopoverContent } from "../src/popover"
import { Tooltip, TooltipContent } from "../src/tooltip"

type Day = { count: number }

// A content part's type argument types the payload in its state.
const tooltip = (
  <Tooltip>
    <TooltipContent<Day>>
      {(state) => {
        const count: number | undefined = state.payload?.count
        // @ts-expect-error A day has no `name`.
        const wrong = state.payload?.name
        return `${count}${wrong}`
      }}
    </TooltipContent>
  </Tooltip>
)
const popover = (
  <Popover>
    <PopoverContent<Day>
      class={(state) => (state.payload?.count ? "busy" : "")}
    />
  </Popover>
)
const others = [
  <HoverCard>
    <HoverCardContent<Day>>{(state) => state.payload?.count}</HoverCardContent>
  </HoverCard>,
  <Dialog>
    <DialogContent<Day>>{(state) => state.payload?.count}</DialogContent>
  </Dialog>,
  <AlertDialog>
    <AlertDialogContent<Day>>
      {(state) => state.payload?.count}
    </AlertDialogContent>
  </AlertDialog>,
  <Drawer>
    <DrawerContent<Day>>{(state) => state.payload?.count}</DrawerContent>
  </Drawer>,
  <Menu>
    <MenuContent<Day>>{(state) => state.payload?.count}</MenuContent>
  </Menu>,
]
// Without one, the payload is unknown.
const unknownPayload = (
  <Tooltip>
    <TooltipContent>
      {/* @ts-expect-error An unknown payload has no `count`. */}
      {(state) => state.payload.count}
    </TooltipContent>
  </Tooltip>
)

export { others, popover, tooltip, unknownPayload }
