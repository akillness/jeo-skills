import { getContext } from "svelte"

const RowKey = Symbol("waterfall-row")

type RowContext = { partProps: () => { value: string } }

function useRow() {
  const row = getContext<RowContext | undefined>(RowKey)
  if (!row) {
    throw new Error(
      "Waterfall row headers, indicators, cells and bars must be used inside <WaterfallRow>."
    )
  }
  return row
}

export { type RowContext, RowKey, useRow }
