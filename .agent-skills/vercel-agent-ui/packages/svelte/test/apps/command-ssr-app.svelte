<script lang="ts">
  import { Command, CommandInput } from "../../src/command"
</script>

<Command items={["Settings", "Calendar", "Reset settings"]} defaultQuery="set">
  <CommandInput aria-label="Search commands" />
</Command>
