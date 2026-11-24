<script lang="ts">
  import { Button } from "../../src/button"
  import { Separator } from "../../src/separator"
  import { Toggle, ToggleGroup } from "../../src/toggle"

  let {
    which,
  }: { which: "group" | "button" | "submit" | "separator" | "decorative" } =
    $props()
</script>

{#if which === "group"}
  <ToggleGroup defaultValue={["c"]} aria-label="Alignment">
    <Toggle value="a">A</Toggle>
    <Toggle value="b">B</Toggle>
    <Toggle value="c">C</Toggle>
  </ToggleGroup>
{:else if which === "button"}
  <Button>Save</Button>
{:else if which === "submit"}
  <Button type="submit">Save</Button>
{:else if which === "separator"}
  <Separator orientation="vertical" />
{:else}
  <Separator decorative />
{/if}
