package demo;

// Fuzzy string matching helpers.
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

class Fuzzy {
    // Edit distance: how many inserts, deletes or substitutions turn a into b.
    static int levenshtein(String a, String b) {
        if (a.length() < b.length()) {
            String t = a;
            a = b;
            b = t;
        }
        int[] previous = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) previous[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            int[] current = new int[b.length() + 1];
            current[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(Math.min(previous[j] + 1, current[j - 1] + 1), previous[j - 1] + cost);
            }
            previous = current;
        }
        return previous[b.length()];
    }

    static String normalize(String name) {
        return String.join(" ", name.toLowerCase(Locale.ROOT).trim().split("\\s+"));
    }

    // Index pairs of names within maxDistance edits of each other.
    static int[][] findDuplicates(String[] names, int maxDistance) {
        String[] clean = new String[names.length];
        for (int i = 0; i < names.length; i++) clean[i] = normalize(names[i]);
        List<int[]> pairs = new ArrayList<>();
        for (int i = 0; i < clean.length; i++) {
            for (int j = i + 1; j < clean.length; j++) {
                if (levenshtein(clean[i], clean[j]) <= maxDistance) pairs.add(new int[]{i, j});
            }
        }
        return pairs.toArray(new int[0][]);
    }
}
