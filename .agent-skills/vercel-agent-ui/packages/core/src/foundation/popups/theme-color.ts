// Dims `<meta name="theme-color">` with a sheet's backdrop, so Safari's status
// bar and toolbar darken with the page, as they do around a native sheet.
// Safari re-tints its chrome on every change, which is expensive, so callers
// write only where motion starts and ends, never per frame.

function channels(color: string) {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color)
  return match ? [match[1], match[2], match[3]].map(Number) : null
}

/**
 * Dims every theme-color meta tag toward black by `dim × alpha`, where `alpha`
 * is how dark the backdrop gets. Pages without one are left alone, since
 * adding one would change their colors. Returns a writer and a restore.
 */
function dimThemeColor(doc: Document, alpha: number) {
  const metas = Array.from(
    doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  )
  const originals = metas.map((meta) => meta.content)
  const bases = originals.map((color) => channels(resolveColor(doc, color)))
  let written = -1

  function write(dim: number) {
    const shade = Math.round(dim * alpha * 100) / 100
    if (shade === written) {
      return
    }
    written = shade
    metas.forEach((meta, index) => {
      const base = bases[index]
      if (!base) {
        return
      }
      meta.content = shade
        ? `rgb(${base.map((channel) => Math.round(channel * (1 - shade))).join(" ")})`
        : originals[index]
    })
  }

  function restore() {
    metas.forEach((meta, index) => (meta.content = originals[index]))
    written = -1
  }

  return { write, restore }
}

// Any CSS color to its computed form, which is rgb() for the usual notations.
function resolveColor(doc: Document, color: string) {
  const probe = doc.createElement("span")
  probe.style.color = color
  probe.style.display = "none"
  doc.body.append(probe)
  const resolved = doc.defaultView?.getComputedStyle(probe).color ?? color
  probe.remove()
  return resolved
}

export { dimThemeColor }
