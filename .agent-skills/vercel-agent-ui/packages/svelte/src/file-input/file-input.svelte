<!--
@component
The root: it holds the files, and renders the hidden file input that opens
the picker and that a form submits.
@stable
-->
<script lang="ts">
  import type { CommitDetails } from "@ui-sdk/core"
  import {
    fileInput as fileInputPrimitive,
    type FileInputChange,
    type FileInputController,
    type FileInputOptions,
    type FileInputState,
    type FileInputValueChangeDetails,
    type FileInputValueChangeReason,
    type FileRejection,
  } from "@ui-sdk/core/file-input"
  import { useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import { useControllerEntry } from "../popup.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  type RejectDetails = CommitDetails<FileInputValueChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    accept,
    multiple,
    directory,
    capture,
    maxFiles,
    maxSize,
    minSize,
    validate,
    name,
    form,
    required,
    disabled,
    announcement,
    controller,
    debug,
    onValueChange,
    onReject,
    render,
    children,
    ...rest
  }: PartProps<"div", FileInputState> & {
    /** The files. Bind them with `bind:value`, or pass them to control the file input. */
    value?: File[]
    /** The files at first, when uncontrolled. A form reset returns to them. */
    defaultValue?: File[]
    /** Which files it takes, like the native attribute: MIME types, extensions, or both, as a string or a list. */
    accept?: FileInputOptions["accept"]
    /** Holds more than one file. New files join the ones it has, up to `maxFiles` in all. Without it, a new file replaces the one it has. */
    multiple?: boolean
    /** Picks a whole folder, with every file inside it. Turns on `multiple`. */
    directory?: boolean
    /** Opens the camera on phones instead of the files: `"user"` for the front camera, `"environment"` for the back one, or `true` for the default one. */
    capture?: FileInputOptions["capture"]
    /** How many files it holds at most. */
    maxFiles?: number
    /** The largest file it takes, in bytes. */
    maxSize?: number
    /** The smallest file it takes, in bytes. */
    minSize?: number
    /** Your own check of each file. Return a reason, or a list of them, to reject it. */
    validate?: FileInputOptions["validate"]
    /** The name the files submit under. Without one, nothing is submitted. */
    name?: string
    /** The id of a form to belong to, when it isn't inside that form. */
    form?: string
    /** Blocks form submission until it holds a file, with the browser's own message. */
    required?: boolean
    /** Disables it like a native control: the trigger can't be focused or used, drops and pastes are ignored, and nothing is submitted. */
    disabled?: boolean
    /** What screen readers hear after a change. Return null for nothing. */
    announcement?: (change: FileInputChange) => string | null | undefined
    /** Adds and removes files from anywhere, and connects triggers outside the file input. Create one with `createFileInputController()`. */
    controller?: FileInputController
    /** Logs every change with its reason. */
    debug?: boolean
    /** Runs when files are added or removed, with what changed in the details. `details.cancel()` stops it. */
    onValueChange?: (
      value: File[],
      details: FileInputValueChangeDetails
    ) => void
    /** Runs when files fail the checks, after `onValueChange`, with every reason each failed, even when none were accepted. */
    onReject?: (rejected: FileRejection[], details: RejectDetails) => void
  } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const fileInput = usePrimitive(fileInputPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    accept,
    multiple,
    directory,
    capture,
    maxFiles,
    maxSize,
    minSize,
    validate,
    name: name ?? field?.name(),
    form,
    required,
    disabled: disabled || field?.disabled(),
    announcement,
    controller,
    debug,
    onValueChange: (next: File[], details: FileInputValueChangeDetails) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    onReject,
  }))
  provideInstance(fileInputPrimitive, fileInput)
  useControllerEntry(() => controller, fileInput)
  const root = useHandlePart(fileInput, "root")
  const input = useHandlePart(fileInput, "input")
</script>

<!-- The hidden input lives inside the root. A render snippet gets only your children, so the input goes beside it then: it renders once, whether or not the snippet renders them. -->
{#snippet content(state: FileInputState)}
  {@render children?.(state)}
  <input {...input.slot()} />
{/snippet}

<Part
  tag="div"
  part={root}
  props={{ ...rest, render, children: render ? children : content }}
/>
{#if render}
  <input {...input.slot()} />
{/if}
