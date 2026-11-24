<!--
@component
The root: a group around the image and its controls, busy until the image loads. `bind:crop` controls it.
@experimental
-->
<script lang="ts">
  import {
    imageCropper as imageCropperPrimitive,
    type ImageCrop,
    type ImageCropperController,
    type ImageCropperCropChangeDetails,
    type ImageCropperCropCommitDetails,
    type ImageCropperMode,
    type ImageCropperShape,
    type ImageCropperState,
  } from "@ui-sdk/core/image-cropper"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    src,
    crop = $bindable(),
    defaultCrop,
    mode,
    aspectRatio,
    shape,
    minWidth,
    minHeight,
    maxZoom,
    disabled,
    controller,
    debug,
    onCropChange,
    onCropCommit,
    ...rest
  }: PartProps<"div", ImageCropperState> & {
    /** The image's URL, like an object URL for a file someone picked. */
    src?: string
    /** The crop, in the image's own pixels, with its `rotation`, `flipX` and `flipY`. Bind it with `bind:crop` to control the cropper. */
    crop?: ImageCrop
    /** The crop at first, when uncontrolled. Without one, a crop at `aspectRatio` in the middle: four fifths of the largest in a box, the largest in a frame. */
    defaultCrop?: ImageCrop
    /** `"box"` moves and resizes a selection over the image; `"frame"` pans and zooms the image under a still one. */
    mode?: ImageCropperMode
    /** Keeps the crop's width over its height, like `1` for a square. */
    aspectRatio?: number
    /** The selection's shape, as `data-shape`. Pass the same shape to `cropImage`. */
    shape?: ImageCropperShape
    /** The narrowest the crop gets, in image pixels. */
    minWidth?: number
    /** The shortest the crop gets, in image pixels. */
    minHeight?: number
    /** How far the crop magnifies the image, where 1 is the largest crop. */
    maxZoom?: number
    /** Stops every change. */
    disabled?: boolean
    /** Sets the crop from anywhere. Create one with `createImageCropperController()`. */
    controller?: ImageCropperController
    /** Logs every crop change with its reason. */
    debug?: boolean
    /** Runs while the crop changes: on every step of a drag, a key or the wheel. `details.cancel()` keeps the crop. */
    onCropChange?: (
      crop: Required<ImageCrop>,
      details: ImageCropperCropChangeDetails
    ) => void
    /** Runs once an interaction that changed the crop ends. For saving. */
    onCropCommit?: (
      crop: Required<ImageCrop>,
      details: ImageCropperCropCommitDetails
    ) => void
  } = $props()

  const id = $props.id()
  const cropper = usePrimitive(imageCropperPrimitive, () => ({
    id,
    src,
    get crop() {
      return crop
    },
    defaultCrop,
    mode,
    aspectRatio,
    shape,
    minWidth,
    minHeight,
    maxZoom,
    disabled,
    controller,
    debug,
    onCropChange: (
      next: Required<ImageCrop>,
      details: ImageCropperCropChangeDetails
    ) => {
      // The callback runs first, so canceling there also keeps a bound `crop` as it was.
      onCropChange?.(next, details)
      if (!details.canceled) {
        crop = next
      }
    },
    onCropCommit,
  }))
  provideInstance(imageCropperPrimitive, cropper)
  const root = useHandlePart(cropper, "root")
</script>

<Part tag="div" part={root} props={rest} />
