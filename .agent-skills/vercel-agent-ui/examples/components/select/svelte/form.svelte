<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"
  import { useLog } from "../../../shared/svelte/log"

  const countries = [
    { value: "au", label: "Australia" },
    { value: "br", label: "Brazil" },
    { value: "ca", label: "Canada" },
    { value: "fr", label: "France" },
    { value: "de", label: "Germany" },
    { value: "jp", label: "Japan" },
    { value: "es", label: "Spain" },
    { value: "se", label: "Sweden" },
  ]

  const topics = ["Design", "Engineering", "Marketing", "Research", "Sales"]

  const frequencies = ["Daily", "Weekly", "Monthly"]

  const log = useLog()

  function submit(event: SubmitEvent) {
    event.preventDefault()
    const entries = [
      ...new FormData(event.currentTarget as HTMLFormElement),
    ].map(([name, value]) => `${name}=${value}`)
    log(`Submitted ${entries.join("&")}`)
  }
</script>

<div data-slot="stack">
  <form id="select-newsletter" data-slot="stack" onsubmit={submit}>
    <Field>
      <FieldLabel>Country</FieldLabel>
      <Select
        name="country"
        autoComplete="country"
        required
        placeholder="Select a country"
      >
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          {#each countries as country (country.value)}
            <SelectItem value={country.value}>
              {country.label}
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>
    </Field>
    <Field>
      <FieldLabel>Topics</FieldLabel>
      <Select name="topics" multiple defaultValue={["Design"]}>
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          {#each topics as topic (topic)}
            <SelectItem value={topic}>
              {topic}
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>
    </Field>
  </form>
  <Field>
    <FieldLabel>Frequency</FieldLabel>
    <Select name="frequency" form="select-newsletter" defaultValue="Weekly">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each frequencies as frequency (frequency)}
          <SelectItem value={frequency}>
            {frequency}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </Field>
  <div data-slot="row">
    <button type="submit" form="select-newsletter" data-variant="solid"
      >Save</button
    >
    <button type="reset" form="select-newsletter">Reset</button>
  </div>
</div>
