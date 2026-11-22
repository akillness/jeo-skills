// Find near-duplicate customer names, the slow way.
//     java App.java
import java.util.Random;

public class App {
    static final String[] FIRST = {"Maria", "Giulia", "Sofia", "Luca", "Marco", "Matteo", "José", "Zoë", "Łukasz", "Aiko",
        "Chen", "Olga", "Ahmed", "Fatima", "Liam", "Emma", "Noah", "Ava", "Mateo", "Ingrid"};
    static final String[] LAST = {"Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "García", "Müller", "Nowak", "Tanaka",
        "Wang", "Ivanova", "Haddad", "Smith", "Johnson", "Brown", "Silva", "Kowalski", "Novák", "Dubois", "Larsen"};

    static String[] makeNames(int count, long seed) {
        Random rng = new Random(seed);
        String[] names = new String[count];
        for (int k = 0; k < count; k++) {
            String name = FIRST[rng.nextInt(FIRST.length)] + " " + LAST[rng.nextInt(LAST.length)];
            if (rng.nextDouble() < 0.35) {
                int i = rng.nextInt(name.length());
                name = name.substring(0, i) + "aeiourstln".charAt(rng.nextInt(10)) + name.substring(i + 1);
            }
            names[k] = name;
        }
        return names;
    }

    public static void main(String[] args) {
        String[] names = makeNames(4000, 7);
        int[][] pairs = Fuzzy.findDuplicates(names, 2);
        System.out.println(names.length + " names, " + pairs.length + " likely duplicate pairs");
        int shown = 0;
        for (int[] p : pairs) {
            if (shown == 5) break;
            if (!names[p[0]].equals(names[p[1]])) {
                System.out.println("  " + names[p[0]] + " ~ " + names[p[1]]);
                shown++;
            }
        }
    }
}
