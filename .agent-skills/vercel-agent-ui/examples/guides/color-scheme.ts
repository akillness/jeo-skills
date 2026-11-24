import { createColorScheme, createLocalStorage } from "@ui-sdk/core"

const colorScheme = createColorScheme({
  storage: createLocalStorage("guides-color-scheme"),
})

export { colorScheme }
