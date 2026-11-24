<script lang="ts">
  import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTrigger,
  } from "../../src/alert-dialog"
  import { Dialog, DialogContent, DialogTrigger } from "../../src/dialog"
  import { Drawer, DrawerContent, DrawerTrigger } from "../../src/drawer"

  let { kind }: { kind: "dialog" | "alert dialog" | "drawer" } = $props()
  let open = $state(false)

  export function set(next: boolean) {
    open = next
  }
</script>

{#if kind === "dialog"}
  <Dialog {open}>
    <DialogTrigger>Edit profile</DialogTrigger>
    <DialogContent>Body</DialogContent>
  </Dialog>
{:else if kind === "drawer"}
  <Drawer {open}>
    <DrawerTrigger>Edit profile</DrawerTrigger>
    <DrawerContent>Body</DrawerContent>
  </Drawer>
{:else}
  <AlertDialog {open}>
    <AlertDialogTrigger>Edit profile</AlertDialogTrigger>
    <AlertDialogContent>Body</AlertDialogContent>
  </AlertDialog>
{/if}
