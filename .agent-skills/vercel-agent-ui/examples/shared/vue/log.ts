import { inject, type InjectionKey } from "vue"

const LogKey: InjectionKey<(message: string) => void> = Symbol("log")

function useLog() {
  return inject(LogKey, (message: string) => console.log(message))
}

export { LogKey, useLog }
