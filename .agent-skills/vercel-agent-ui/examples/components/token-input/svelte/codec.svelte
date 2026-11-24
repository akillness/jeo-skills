<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    fromText,
    toText,
    TokenInput,
    TokenInputEditor,
    type TokenCodec,
  } from "@ui-sdk/svelte/token-input"
  import { useLog } from "../../../shared/svelte/log"

  const chat: TokenCodec = {
    format: (token) => `<@${token.value}>`,
    parse: (text) =>
      text.split(/(<@[\w.-]+>)/).map((part) => {
        const id = /^<@([\w.-]+)>$/.exec(part)?.[1]
        return id ? { type: "mention", value: id, label: `@${id}` } : part
      }),
  }

  const draft = fromText("Ping <@hollis> and <@ines> about the launch", chat)

  const log = useLog()
</script>

<Field>
  <FieldLabel>Message</FieldLabel>
  <TokenInput
    codec={chat}
    copy="label"
    defaultValue={draft}
    onValueChange={(value) => log(toText(value, chat))}
  >
    <TokenInputEditor />
  </TokenInput>
</Field>
