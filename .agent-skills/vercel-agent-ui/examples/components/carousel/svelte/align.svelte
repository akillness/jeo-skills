<script lang="ts">
  import {
    CheckIcon,
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
  } from "@lucide/svelte"
  import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    CarouselViewport,
  } from "@ui-sdk/svelte/carousel"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectLabel,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  type Align = "start" | "center" | "end"

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

  let align = $state<Align>("center")
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <Select
      items={alignments}
      value={align}
      onValueChange={(next) => next && (align = next as Align)}
    >
      <SelectLabel>Align</SelectLabel>
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each alignments as option (option.value)}
          <SelectItem value={option.value}>
            {option.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>
  <Carousel aria-label="Photos" {align} defaultPage={2}>
    <div data-slot="row">
      <CarouselPrevious aria-label="Previous slide">
        <ChevronLeftIcon />
      </CarouselPrevious>
      <CarouselViewport>
        <CarouselContent>
          {#each photos as photo (photo.name)}
            <CarouselItem>
              <div data-slot="tile">{photo.name}</div>
            </CarouselItem>
          {/each}
        </CarouselContent>
      </CarouselViewport>
      <CarouselNext aria-label="Next slide">
        <ChevronRightIcon />
      </CarouselNext>
    </div>
  </Carousel>
</div>
