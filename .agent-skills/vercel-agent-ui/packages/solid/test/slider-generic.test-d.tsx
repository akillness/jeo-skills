// Compiled by `pnpm typecheck`, never run.
import { Slider, type SliderOptions } from "../src/slider"

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
const exactly = <T, Expected>(_value: T, _same: Equal<T, Expected>) => {}

// The callbacks' value is the value's type itself, with nothing beside it.
const one = (
  <Slider<number>
    onValueChange={(value) => exactly<typeof value, number>(value, true)}
  />
)
const range = (
  <Slider
    defaultValue={[20, 80]}
    onValueCommit={(value) => exactly<typeof value, number[]>(value, true)}
  />
)
// @ts-expect-error Values are numbers.
const wrong = <Slider value="50" />

// A generic component passes its own value type on, spread or prop by prop.
function Forwarded<T extends number | number[]>(props: SliderOptions<T>) {
  return <Slider<T> {...props} />
}
function Picked<T extends number | number[]>(props: {
  value: T
  onValueChange: (value: T) => void
}) {
  return <Slider value={props.value} onValueChange={props.onValueChange} />
}

export { Forwarded, Picked, one, range, wrong }
