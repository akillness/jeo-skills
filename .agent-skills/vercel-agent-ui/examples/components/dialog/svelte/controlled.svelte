<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import {
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
  } from "@ui-sdk/svelte/dialog"
  import { useLog } from "../../../shared/svelte/log"

  const topics = [
    { label: "Product updates", checked: true },
    { label: "Security alerts", checked: true },
    { label: "Weekly digest", checked: false },
  ]

  const log = useLog()
  let open = $state(false)
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <label data-slot="label">
      <Checkbox
        checked={open}
        onCheckedChange={(next) => (open = next === true)}
      >
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Open
    </label>
  </div>
  <Dialog
    bind:open
    onOpenChange={(next, details) =>
      log(`${next ? "Opened" : "Closed"} (${details.reason})`)}
    onOpenChangeComplete={(next) =>
      log(next ? "Finished opening" : "Finished closing")}
  >
    <DialogTrigger>Notification Settings</DialogTrigger>
    <DialogBackdrop />
    <DialogContent>
      <div data-slot="stack">
        <DialogTitle>Notification settings</DialogTitle>
        <DialogDescription>Choose what we email you about.</DialogDescription>
      </div>
      <div data-slot="stack">
        {#each topics as topic (topic.label)}
          <label data-slot="label">
            <Checkbox defaultChecked={topic.checked}>
              <CheckboxIndicator>
                <CheckIcon aria-hidden="true" />
              </CheckboxIndicator>
            </Checkbox>
            {topic.label}
          </label>
        {/each}
      </div>
      <div data-slot="row">
        <DialogClose data-variant="solid">Done</DialogClose>
      </div>
    </DialogContent>
  </Dialog>
</div>
