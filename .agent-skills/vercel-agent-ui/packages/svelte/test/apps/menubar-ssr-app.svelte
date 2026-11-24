<script lang="ts">
  import { Menu, MenuTrigger } from "../../src/menu"
  import { Menubar } from "../../src/menubar"
</script>

<Menubar aria-label="Editor">
  <Menu><MenuTrigger disabled>File</MenuTrigger></Menu>
  <Menu><MenuTrigger>Edit</MenuTrigger></Menu>
</Menubar>
