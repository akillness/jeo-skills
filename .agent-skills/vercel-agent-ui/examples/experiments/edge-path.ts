type EdgeSide = "left" | "right" | "top" | "bottom"

type EdgeEnd = { x: number; y: number; side?: EdgeSide }

type EdgeShape = "straight" | "step" | "curve"

type EdgePathOptions = {
  shape?: EdgeShape
  offset?: number
  radius?: number
}

type EdgePath = { d: string; mid: { x: number; y: number } }

const normals: Record<EdgeSide, readonly [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  top: [0, -1],
  bottom: [0, 1],
}

const round = (n: number) => Math.round(n * 100) / 100

function halfway(points: { x: number; y: number }[]) {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let left = lengths.reduce((sum, length) => sum + length, 0) / 2
  for (const [i, length] of lengths.entries()) {
    if (left <= length && length) {
      const t = left / length
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      }
    }
    left -= length
  }
  return points[0]
}

function steps(from: EdgeEnd, to: EdgeEnd, offset: number) {
  const [ax, ay] = normals[from.side ?? "right"]
  const [bx, by] = normals[to.side ?? "left"]
  const a = { x: from.x + ax * offset, y: from.y + ay * offset }
  const b = { x: to.x + bx * offset, y: to.y + by * offset }
  const flat = ax !== 0
  let middle: { x: number; y: number }[]
  if (flat === (bx !== 0)) {
    const ahead = flat
      ? (to.x - from.x) * ax > offset * 2 && ax === -bx
      : (to.y - from.y) * ay > offset * 2 && ay === -by
    if (ahead) {
      const m = flat ? (from.x + to.x) / 2 : (from.y + to.y) / 2
      middle = flat
        ? [
            { x: m, y: from.y },
            { x: m, y: to.y },
          ]
        : [
            { x: from.x, y: m },
            { x: to.x, y: m },
          ]
    } else {
      const m = flat ? (a.y + b.y) / 2 : (a.x + b.x) / 2
      middle = flat
        ? [a, { x: a.x, y: m }, { x: b.x, y: m }, b]
        : [a, { x: m, y: a.y }, { x: m, y: b.y }, b]
    }
  } else {
    const corner = flat ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
    const ahead =
      (corner.x - from.x) * ax + (corner.y - from.y) * ay > 0 &&
      (corner.x - to.x) * bx + (corner.y - to.y) * by > 0
    middle = ahead
      ? [corner]
      : flat
        ? [a, { x: a.x, y: b.y }, b]
        : [a, { x: b.x, y: a.y }, b]
  }
  const points = [from, ...middle, to].map((p) => ({ x: p.x, y: p.y }))
  return points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) {
      return true
    }
    const prev = points[i - 1]
    const next = points[i + 1]
    if (p.x === prev.x && p.y === prev.y) {
      return false
    }
    return !(
      (prev.x === p.x && p.x === next.x) ||
      (prev.y === p.y && p.y === next.y)
    )
  })
}

function edgePath(from: EdgeEnd, to: EdgeEnd, options: EdgePathOptions = {}) {
  const shape = options.shape ?? "curve"
  if (shape === "straight") {
    return {
      d: `M${round(from.x)},${round(from.y)} L${round(to.x)},${round(to.y)}`,
      mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
    }
  }
  if (shape === "curve") {
    const [ax, ay] = normals[from.side ?? "right"]
    const [bx, by] = normals[to.side ?? "left"]
    const reach = Math.max(30, Math.hypot(to.x - from.x, to.y - from.y) / 2)
    const c1 = { x: from.x + ax * reach, y: from.y + ay * reach }
    const c2 = { x: to.x + bx * reach, y: to.y + by * reach }
    const mid = {
      x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8,
      y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8,
    }
    return {
      d: `M${round(from.x)},${round(from.y)} C${round(c1.x)},${round(c1.y)} ${round(c2.x)},${round(c2.y)} ${round(to.x)},${round(to.y)}`,
      mid,
    }
  }
  const points = steps(from, to, options.offset ?? 20)
  const radius = options.radius ?? 8
  let d = `M${round(points[0].x)},${round(points[0].y)}`
  for (let i = 1; i < points.length - 1; i++) {
    const [prev, p, next] = [points[i - 1], points[i], points[i + 1]]
    const r = Math.min(
      radius,
      Math.hypot(p.x - prev.x, p.y - prev.y) / 2,
      Math.hypot(next.x - p.x, next.y - p.y) / 2
    )
    const inX = p.x - Math.sign(p.x - prev.x) * r
    const inY = p.y - Math.sign(p.y - prev.y) * r
    const outX = p.x + Math.sign(next.x - p.x) * r
    const outY = p.y + Math.sign(next.y - p.y) * r
    d += ` L${round(inX)},${round(inY)} Q${round(p.x)},${round(p.y)} ${round(outX)},${round(outY)}`
  }
  const last = points[points.length - 1]
  d += ` L${round(last.x)},${round(last.y)}`
  return { d, mid: halfway(points) }
}

export {
  type EdgeEnd,
  edgePath,
  type EdgePath,
  type EdgePathOptions,
  type EdgeShape,
  type EdgeSide,
}
