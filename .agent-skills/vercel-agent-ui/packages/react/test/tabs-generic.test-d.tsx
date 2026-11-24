import { Tabs, TabsTab } from "../src/tabs"

// `T` comes from `value`, and reaches `onValueChange` and the root's state.
;<Tabs
  value="account"
  onValueChange={(value) => {
    const known: "account" | null = value
    // @ts-expect-error `value` is "account" or null, not a number.
    const wrong: number = value
    void known
    void wrong
  }}
  className={(state) => (state.value === "account" ? "on" : "off")}
>
  <TabsTab value="account">Account</TabsTab>
</Tabs>
// Without a value, it's any string.
;<Tabs onValueChange={(value) => value?.toUpperCase()} />
// @ts-expect-error `loop` is a boolean.
;<Tabs loop="yes" />
