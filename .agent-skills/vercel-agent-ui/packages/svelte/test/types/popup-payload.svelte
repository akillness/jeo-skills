<!-- Checked by svelte-check, never rendered: a content's snippet types its state's payload, which `Payload` takes from it. -->
<script lang="ts">
  import type { DialogContentState } from "@ui-sdk/core/dialog"
  import type { DrawerContentState } from "@ui-sdk/core/drawer"
  import type { HoverCardContentState } from "@ui-sdk/core/hover-card"
  import type { MenuContentState } from "@ui-sdk/core/menu"
  import type { PopoverContentState } from "@ui-sdk/core/popover"
  import type { TooltipContentState } from "@ui-sdk/core/tooltip"
  import { AlertDialog, AlertDialogContent } from "../../src/alert-dialog"
  import { Dialog, DialogContent } from "../../src/dialog"
  import { Drawer, DrawerContent } from "../../src/drawer"
  import { HoverCard, HoverCardContent } from "../../src/hover-card"
  import { Menu, MenuContent } from "../../src/menu"
  import { Popover, PopoverContent } from "../../src/popover"
  import { Tooltip, TooltipContent } from "../../src/tooltip"

  type Day = { count: number }
</script>

<Tooltip>
  <TooltipContent side="top">
    {#snippet children(state: TooltipContentState<Day>)}{state.payload
        ?.count}{/snippet}
  </TooltipContent>
</Tooltip>
<Popover>
  <PopoverContent>
    {#snippet children(state: PopoverContentState<Day>)}{state.payload
        ?.count}{/snippet}
  </PopoverContent>
</Popover>
<HoverCard>
  <HoverCardContent>
    {#snippet children(state: HoverCardContentState<Day>)}{state.payload
        ?.count}{/snippet}
  </HoverCardContent>
</HoverCard>
<Dialog>
  <DialogContent>
    {#snippet children(state: DialogContentState<Day>)}{state.payload
        ?.count}{/snippet}
  </DialogContent>
</Dialog>
<AlertDialog>
  <AlertDialogContent>
    {#snippet children(state: DialogContentState<Day>)}{state.payload
        ?.count}{/snippet}
  </AlertDialogContent>
</AlertDialog>
<Drawer>
  <DrawerContent>
    {#snippet children(state: DrawerContentState<Day>)}{state.payload
        ?.count}{/snippet}
  </DrawerContent>
</Drawer>
<Menu>
  <MenuContent>
    {#snippet children(state: MenuContentState<Day>)}{state.payload
        ?.count}{/snippet}
  </MenuContent>
</Menu>
