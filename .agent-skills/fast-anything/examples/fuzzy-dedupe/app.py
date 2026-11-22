"""Find near-duplicate customer names, the slow way.

    python app.py
"""

import random

from fuzzy import find_duplicates

FIRST = ["Maria", "Giulia", "Sofia", "Luca", "Marco", "Matteo", "José", "Zoë", "Łukasz", "Aiko",
         "Chen", "Olga", "Ahmed", "Fatima", "Liam", "Emma", "Noah", "Ava", "Mateo", "Ingrid"]
LAST = ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "García", "Müller", "Nowak", "Tanaka", "Wang",
        "Ivanova", "Haddad", "Smith", "Johnson", "Brown", "Silva", "Kowalski", "Novák", "Dubois", "Larsen"]


def make_names(n, seed=7):
    rng = random.Random(seed)
    names = []
    for _ in range(n):
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        if rng.random() < 0.35:
            i = rng.randrange(len(name))
            name = name[:i] + rng.choice("aeiourstln") + name[i + 1:]
        names.append(name)
    return names


def main():
    names = make_names(700)
    pairs = find_duplicates(names)
    print(f"{len(names)} names, {len(pairs)} likely duplicate pairs")
    typos = [(i, j) for i, j in pairs if names[i] != names[j]]
    for i, j in typos[:5]:
        print(f"  {names[i]!r} ~ {names[j]!r}")


if __name__ == "__main__":
    main()
