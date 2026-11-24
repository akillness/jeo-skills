"use client"

import {
  Command,
  CommandInput,
  CommandItem,
  CommandItemText,
  CommandList,
} from "@ui-sdk/react/command"
import { CornerDownLeftIcon } from "lucide-react"

const pages = ["Composition", "Installation", "Styling"]

function Example() {
  return (
    <Command>
      <CommandInput aria-label="Search docs" placeholder="Search docs…" />
      <CommandList>
        {pages.map((page) => (
          <CommandItem
            key={page}
            value={page}
            render={<a href={`#${page.toLowerCase()}`} />}
          >
            {(state) => (
              <>
                <CommandItemText>
                  {(text) =>
                    text.segments.map((segment, index) =>
                      segment.match ? (
                        <strong key={index}>{segment.text}</strong>
                      ) : (
                        segment.text
                      )
                    )
                  }
                </CommandItemText>
                {state.highlighted && <CornerDownLeftIcon aria-hidden="true" />}
              </>
            )}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  )
}

export { Example }
