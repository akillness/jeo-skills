// Fuzzy string matching helpers.

/** Edit distance: how many inserts, deletes or substitutions turn a into b. */
export function levenshtein(a: string, b: string): number {
  if (a.length < b.length) [a, b] = [b, a];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    previous = current;
  }
  return previous[b.length];
}

export function normalize(name: string): string {
  return name.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

/** Index pairs of names within maxDistance edits of each other. */
export function findDuplicates(names: string[], maxDistance: number = 2): [number, number][] {
  const clean = names.map(normalize);
  const pairs: [number, number][] = [];
  for (let i = 0; i < clean.length; i++)
    for (let j = i + 1; j < clean.length; j++)
      if (levenshtein(clean[i], clean[j]) <= maxDistance) pairs.push([i, j]);
  return pairs;
}
