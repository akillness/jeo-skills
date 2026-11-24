<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "@ui-sdk/svelte/accordion"

  const sections: {
    value: string
    label: string
    content?: string
    topics?: { value: string; label: string; content: string }[]
  }[] = [
    {
      value: "profile",
      label: "Profile",
      content: "Your name, photo and the email address people see.",
    },
    {
      value: "notifications",
      label: "Notifications",
      topics: [
        {
          value: "email",
          label: "Email",
          content: "A weekly digest, and mentions as they happen.",
        },
        {
          value: "push",
          label: "Push",
          content: "Direct messages and replies to your comments.",
        },
      ],
    },
    {
      value: "billing",
      label: "Billing",
      topics: [
        {
          value: "payment",
          label: "Payment methods",
          content: "A Visa card ending in 4242, used for every renewal.",
        },
        {
          value: "invoices",
          label: "Invoices",
          content: "Download a PDF of any invoice from the last two years.",
        },
      ],
    },
  ]
</script>

<Accordion defaultValue={["notifications"]}>
  {#each sections as section (section.value)}
    <AccordionItem value={section.value}>
      <AccordionHeader>
        <AccordionTrigger>
          {section.label}
          <ChevronDownIcon aria-hidden="true" />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel>
        {#if section.topics}
          <Accordion multiple>
            {#each section.topics as topic (topic.value)}
              <AccordionItem value={topic.value}>
                <AccordionHeader>
                  {#snippet render({ props })}
                    <h4 {...props}>
                      <AccordionTrigger>
                        {topic.label}
                        <ChevronDownIcon aria-hidden="true" />
                      </AccordionTrigger>
                    </h4>
                  {/snippet}
                </AccordionHeader>
                <AccordionPanel>
                  {topic.content}
                </AccordionPanel>
              </AccordionItem>
            {/each}
          </Accordion>
        {:else}
          <div>{section.content}</div>
        {/if}
      </AccordionPanel>
    </AccordionItem>
  {/each}
</Accordion>
