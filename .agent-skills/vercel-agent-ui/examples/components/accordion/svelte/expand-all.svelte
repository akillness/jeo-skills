<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import type { ChangeDetails } from "@ui-sdk/core"
  import { createAccordionController } from "@ui-sdk/core/accordion"
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "@ui-sdk/svelte/accordion"

  const weeks = [
    {
      value: "week-1",
      label: "Week 1: Foundations",
      content:
        "Set up your editor, meet the command line and write your first script.",
    },
    {
      value: "week-2",
      label: "Week 2: Data and types",
      content:
        "Strings, numbers, lists and objects, and how to tell them apart when a program runs.",
    },
    {
      value: "week-3",
      label: "Week 3: Control flow",
      content:
        "Conditions, loops and functions. The project this week is a small text adventure.",
    },
    {
      value: "week-4",
      label: "Week 4: Working with files",
      content:
        "Read and write files, parse CSV and JSON, and handle the errors that come with them.",
    },
    {
      value: "week-5",
      label: "Week 5: Final project",
      content:
        "Build a tool you'll use yourself, then present it to the group in a five-minute demo.",
    },
  ]

  const syllabus = createAccordionController()

  const elements = new Map<string, HTMLElement>()
  function setElement(value: string) {
    return (element: HTMLElement) => {
      elements.set(value, element)
      return () => elements.delete(value)
    }
  }

  let pressed: string | null = null
  function openChange(value: string, open: boolean, details: ChangeDetails) {
    if (open && details.reason === "trigger-press") {
      pressed = value
    } else if (pressed === value) {
      pressed = null
    }
  }

  function openChangeComplete(value: string, open: boolean) {
    if (!open || pressed !== value) {
      return
    }
    pressed = null
    elements
      .get(value)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }
</script>

<div>
  <div data-slot="controls">
    <button type="button" onclick={() => syllabus.openAll()}>Expand all</button>
    <button type="button" onclick={() => syllabus.closeAll()}
      >Collapse all</button
    >
  </div>
  <div data-slot="scroll">
    <Accordion multiple controller={syllabus}>
      {#each weeks as week (week.value)}
        <AccordionItem
          {@attach setElement(week.value)}
          value={week.value}
          onOpenChange={(open, details) =>
            openChange(week.value, open, details)}
          onOpenChangeComplete={(open) => openChangeComplete(week.value, open)}
        >
          <AccordionHeader>
            <AccordionTrigger>
              {week.label}
              <ChevronDownIcon aria-hidden="true" />
            </AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>
            {week.content}
          </AccordionPanel>
        </AccordionItem>
      {/each}
    </Accordion>
  </div>
</div>
