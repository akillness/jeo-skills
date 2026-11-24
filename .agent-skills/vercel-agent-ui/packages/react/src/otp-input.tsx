import {
  otpInput,
  type OTPInputOptions,
  type OTPInputSlotProps,
  type OTPInputSlotState,
  type OTPInputState,
} from "@ui-sdk/core/otp-input"
import * as React from "react"
import { useFieldControl } from "./field-context"
import {
  createParts,
  slotIn,
  useHandle,
  usePart,
  type PartProps,
} from "./use-primitive"

const parts = createParts(otpInput, {
  root: "div",
  group: "div",
  separator: "div",
})

type DivProps<State> = Omit<
  PartProps<"div", State>,
  "defaultValue" | "onChange" | "onSelect"
>

// Props that belong to the input, which is what takes focus and is named.
type InputProps = Pick<
  React.ComponentProps<"input">,
  | "id"
  | "autoFocus"
  | "aria-label"
  | "aria-labelledby"
  | "aria-describedby"
  | "aria-invalid"
>

// Content, then the input after it, with function children resolved.
function withInput<State>(
  children: DivProps<State>["children"],
  input: React.ReactNode
) {
  return (state: State) => (
    <>
      {typeof children === "function" ? children(state) : children}
      {input}
    </>
  )
}

// The one real input, over the slots.
function OTPInputControl(props: InputProps) {
  const otp = useHandle(otpInput)
  const field = useFieldControl()
  // The core writes the input's value, so React only renders where it starts.
  const [initial] = React.useState(
    () => slotIn(otp, "control").value as string | undefined
  )
  const render = (control: Record<string, any>) => {
    const { value: _, ...input }: Record<string, any> = field
      ? field.props(control)
      : control
    return <input {...input} defaultValue={initial} />
  }
  return usePart(otp, "control", {}, { ...props, render }, "input")
}

/**
 * The root: the slots, and the one real input over them. `id`, `autoFocus`
 * and the `aria-*` naming props go to that input.
 * @stable
 */
function OTPInput({
  disabled,
  name,
  id,
  autoFocus,
  "aria-label": label,
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  children,
  ...props
}: OTPInputOptions & InputProps & DivProps<OTPInputState>) {
  const field = useFieldControl()
  const input = (
    <OTPInputControl
      id={id}
      autoFocus={autoFocus}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid}
    />
  )
  return (
    <parts.Root
      {...props}
      disabled={disabled || field?.disabled}
      name={name ?? field?.name}
    >
      {withInput(children, input)}
    </parts.Root>
  )
}

/**
 * Lays out a run of slots.
 * @stable
 */
const OTPInputGroup = parts.Group

const char = (state: OTPInputSlotState) => state.char

/**
 * One character of the code. Without children, it shows the character.
 * @stable
 */
function OTPInputSlot({
  index,
  children = char,
  ...props
}: OTPInputSlotProps & DivProps<OTPInputSlotState>) {
  // Slots are told apart by their index.
  return usePart(
    otpInput,
    "slot",
    { index, id: String(index) },
    { ...props, children }
  )
}

/**
 * Drawn between groups, like a dash.
 * @stable
 */
const OTPInputSeparator = parts.Separator

export { createOTPInputController } from "@ui-sdk/core/otp-input"
export type {
  OTPInputApi,
  OTPInputChangeOptions,
  OTPInputController,
  OTPInputOptions,
  OTPInputPattern,
  OTPInputSlotData,
  OTPInputSlotProps,
  OTPInputSlotState,
  OTPInputState,
  OTPInputValueChangeReason,
  OtpInputPrimitive,
} from "@ui-sdk/core/otp-input"

export { OTPInput, OTPInputGroup, OTPInputSeparator, OTPInputSlot }
