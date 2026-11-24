<script lang="ts">
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "@ui-sdk/svelte/accordion"

  const steps = [
    {
      value: "install",
      label: "Install the package",
      content: "Add it with your package manager. It has no dependencies.",
    },
    {
      value: "import",
      label: "Import the parts",
      content: "Import the accordion parts you need from the package.",
    },
    {
      value: "style",
      label: "Style it",
      content: "Every part renders its state as data attributes you can style.",
    },
  ]
</script>

<Accordion multiple defaultValue={["install"]}>
  {#each steps as step (step.value)}
    <AccordionItem value={step.value}>
      <AccordionHeader>
        {#snippet render({ props })}
          <h4 {...props}>
            <AccordionTrigger>
              {#snippet render({ props: triggerProps, state: triggerState })}
                <button {...triggerProps}>
                  {#if triggerState.index >= 0}
                    <span data-slot="hint" aria-hidden="true">
                      {String(triggerState.index + 1).padStart(2, "0")}
                    </span>
                  {/if}
                  <span>{step.label}</span>
                  <span data-slot="hint" aria-hidden="true">
                    {triggerState.open ? "Hide" : "Show"}
                  </span>
                </button>
              {/snippet}
            </AccordionTrigger>
          </h4>
        {/snippet}
      </AccordionHeader>
      <AccordionPanel>
        {step.content}
      </AccordionPanel>
    </AccordionItem>
  {/each}
</Accordion>
