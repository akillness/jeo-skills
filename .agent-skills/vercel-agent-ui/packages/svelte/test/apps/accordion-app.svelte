<script lang="ts">
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "../../src/accordion"

  let {
    defaultValue,
    hiddenUntilFound,
    keepMounted,
  }: {
    defaultValue?: string[]
    hiddenUntilFound?: boolean
    keepMounted?: boolean
  } = $props()
</script>

<Accordion {defaultValue} {hiddenUntilFound}>
  {#each ["a", "b"] as value (value)}
    <AccordionItem {value}>
      <AccordionHeader
        ><AccordionTrigger>Trigger {value}</AccordionTrigger></AccordionHeader
      >
      <AccordionPanel {keepMounted}>Panel {value}</AccordionPanel>
    </AccordionItem>
  {/each}
</Accordion>
