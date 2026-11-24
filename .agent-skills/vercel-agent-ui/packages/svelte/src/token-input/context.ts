import { getContext } from "svelte"

// The id of the token whose content is being rendered.
const TokenKey = Symbol("token-input-token")

function useTokenId(part: string) {
  const id = getContext<string | undefined>(TokenKey)
  if (!id) {
    throw new Error(`<${part}> must be used inside the token snippet.`)
  }
  return id
}

export { TokenKey, useTokenId }
