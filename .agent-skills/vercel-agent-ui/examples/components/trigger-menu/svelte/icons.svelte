<script lang="ts">
  import {
    ClockIcon,
    ReplyIcon,
    SearchIcon,
    ShareIcon,
    TrashIcon,
  } from "@lucide/svelte"
  import { Field, FieldControl, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    TriggerMenu,
    TriggerMenuContent,
    TriggerMenuInput,
    TriggerMenuItem,
    TriggerMenuItemIcon,
    TriggerMenuList,
  } from "@ui-sdk/svelte/trigger-menu"

  const commands = [
    { value: "reply", icon: ReplyIcon, mirror: true },
    { value: "remind", icon: ClockIcon },
    { value: "search", icon: SearchIcon },
    { value: "share", icon: ShareIcon },
    { value: "clear", icon: TrashIcon },
  ]
</script>

<TriggerMenu triggers={[{ char: "/", boundary: "start", type: "command" }]}>
  <Field>
    <FieldLabel>Message</FieldLabel>
    <FieldControl>
      {#snippet render({ props })}
        <TriggerMenuInput {...props} placeholder="Type / for commands…" />
      {/snippet}
    </FieldControl>
  </Field>
  <TriggerMenuContent>
    <TriggerMenuList>
      {#each commands as command (command.value)}
        <TriggerMenuItem value={command.value}>
          <TriggerMenuItemIcon mirror={command.mirror}>
            <command.icon />
          </TriggerMenuItemIcon>
          {command.value}
        </TriggerMenuItem>
      {/each}
    </TriggerMenuList>
  </TriggerMenuContent>
</TriggerMenu>
