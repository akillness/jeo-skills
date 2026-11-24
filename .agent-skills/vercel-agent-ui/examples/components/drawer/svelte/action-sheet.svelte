<script lang="ts">
  import {
    createDrawerController,
    Drawer,
    DrawerBackdrop,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerTitle,
  } from "@ui-sdk/svelte/drawer"
  import { useLog } from "../../../shared/svelte/log"

  type PhotoAction = "share" | "duplicate" | "delete" | "cancel"

  const log = useLog()
  const photoActions = createDrawerController<undefined, PhotoAction>()

  async function choose() {
    const { returnValue = "cancel" } = await photoActions.open()
    log(returnValue === "cancel" ? "Canceled" : `Chose ${returnValue}`)
  }
</script>

<div data-slot="row">
  <button type="button" onclick={choose}>Photo Options</button>
  <Drawer controller={photoActions}>
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
