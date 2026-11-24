<script lang="ts">
  import { Listbox, ListboxItem } from "../../src/listbox"

  let value = $state("b")
  export function rename(next: string) {
    value = next
  }
</script>

<Listbox aria-label="Fruit">
  <ListboxItem value="a">A</ListboxItem>
  <ListboxItem {value}>B</ListboxItem>
  <ListboxItem value="c">C</ListboxItem>
</Listbox>
