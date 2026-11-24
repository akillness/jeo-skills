<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "../../src/field"
  import { Input } from "../../src/input"
  import { Select, SelectTrigger } from "../../src/select"

  let { order, kind }: { order: "before" | "after"; kind: "input" | "select" } =
    $props()
</script>

<Field>
  <FieldLabel>Fruit</FieldLabel>
  {#if order === "before"}<FieldDescription>Pick one.</FieldDescription>{/if}
  {#if kind === "input"}
    <Input />
  {:else}
    <Select><SelectTrigger /></Select>
  {/if}
  {#if order === "after"}<FieldDescription>Pick one.</FieldDescription>{/if}
</Field>
