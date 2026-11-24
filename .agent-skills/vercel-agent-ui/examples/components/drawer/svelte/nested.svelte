<script lang="ts">
  import {
    Drawer,
    DrawerBackdrop,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerTitle,
    DrawerTrigger,
  } from "@ui-sdk/svelte/drawer"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
</script>

<Drawer>
  <DrawerTrigger>Account</DrawerTrigger>
  <DrawerBackdrop />
  <DrawerContent>
    <div data-slot="grip" aria-hidden="true"></div>
    <div data-slot="stack">
      <DrawerTitle>Account</DrawerTitle>
      <DrawerDescription>Manage how you sign in.</DrawerDescription>
    </div>
    <dl>
      <div data-slot="row">
        <dt>Email</dt>
        <dd>hollis@example.com</dd>
      </div>
      <div data-slot="row">
        <dt>Password</dt>
        <dd>Changed 3 months ago</dd>
      </div>
      <div data-slot="row">
        <dt>Two-factor</dt>
        <dd>On</dd>
      </div>
    </dl>
    <div data-slot="stack">
      <Drawer>
        <DrawerTrigger>Change Password</DrawerTrigger>
        <DrawerBackdrop />
        <DrawerContent>
          <div data-slot="grip" aria-hidden="true"></div>
          <div data-slot="stack">
            <DrawerTitle>Change password</DrawerTitle>
            <DrawerDescription>Use at least 12 characters.</DrawerDescription>
          </div>
          <Field>
            <FieldLabel>New password</FieldLabel>
            <Input type="password" />
          </Field>
          <div data-slot="stack">
            <DrawerClose data-variant="solid">Update</DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
      <DrawerClose data-variant="solid">Done</DrawerClose>
    </div>
  </DrawerContent>
</Drawer>
