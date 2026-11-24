<script lang="ts">
  import {
    Drawer,
    DrawerBackdrop,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerOutlet,
    DrawerTitle,
    DrawerTrigger,
  } from "@ui-sdk/svelte/drawer"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Textarea } from "@ui-sdk/svelte/textarea"
  import { Input } from "@ui-sdk/svelte/input"

  const messages = [
    { from: "Inès", text: "The proofs are back from the printer." },
    { from: "Kofi", text: "Lunch on Thursday?" },
    { from: "Wren", text: "Pushed the fix for the release build." },
    { from: "Tomasz", text: "Can you review the launch checklist?" },
  ]
</script>

<Drawer>
  <div>
    <DrawerOutlet
      keyframes={{ scale: [1, 0.94], borderRadius: ["0px", "24px"] }}
    >
      <div data-slot="row">
        <span>Inbox</span>
        <DrawerTrigger data-variant="solid">Compose</DrawerTrigger>
      </div>
      <ul data-slot="list">
        {#each messages as message (message.from)}
          <li>
            <div>{message.from}</div>
            <div data-slot="hint">{message.text}</div>
          </li>
        {/each}
      </ul>
    </DrawerOutlet>
  </div>
  <DrawerBackdrop />
  <DrawerContent>
    <div data-slot="grip" aria-hidden="true"></div>
    <div data-slot="stack">
      <DrawerTitle>New message</DrawerTitle>
      <DrawerDescription>Write a quick note to the team.</DrawerDescription>
    </div>
    <Field>
      <FieldLabel>To</FieldLabel>
      <Input defaultValue="Design team" />
    </Field>
    <Field>
      <FieldLabel>Message</FieldLabel>
      <Textarea placeholder="What's new?" />
    </Field>
    <div data-slot="stack">
      <DrawerClose data-variant="solid" value="send">Send</DrawerClose>
    </div>
  </DrawerContent>
</Drawer>
