<script lang="ts">
  import { Toggle, ToggleGroup } from "@ui-sdk/svelte/toggle"

  const views = [
    { value: "list", label: "قائمة" },
    { value: "grid", label: "شبكة" },
    { value: "cards", label: "بطاقات" },
  ]
</script>

<div dir="rtl">
  <ToggleGroup defaultValue={["list"]} aria-label="العرض">
    {#each views as item (item.value)}
      <Toggle value={item.value}>
        {item.label}
      </Toggle>
    {/each}
  </ToggleGroup>
</div>
