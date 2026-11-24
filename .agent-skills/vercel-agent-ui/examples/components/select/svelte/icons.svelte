<script lang="ts">
  import {
    CheckIcon,
    ChevronDownIcon,
    TextAlignCenterIcon,
    TextAlignEndIcon,
    TextAlignStartIcon,
  } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIcon,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
    SelectValueIcon,
  } from "@ui-sdk/svelte/select"
</script>

<Field>
  <FieldLabel>Text alignment</FieldLabel>
  <Select defaultValue="start">
    <SelectTrigger>
      <SelectValueIcon />
      <SelectValue />
      <ChevronDownIcon />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="start">
        <SelectItemIcon mirror>
          <TextAlignStartIcon />
        </SelectItemIcon>
        Start
        <SelectItemIndicator>
          <CheckIcon />
        </SelectItemIndicator>
      </SelectItem>
      <SelectItem value="center">
        <SelectItemIcon>
          <TextAlignCenterIcon />
        </SelectItemIcon>
        Center
        <SelectItemIndicator>
          <CheckIcon />
        </SelectItemIndicator>
      </SelectItem>
      <SelectItem value="end">
        <SelectItemIcon mirror>
          <TextAlignEndIcon />
        </SelectItemIcon>
        End
        <SelectItemIndicator>
          <CheckIcon />
        </SelectItemIndicator>
      </SelectItem>
    </SelectContent>
  </Select>
</Field>
