import { createContext, useContext } from "solid-js"

const LogContext = createContext((message: string) => console.log(message))

function useLog() {
  return useContext(LogContext)
}

export { LogContext, useLog }
