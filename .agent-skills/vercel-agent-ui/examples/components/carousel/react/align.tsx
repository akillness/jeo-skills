"use client"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/react/carousel"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import * as React from "react"

const photos = [
  { name: "Dunes" },
  { name: "Forest" },
  { name: "Glacier" },
  { name: "Canyon" },
  { name: "Meadow" },
  { name: "Harbor" },
]
const alignments = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]

function Example() {
  const [align, setAlign] = React.useState<"start" | "center" | "end">("center")

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select
          items={alignments}
          value={align}
          onValueChange={(next) => next && setAlign(next as typeof align)}
        >
          <SelectLabel>Align</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            {alignments.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Carousel aria-label="Photos" align={align} defaultPage={2}>
        <div data-slot="row">
          <CarouselPrevious aria-label="Previous slide">
            <ChevronLeftIcon />
          </CarouselPrevious>
          <CarouselViewport>
            <CarouselContent>
              {photos.map((photo) => (
                <CarouselItem key={photo.name}>
                  <div data-slot="tile">{photo.name}</div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </CarouselViewport>
          <CarouselNext aria-label="Next slide">
            <ChevronRightIcon />
          </CarouselNext>
        </div>
      </Carousel>
    </div>
  )
}

export { Example }
