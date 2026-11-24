"use client"

import * as React from "react"
import {
  createDrawerController,
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@ui-sdk/react/drawer"
import { useLog } from "../../../shared/react/log"

type PhotoAction = "share" | "duplicate" | "delete" | "cancel"

function Example() {
  const [photoActions] = React.useState(() =>
    createDrawerController<undefined, PhotoAction>()
  )
  const log = useLog()

  async function choose() {
    const { returnValue = "cancel" } = await photoActions.open()
    log(returnValue === "cancel" ? "Canceled" : `Chose ${returnValue}`)
  }

  return (
    <div data-slot="row">
      <button type="button" onClick={choose}>
        Photo Options
      </button>
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
  )
}

export { Example }
