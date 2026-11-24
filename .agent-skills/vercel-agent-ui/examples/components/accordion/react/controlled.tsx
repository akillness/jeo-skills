"use client"

import { createAccordionController } from "@ui-sdk/core/accordion"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@ui-sdk/react/accordion"
import { ChevronDownIcon } from "lucide-react"
import * as React from "react"

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
  const [accordion] = React.useState(() => createAccordionController())
  const [value, setValue] = React.useState(["account"])

  return (
    <div>
      <div data-slot="controls">
        <button type="button" onClick={() => accordion.open("security")}>
          Review security
        </button>
      </div>
      <Accordion
        multiple
        value={value}
        onValueChange={setValue}
        controller={accordion}
      >
        {items.map((item) => (
          <AccordionItem
            key={item.value}
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
                <ChevronDownIcon aria-hidden="true" />
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel>{item.content}</AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

export { Example }
