// What an image's status is right now, without waiting for an event. A
// complete image either loaded or broke. One without a source has failed.
function imageStatus(
  img: Pick<HTMLImageElement, "complete" | "naturalWidth">,
  hasSource: boolean
) {
  if (!hasSource) {
    return "error" as const
  }
  if (!img.complete) {
    return "loading" as const
  }
  return img.naturalWidth > 0 ? ("loaded" as const) : ("error" as const)
}

export { imageStatus }
