<script lang="ts">
  import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
  } from "../../src/dialog"
  import {
    Field,
    FieldControl,
    FieldDescription,
    FieldLabel,
  } from "../../src/field"
  import { Popover, PopoverContent, PopoverTrigger } from "../../src/popover"
  import { Tabs, TabsList, TabsPanel, TabsTab } from "../../src/tabs"

  let { view }: { view: string } = $props()
</script>

{#if view === "tabs"}
  <Tabs defaultValue="a">
    <TabsList aria-label="Settings">
      <TabsTab value="a" id="account">Account</TabsTab>
    </TabsList>
    <TabsPanel value="a">A</TabsPanel>
  </Tabs>
{:else if view === "dialog"}
  <Dialog defaultOpen modal={false}>
    <DialogTrigger id="mine">Edit</DialogTrigger>
    <DialogContent>
      <DialogTitle>Profile</DialogTitle>
    </DialogContent>
  </Dialog>
{:else if view === "popover"}
  <Popover defaultOpen>
    <PopoverTrigger id="mine">Open</PopoverTrigger>
    <PopoverContent>Body</PopoverContent>
  </Popover>
{:else if view === "label"}
  <Field>
    <FieldLabel id="email-label">Email</FieldLabel>
    <FieldControl />
  </Field>
{:else if view === "description"}
  <Field>
    <FieldLabel>Email</FieldLabel>
    <FieldDescription id="email-hint">Work address.</FieldDescription>
    <FieldControl />
  </Field>
{:else if view === "control"}
  <Field>
    <FieldControl id="email" type="checkbox" />
    <FieldLabel>Email me</FieldLabel>
  </Field>
{/if}
