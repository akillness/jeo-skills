"use client"

import * as React from "react"

const LogContext = React.createContext((message: string) =>
  console.log(message)
)

function useLog() {
  return React.useContext(LogContext)
}

export { LogContext, useLog }
