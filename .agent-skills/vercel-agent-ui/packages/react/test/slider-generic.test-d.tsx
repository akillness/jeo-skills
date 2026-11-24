import { slider, type SliderOptions } from "@ui-sdk/core/slider"
import { createParts } from "../src/use-primitive"

const { Root: Slider } = createParts(slider, { root: "div" })
declare const volume: number

// One thumb: `T` is a number.
;<Slider
  value={volume}
  onValueChange={(value) => {
    const known: number = value
    // @ts-expect-error `value` is a number, not a list.
    const wrong: number[] = value
    void known
    void wrong
  }}
/>
// A range: `T` is a list, and reaches `onValueCommit` too.
;<Slider
  defaultValue={[20, 80]}
  onValueCommit={(value) => {
    const known: number[] = value
    // @ts-expect-error `value` is a list.
    const wrong: number = value
    void known
    void wrong
  }}
/>
// Without a value, it's either.
;<Slider
  onValueChange={(value) => (typeof value === "number" ? value : value[0])}
/>
// @ts-expect-error Values are numbers.
;<Slider value="50" />

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
const exactly = <T, Expected>(_value: T, _same: Equal<T, Expected>) => {}

// The callback's value is the value's type itself, with nothing beside it.
;<Slider<number>
  onValueChange={(value) => exactly<typeof value, number>(value, true)}
/>
;<Slider
  defaultValue={[20, 80]}
  onValueChange={(value) => exactly<typeof value, number[]>(value, true)}
/>
;<Slider
  onValueCommit={(value) =>
    exactly<typeof value, number | number[]>(value, true)
  }
/>

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
void Forwarded
void Picked
