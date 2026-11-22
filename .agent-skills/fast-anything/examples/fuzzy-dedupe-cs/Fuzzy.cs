// Fuzzy string matching helpers.
static class Fuzzy
{
    // Edit distance: how many inserts, deletes or substitutions turn a into b.
    static int Levenshtein(string a, string b)
    {
        if (a.Length < b.Length) (a, b) = (b, a);
        var previous = new int[b.Length + 1];
        for (int j = 0; j <= b.Length; j++) previous[j] = j;
        for (int i = 1; i <= a.Length; i++)
        {
            var current = new int[b.Length + 1];
            current[0] = i;
            for (int j = 1; j <= b.Length; j++)
            {
                int cost = a[i - 1] == b[j - 1] ? 0 : 1;
                current[j] = Math.Min(Math.Min(previous[j] + 1, current[j - 1] + 1), previous[j - 1] + cost);
            }
            previous = current;
        }
        return previous[b.Length];
    }

    static string Normalize(string name) =>
        string.Join(" ", name.ToLowerInvariant().Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    // Index pairs of names within maxDistance edits of each other.
    public static int[][] FindDuplicates(string[] names, int maxDistance)
    {
        var clean = new string[names.Length];
        for (int i = 0; i < names.Length; i++) clean[i] = Normalize(names[i]);
        var pairs = new List<int[]>();
        for (int i = 0; i < clean.Length; i++)
        {
            for (int j = i + 1; j < clean.Length; j++)
            {
                if (Levenshtein(clean[i], clean[j]) <= maxDistance) pairs.Add([i, j]);
            }
        }
        return pairs.ToArray();
    }
}
