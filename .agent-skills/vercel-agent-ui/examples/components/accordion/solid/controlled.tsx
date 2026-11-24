import { createAccordionController } from "@ui-sdk/core/accordion"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/solid/accordion"
import { createSignal, For } from "solid-js"

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

function Example() {
  const accordion = createAccordionController()
  const [value, setValue] = createSignal(["account"])

  return (
    <div>
      <div data-slot="controls">
        <button type="button" onClick={() => accordion.open("security")}>
          Review security
        </button>
      </div>
      <Accordion
        multiple
        value={value()}
        onValueChange={setValue}
        controller={accordion}
      >
        <For each={items}>
          {(item) => (
            <AccordionItem
              value={item.value}
              onOpenChange={(open, details) => {
                if (
                  !open &&
                  item.value === "security" &&
                  !window.confirm("Close the security settings?")
                ) {
                  details.cancel()
                }
              }}
            >
              <AccordionHeader>
                <AccordionTrigger>
                  {item.label}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>{item.content}</AccordionPanel>
            </AccordionItem>
          )}
        </For>
      </Accordion>
    </div>
  )
}

export { Example }
