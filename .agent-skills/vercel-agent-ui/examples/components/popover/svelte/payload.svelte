<script lang="ts">
  import { Field, FieldControl, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    createPopoverController,
    Popover,
    PopoverContent,
    type PopoverContentState,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"
  import { useLog } from "../../../shared/svelte/log"

  type Member = { name: string; role: string }

  const roles = ["Admin", "Editor", "Viewer"]

  const log = useLog()
  const popover = createPopoverController<Member>()
  let members = $state<Member[]>([
    { name: "Hollis Grant", role: "Owner" },
    { name: "Inès Moreau", role: "Editor" },
    { name: "Kofi Mensah", role: "Viewer" },
    { name: "Wren Takahashi", role: "Viewer" },
  ])
  const newest = $derived(members[members.length - 1])

  function save(
    event: SubmitEvent & { currentTarget: HTMLFormElement },
    member: Member | undefined
  ) {
    if ((event.submitter as HTMLButtonElement).value !== "save" || !member) {
      return
    }
    const role = String(new FormData(event.currentTarget).get("role"))
    members = members.map((entry) =>
      entry.name === member.name ? { ...entry, role } : entry
    )
  }
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button
      type="button"
      onclick={async (event) => {
        const result = await popover.open({
          payload: newest,
          anchor: event.currentTarget,
        })
        log(
          `Closed (${result.reason}), returned ${result.returnValue ?? "nothing"}`
        )
      }}
    >
      Edit Newest Member
    </button>
  </div>
  <ul data-slot="list">
    {#each members as member (member.name)}
      <li data-slot="row">
        {member.name}
        <span data-slot="hint">{member.role}</span>
        <PopoverTrigger
          controller={popover}
          payload={member}
          disabled={member.role === "Owner"}
          data-size="sm"
          data-variant="ghost"
          aria-label={`Edit ${member.name}`}
        >
          Edit
        </PopoverTrigger>
      </li>
    {/each}
  </ul>
  <Popover
    controller={popover}
    onPayloadChange={(payload) => {
      const member = payload as Member | undefined
      if (member) {
        log(`Editing ${member.name}`)
      }
    }}
  >
    <PopoverContent align="end" sideOffset={8}>
      {#snippet children(state: PopoverContentState<Member>)}
        <PopoverTitle>{state.payload?.name}</PopoverTitle>
        <PopoverDescription
          >Roles decide what they can change.</PopoverDescription
        >
        <form
          data-slot="stack"
          method="dialog"
          onsubmit={(event) => save(event, state.payload)}
        >
          <Field>
            <FieldLabel>Role</FieldLabel>
            {#key state.payload?.name}
              <FieldControl name="role" defaultValue={state.payload?.role}>
                {#snippet render({ props })}
                  <select {...props}>
                    {#each roles as role (role)}
                      <option>{role}</option>
                    {/each}
                  </select>
                {/snippet}
              </FieldControl>
            {/key}
          </Field>
          <div data-slot="row">
            <button type="submit" value="cancel" formnovalidate>Cancel</button>
            <button type="submit" value="save" data-variant="solid">Save</button
            >
          </div>
        </form>
      {/snippet}
    </PopoverContent>
  </Popover>
</div>
