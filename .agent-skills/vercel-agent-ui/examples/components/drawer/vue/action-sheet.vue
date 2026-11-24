<script setup lang="ts">
import {
  createDrawerController,
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@ui-sdk/vue/drawer"
import { useLog } from "../../../shared/vue/log"

type PhotoAction = "share" | "duplicate" | "delete" | "cancel"

const photoActions = createDrawerController<undefined, PhotoAction>()
const log = useLog()

async function choose() {
  const { returnValue = "cancel" } = await photoActions.open()
  log(returnValue === "cancel" ? "Canceled" : `Chose ${returnValue}`)
}
</script>

<template>
  <div data-slot="row">
    <button type="button" @click="choose">Photo Options</button>
    <Drawer :controller="photoActions">
      <DrawerBackdrop />
      <DrawerContent>
        <div data-slot="stack">
          <DrawerTitle>Beach.jpg</DrawerTitle>
          <DrawerDescription>Taken today at 9:41.</DrawerDescription>
        </div>
        <div data-slot="stack">
          <DrawerClose value="share">Share</DrawerClose>
          <DrawerClose value="duplicate">Duplicate</DrawerClose>
          <DrawerClose value="delete">Delete</DrawerClose>
          <DrawerClose value="cancel">Cancel</DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>
