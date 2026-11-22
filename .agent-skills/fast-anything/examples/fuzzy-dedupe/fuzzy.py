"""Fuzzy string matching helpers."""


def levenshtein(a: str, b: str) -> int:
    """Edit distance: how many inserts, deletes or substitutions turn a into b."""
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]


def normalize(name: str) -> str:
    return " ".join(name.lower().split())


def find_duplicates(names: list[str], max_distance: int = 2) -> list[tuple[int, int]]:
    """Index pairs of names within max_distance edits of each other."""
    clean = [normalize(n) for n in names]
    pairs = []
    for i in range(len(clean)):
        for j in range(i + 1, len(clean)):
            if levenshtein(clean[i], clean[j]) <= max_distance:
                pairs.append((i, j))
    return pairs
