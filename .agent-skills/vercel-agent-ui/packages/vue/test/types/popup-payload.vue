<script setup lang="ts">
// A content part with a type argument types its state's payload.
import { AlertDialog, AlertDialogContent } from "../../src/alert-dialog"
import { Dialog, DialogContent } from "../../src/dialog"
import { Drawer, DrawerContent } from "../../src/drawer"
import { HoverCard, HoverCardContent } from "../../src/hover-card"
import { Menu, MenuContent } from "../../src/menu"
import { Popover, PopoverContent } from "../../src/popover"
import { Tooltip, TooltipContent } from "../../src/tooltip"

type Day = { count: number }

const DayTooltipContent = TooltipContent<Day>
const DayPopoverContent = PopoverContent<Day>
const DayHoverCardContent = HoverCardContent<Day>
const DayDialogContent = DialogContent<Day>
const DayAlertDialogContent = AlertDialogContent<Day>
const DayDrawerContent = DrawerContent<Day>
const DayMenuContent = MenuContent<Day>
</script>

<template>
  <Tooltip>
    <DayTooltipContent side="top" v-slot="{ state }">{{
      state.payload?.count
    }}</DayTooltipContent>
    <DayTooltipContent v-slot="{ state }">
      <!-- @vue-expect-error A day has no `name`. -->
      {{ state.payload?.name }}
    </DayTooltipContent>
    <!-- @vue-expect-error The content's props stay typed. -->
    <DayTooltipContent :side-offset="'far'" />
    <TooltipContent v-slot="{ state }">
      <!-- @vue-expect-error Without a type argument, the payload is unknown. -->
      {{ state.payload.count }}
    </TooltipContent>
  </Tooltip>
  <Popover>
    <DayPopoverContent v-slot="{ state }">{{
      state.payload?.count
    }}</DayPopoverContent>
  </Popover>
  <HoverCard>
    <DayHoverCardContent v-slot="{ state }">{{
      state.payload?.count
    }}</DayHoverCardContent>
  </HoverCard>
  <Dialog pending-announcement="Saving changes">
    <DayDialogContent v-slot="{ state }">{{
      state.payload?.count
    }}</DayDialogContent>
  </Dialog>
  <AlertDialog pending-announcement="Deleting item">
    <DayAlertDialogContent v-slot="{ state }">{{
      state.payload?.count
    }}</DayAlertDialogContent>
  </AlertDialog>
  <Drawer>
    <DayDrawerContent v-slot="{ state }"
      >{{ state.payload?.count }} {{ state.snapPoint }}</DayDrawerContent
    >
  </Drawer>
  <Menu>
    <DayMenuContent v-slot="{ state }">{{
      state.payload?.count
    }}</DayMenuContent>
  </Menu>
</template>
