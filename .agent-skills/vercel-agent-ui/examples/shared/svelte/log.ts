import { getContext, hasContext } from "svelte"

const LogKey = Symbol("log")

function useLog() {
  if (hasContext(LogKey)) {
    return getContext<(message: string) => void>(LogKey)
  }
  return (message: string) => console.log(message)
}

export { LogKey, useLog }
