<script lang="ts">
  import { createDrawerController, type SnapPoint } from "@ui-sdk/core/drawer"
  import {
    Drawer,
    DrawerBackdrop,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerHandle,
    DrawerShortcut,
    DrawerTitle,
    DrawerTrigger,
  } from "../../src/drawer"

  let {
    open = false,
    controlled = false,
    snapPoints = [0.5, 1],
    snapPoint,
    defaultSnapPoint,
    modalAbove,
    remote = false,
    shortcut = false,
  }: {
    open?: boolean
    controlled?: boolean
    snapPoints?: SnapPoint[]
    snapPoint?: SnapPoint
    defaultSnapPoint?: SnapPoint
    modalAbove?: SnapPoint
    remote?: boolean
    shortcut?: boolean
  } = $props()

  const goal = createDrawerController()
</script>

{#if remote}
  <DrawerTrigger controller={goal} shortcut="mod+g"
    >Move goal<DrawerShortcut /></DrawerTrigger
  >
  <Drawer controller={goal}
    ><DrawerContent><DrawerTitle>Move goal</DrawerTitle></DrawerContent></Drawer
  >
{:else if shortcut}
  <Drawer
    ><DrawerTrigger shortcut="mod+g">Move goal<DrawerShortcut /></DrawerTrigger
    ></Drawer
  >
{:else}
  <Drawer
    open={controlled ? open : undefined}
    defaultOpen={controlled ? undefined : open}
    {snapPoints}
    {snapPoint}
    {defaultSnapPoint}
    {modalAbove}
    side="start"
  >
    <DrawerTrigger>Move goal</DrawerTrigger>
    <DrawerBackdrop />
    <DrawerContent>
      <DrawerHandle aria-label="Resize" />
      <DrawerTitle>Move goal</DrawerTitle>
      <DrawerDescription>Set your daily activity goal.</DrawerDescription>
      <DrawerClose>Cancel</DrawerClose>
    </DrawerContent>
  </Drawer>
{/if}
