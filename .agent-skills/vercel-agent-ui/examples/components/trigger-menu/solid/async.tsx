import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuEmpty,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuList,
  TriggerMenuStatus,
} from "@ui-sdk/solid/trigger-menu"
import { For } from "solid-js"

const channels = [
  "announcements",
  "design",
  "design-reviews",
  "engineering",
  "general",
  "launches",
  "support",
]

function searchChannels(query: string, { signal }: { signal: AbortSignal }) {
  return new Promise<{ value: string; label: string }[]>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        resolve(
          channels
            .filter((channel) => channel.includes(query.toLowerCase()))
            .map((channel) => ({ value: channel, label: channel }))
        ),
      600
    )
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

function Example() {
  return (
    <TriggerMenu
      triggers={[{ char: "#", type: "channel", items: searchChannels }]}
    >
      <Field>
        <FieldLabel>Message</FieldLabel>
        <FieldControl
          render={(props) => (
            <TriggerMenuInput
              {...props}
              placeholder="Type # to link a channel…"
            />
          )}
        />
      </Field>
      <TriggerMenuContent>
        <TriggerMenuStatus>
          {(state) =>
            state.loading
              ? "Loading channels…"
              : state.count
                ? `${state.count} ${state.count === 1 ? "channel" : "channels"}`
                : ""
          }
        </TriggerMenuStatus>
        <TriggerMenuEmpty>
          {(state) =>
            state.empty && !state.loading
              ? `No channels match “${state.query}”`
              : null
          }
        </TriggerMenuEmpty>
        <TriggerMenuList>
          {(state) => (
            <For each={state.items as TriggerMenuDataItem[]}>
              {(item) => (
                <TriggerMenuItem value={item.value} label={item.label}>
                  {item.label}
                </TriggerMenuItem>
              )}
            </For>
          )}
        </TriggerMenuList>
      </TriggerMenuContent>
    </TriggerMenu>
  )
}

export { Example }
