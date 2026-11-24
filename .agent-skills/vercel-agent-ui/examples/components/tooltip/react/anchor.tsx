"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"
import { InfoIcon } from "lucide-react"
import * as React from "react"

function Example() {
  const [field, setField] = React.useState<HTMLDivElement | null>(null)

  return (
    <Field>
      <FieldLabel>Webhook URL</FieldLabel>
      <div data-slot="row" ref={setField}>
        <Input placeholder="https://" />
        <Tooltip>
          <TooltipTrigger aria-label="About webhooks">
            <InfoIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent anchor={field} side="bottom" align="start">
            We send a POST request here for every new order.
          </TooltipContent>
        </Tooltip>
      </div>
    </Field>
  )
}

export { Example }
