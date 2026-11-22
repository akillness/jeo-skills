// Find near-duplicate customer names, the slow way.
//     node app.ts
import { findDuplicates } from "./fuzzy.ts";

const FIRST = ["Maria", "Giulia", "Sofia", "Luca", "Marco", "Matteo", "José", "Zoë", "Łukasz", "Aiko",
  "Chen", "Olga", "Ahmed", "Fatima", "Liam", "Emma", "Noah", "Ava", "Mateo", "Ingrid"];
const LAST = ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "García", "Müller", "Nowak", "Tanaka", "Wang",
  "Ivanova", "Haddad", "Smith", "Johnson", "Brown", "Silva", "Kowalski", "Novák", "Dubois", "Larsen"];

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNames(n: number): string[] {
  const random = rng(7);
  const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)];
  return Array.from({ length: n }, () => {
    let name = pick(FIRST) + " " + pick(LAST);
    if (random() < 0.35) {
      const i = Math.floor(random() * name.length);
      name = name.slice(0, i) + pick([..."aeiourstln"]) + name.slice(i + 1);
    }
    return name;
  });
}

const names = makeNames(2000);
const pairs = findDuplicates(names);
console.log(`${names.length} names, ${pairs.length} likely duplicate pairs`);
for (const [i, j] of pairs.filter(([i, j]) => names[i] !== names[j]).slice(0, 5)) console.log(`  ${names[i]} ~ ${names[j]}`);
