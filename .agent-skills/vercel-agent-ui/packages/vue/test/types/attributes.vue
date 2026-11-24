<script setup lang="ts">
// Every part takes the attributes and events of the element it renders, and
// strict templates still report the ones it doesn't.
import { Dialog, DialogContent, DialogTitle } from "../../src/dialog"
import { Listbox } from "../../src/listbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../../src/select"
import { Slider, SliderValue } from "../../src/slider"
import { Tabs, TabsList, TabsTab } from "../../src/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../src/tooltip"

type Day = { date: string }
const DayTooltipContent = TooltipContent<Day>

function onClick(event: MouseEvent) {
  return event.button
}
</script>

<template>
  <Dialog>
    <DialogContent data-testid="dialog" @click="onClick">
      <DialogTitle class="title" data-foo="1" @click="onClick" />
    </DialogContent>
  </Dialog>
  <Tabs data-foo="1">
    <TabsList aria-label="Sections">
      <TabsTab value="a" data-foo="1" @click="onClick" />
      <!-- @vue-expect-error The tab's own `value` is a string, not the button's. -->
      <TabsTab :value="1" />
    </TabsList>
  </Tabs>
  <Tooltip>
    <TooltipTrigger data-foo="1" @click="onClick" />
    <TooltipContent
      data-foo="1"
      @pointerdown="(event: PointerEvent) => event.pointerId"
    />
    <DayTooltipContent v-slot="{ state }" data-foo="1">{{
      state.payload?.date
    }}</DayTooltipContent>
  </Tooltip>
  <Select>
    <SelectTrigger
      data-foo="1"
      @keydown="(event: KeyboardEvent) => event.key"
    />
    <SelectContent data-foo="1"
      ><SelectItem value="a" data-foo="1" @click="onClick"
    /></SelectContent>
  </Select>
  <Listbox :items="['a']" data-foo="1" @click="onClick" />
  <Slider :default-value="2" data-foo="1"><SliderValue data-foo="1" /></Slider>

  <!-- @vue-expect-error A part takes no attribute its element doesn't. -->
  <TooltipTrigger nonexistent="1" />
  <!-- @vue-expect-error A click is a MouseEvent. -->
  <TooltipTrigger @click="(event: KeyboardEvent) => event.key" />
  <!-- @vue-expect-error A tab button takes no `href`. -->
  <TabsTab value="a" href="/a" />
</template>
