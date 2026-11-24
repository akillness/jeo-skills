<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "@ui-sdk/svelte/accordion"

  const items = [
    {
      value: "overview",
      label: "Overview",
      content: "A summary of the project, its goals and its owners.",
    },
    {
      value: "timeline",
      label: "Timeline",
      content: "Kickoff in March, beta in June and launch in September.",
    },
    {
      value: "budget",
      label: "Budget",
      content: "Approved for two engineers and one designer for six months.",
    },
  ]
</script>

<Accordion collapsible={false} defaultValue={["overview"]}>
  {#each items as item (item.value)}
    <AccordionItem value={item.value}>
      <AccordionHeader>
        <AccordionTrigger>
          {item.label}
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        {item.content}
      </AccordionPanel>
    </AccordionItem>
  {/each}
</Accordion>
