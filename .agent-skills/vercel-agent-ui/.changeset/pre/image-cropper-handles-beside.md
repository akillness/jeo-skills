---
"@ui-sdk/core": patch
---

An image cropper's handles go beside its selection, not inside it, so assistive technology reaches them: a slider's children are hidden from it. Each handle gets its place on the selection's edge or corner as an inline style. Move `ImageCropperHandle` out of `ImageCropperSelection` into the viewport, and drop any CSS that placed handles by `data-position`.
