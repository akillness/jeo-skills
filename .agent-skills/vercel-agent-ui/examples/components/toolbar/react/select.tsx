"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { Toolbar, ToolbarButton } from "@ui-sdk/react/toolbar"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const zooms = ["50%", "75%", "100%", "150%", "200%"]

function Example() {
  const log = useLog()
  const [zoom, setZoom] = React.useState("100%")
  const index = zooms.indexOf(zoom)
  const change = (value: string) => {
    setZoom(value)
    log(`Zoom ${value}`)
  }
  return (
    <Toolbar aria-label="View">
      <ToolbarButton
        aria-label="Zoom out"
        disabled={index === 0}
        onClick={() => change(zooms[index - 1])}
      >
        <ZoomOutIcon aria-hidden="true" />
      </ToolbarButton>
      <Select value={zoom} onValueChange={(value) => value && change(value)}>
        <ToolbarButton render={<SelectTrigger />} aria-label="Zoom">
          <SelectValue />
          <ChevronsUpDownIcon aria-hidden="true" />
        </ToolbarButton>
        <SelectContent>
          {zooms.map((zoom) => (
            <SelectItem key={zoom} value={zoom}>
              {zoom}
              <SelectItemIndicator>
                <CheckIcon aria-hidden="true" />
              </SelectItemIndicator>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ToolbarButton
        aria-label="Zoom in"
        disabled={index === zooms.length - 1}
        onClick={() => change(zooms[index + 1])}
      >
        <ZoomInIcon aria-hidden="true" />
      </ToolbarButton>
    </Toolbar>
  )
}

export { Example }
