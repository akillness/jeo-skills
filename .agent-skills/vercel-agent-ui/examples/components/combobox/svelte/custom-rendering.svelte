<script lang="ts">
  import {
    CheckIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    SearchIcon,
  } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxLabel,
    ComboboxList,
    ComboboxTrigger,
  } from "@ui-sdk/svelte/combobox"

  const users = [
    { id: 1, name: "Hollis Grant", username: "hollis", role: "Owner" },
    { id: 2, name: "Inès Moreau", username: "ines", role: "Admin" },
    { id: 3, name: "Kofi Mensah", username: "kofi", role: "Member" },
    { id: 4, name: "Wren Takahashi", username: "wren", role: "Member" },
    { id: 5, name: "Tomasz Wójcik", username: "tomasz", role: "Guest" },
  ]
</script>

<Combobox>
  <div data-slot="stack">
    <ComboboxLabel>Assignee</ComboboxLabel>
    <div data-slot="row">
      <ComboboxInput placeholder="Search people…">
        {#snippet render({ props })}
          <div data-slot="row">
            <SearchIcon aria-hidden="true" />
            <input {...props} />
          </div>
        {/snippet}
      </ComboboxInput>
      <ComboboxTrigger aria-label="Show people">
        {#snippet children(state)}
          {#if state.open}
            <ChevronUpIcon aria-hidden="true" />
          {:else}
            <ChevronDownIcon aria-hidden="true" />
          {/if}
        {/snippet}
      </ComboboxTrigger>
    </div>
  </div>
  <ComboboxContent>
    <ComboboxEmpty>No one by that name.</ComboboxEmpty>
    <ComboboxList>
      {#each users as user (user.id)}
        <ComboboxItem
          value={user.username}
          label={user.name}
          keywords={[user.username]}
        >
          {#snippet children(state)}
            <span data-slot="badge">{user.name.slice(0, 1)}</span>
            <span data-slot="stack">
              {user.name}
              <span data-slot="hint">@{user.username}</span>
            </span>
            {#if state.selected}
              <CheckIcon aria-hidden="true" />
            {:else if state.highlighted}
              <kbd data-slot="kbd">Enter</kbd>
            {/if}
          {/snippet}
        </ComboboxItem>
      {/each}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
