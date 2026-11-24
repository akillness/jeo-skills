<script lang="ts">
  import { FileIcon } from "@lucide/svelte"
  import { Listbox, ListboxItem, ListboxItemIcon } from "@ui-sdk/svelte/listbox"
  import { useLog } from "../../../shared/svelte/log"

  const files = [
    { value: "readme", label: "README.md" },
    { value: "package", label: "package.json" },
    { value: "tsconfig", label: "tsconfig.json" },
    { value: "index", label: "index.ts" },
    { value: "styles", label: "styles.css" },
    { value: "logo", label: "logo.svg" },
  ]

  const log = useLog()
</script>

<Listbox
  multiple
  activation="automatic"
  defaultValue={["readme"]}
  onValueChange={(value, details) =>
    log(`${value.length} selected (${details.reason})`)}
  aria-label="Files"
>
  {#each files as file (file.value)}
    <ListboxItem value={file.value}>
      <ListboxItemIcon>
        <FileIcon aria-hidden="true" />
      </ListboxItemIcon>
      {file.label}
    </ListboxItem>
  {/each}
</Listbox>
