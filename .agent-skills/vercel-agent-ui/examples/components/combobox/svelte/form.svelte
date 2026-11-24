<script lang="ts">
  import { CheckIcon, ChevronDownIcon, XIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxChip,
    ComboboxChipRemove,
    ComboboxChips,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxList,
    ComboboxTrigger,
    ComboboxValue,
  } from "@ui-sdk/svelte/combobox"
  import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
  } from "@ui-sdk/svelte/field"
  import { useLog } from "../../../shared/svelte/log"

  const countries = [
    { value: "ar", label: "Argentina" },
    { value: "au", label: "Australia" },
    { value: "at", label: "Austria" },
    { value: "be", label: "Belgium" },
    { value: "br", label: "Brazil" },
    { value: "ca", label: "Canada" },
    { value: "cl", label: "Chile" },
    { value: "dk", label: "Denmark" },
    { value: "fi", label: "Finland" },
    { value: "fr", label: "France" },
    { value: "de", label: "Germany" },
    { value: "gr", label: "Greece" },
    { value: "jp", label: "Japan" },
    { value: "nl", label: "Netherlands" },
    { value: "es", label: "Spain" },
    { value: "se", label: "Sweden" },
    { value: "ch", label: "Switzerland" },
  ]

  const countryLabel = (value: string) =>
    countries.find((country) => country.value === value)?.label ?? value

  const interests = ["Design", "Engineering", "Marketing", "Research", "Sales"]

  const log = useLog()

  function submit(event: SubmitEvent) {
    event.preventDefault()
    const entries = [
      ...new FormData(event.currentTarget as HTMLFormElement),
    ].map(([name, value]) => `${name}=${value}`)
    log(`Submitted ${entries.join("&")}`)
  }
</script>

<form data-slot="stack" onsubmit={submit}>
  <Field name="country">
    <FieldLabel>Country</FieldLabel>
    <Combobox required itemToLabel={countryLabel}>
      <div data-slot="row">
        <ComboboxInput placeholder="Search countries…" />
        <ComboboxTrigger aria-label="Show countries">
          <ChevronDownIcon aria-hidden="true" />
        </ComboboxTrigger>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No countries found.</ComboboxEmpty>
        <ComboboxList>
          {#each countries as country (country.value)}
            <ComboboxItem value={country.value} label={country.label}>
              {country.label}
              <ComboboxItemIndicator>
                <CheckIcon aria-hidden="true" />
              </ComboboxItemIndicator>
            </ComboboxItem>
          {/each}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
    <FieldDescription>Where we ship your order.</FieldDescription>
    <div>
      <FieldError match="valueMissing">Choose a country.</FieldError>
    </div>
  </Field>
  <Field name="interests">
    <FieldLabel>Interests</FieldLabel>
    <Combobox multiple defaultValue={["Design"]}>
      <ComboboxChips>
        <ComboboxValue>
          {#snippet children({ value })}
            {#each value as string[] as interest (interest)}
              <ComboboxChip value={interest}>
                {interest}
                <ComboboxChipRemove aria-label={`Remove ${interest}`}>
                  <XIcon aria-hidden="true" />
                </ComboboxChipRemove>
              </ComboboxChip>
            {/each}
          {/snippet}
        </ComboboxValue>
        <ComboboxInput placeholder="Add interests…" />
      </ComboboxChips>
      <ComboboxContent>
        <ComboboxList>
          {#each interests as interest (interest)}
            <ComboboxItem value={interest}>
              {interest}
              <ComboboxItemIndicator>
                <CheckIcon aria-hidden="true" />
              </ComboboxItemIndicator>
            </ComboboxItem>
          {/each}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </Field>
  <div data-slot="row">
    <button type="submit">Submit</button>
    <button type="reset">Reset</button>
  </div>
</form>
