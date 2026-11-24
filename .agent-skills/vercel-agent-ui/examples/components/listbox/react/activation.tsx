"use client"

import { Listbox, ListboxItem, ListboxItemIcon } from "@ui-sdk/react/listbox"
import { FileIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const files = [
  { value: "readme", label: "README.md" },
  { value: "package", label: "package.json" },
  { value: "tsconfig", label: "tsconfig.json" },
  { value: "index", label: "index.ts" },
  { value: "styles", label: "styles.css" },
  { value: "logo", label: "logo.svg" },
]

function Example() {
  const log = useLog()

  return (
    <Listbox
      multiple
      activation="automatic"
      defaultValue={["readme"]}
      onValueChange={(value, details) =>
        log(`${value.length} selected (${details.reason})`)
      }
      aria-label="Files"
    >
      {files.map((file) => (
        <ListboxItem key={file.value} value={file.value}>
          <ListboxItemIcon>
            <FileIcon aria-hidden="true" />
          </ListboxItemIcon>
          {file.label}
        </ListboxItem>
      ))}
    </Listbox>
  )
}

export { Example }
