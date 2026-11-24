// UIScrollView's rubber band: x px of travel past an edge shows as
// (1 − 1 / (x·c / d + 1))·d, which approaches but never reaches d.
// https://oleb.net/blog/2014/05/scrollview-inertia-bouncing-rubberbanding/
const iosRubberBandCoefficient = 0.55

/**
 * How far something dragged `overshoot` px past an edge shows, resisting more the further it goes, like iOS.
 * @experimental
 */
function rubberBand(
  overshoot: number,
  dimension: number,
  coefficient = iosRubberBandCoefficient
) {
  if (overshoot <= 0) {
    return 0
  }
  return (1 - 1 / ((overshoot * coefficient) / dimension + 1)) * dimension
}

// The travel that shows as `shown`. Used when a drag starts inside the band, so
// the finger picks up the sheet where it is instead of jumping.
function rubberBandInverse(
  shown: number,
  dimension: number,
  coefficient = iosRubberBandCoefficient
) {
  if (shown <= 0) {
    return 0
  }
  const ratio = Math.min(shown / dimension, 0.999999)
  return ((1 / (1 - ratio) - 1) * dimension) / coefficient
}

// d(shown)/d(travel). A release inside the band hands the spring the finger's
// velocity times this slope, so the sheet doesn't jump in speed.
function rubberBandSlope(
  overshoot: number,
  dimension: number,
  coefficient = iosRubberBandCoefficient
) {
  if (overshoot <= 0) {
    return 1
  }
  const base = (overshoot * coefficient) / dimension + 1
  return coefficient / (base * base)
}

export { rubberBand, rubberBandInverse, rubberBandSlope }
