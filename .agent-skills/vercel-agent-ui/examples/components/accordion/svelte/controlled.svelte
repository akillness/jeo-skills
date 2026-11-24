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

  const items = [
    {
      value: "account",
      label: "Account",
      content: "Your name, email address and profile photo.",
    },
    {
      value: "security",
      label: "Security",
      content: "Your password, passkeys and two-factor authentication.",
    },
    {
      value: "sessions",
      label: "Sessions",
      content: "Devices signed in to your account in the last 30 days.",
    },
  ]

  const accordion = createAccordionController()

  let value = $state(["account"])

  function confirmClose(item: string, open: boolean, details: ChangeDetails) {
    if (
      !open &&
      item === "security" &&
      !window.confirm("Close the security settings?")
    ) {
      details.cancel()
    }
  }
</script>

<div>
  <div data-slot="controls">
    <button type="button" onclick={() => accordion.open("security")}
      >Review security</button
    >
  </div>
  <Accordion bind:value multiple controller={accordion}>
    {#each items as item (item.value)}
      <AccordionItem
        value={item.value}
        onOpenChange={(open, details) =>
          confirmClose(item.value, open, details)}
      >
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
</div>
