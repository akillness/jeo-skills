// Text matching the way the search components match, for your own filters,
// sorting and highlights. Case and accents are ignored.
export { fuzzyScore } from "./fuzzy"
export {
  matchRanges,
  matchSegments,
  type MatchRange,
  type MatchSegment,
} from "./match"
