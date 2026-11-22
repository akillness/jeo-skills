/*PACKAGE*/
// fast-anything: records calls to /*ID*/ for one run. Generated; removed when the run ends.
final class FastAnythingRec {
    static boolean inside;
    static final int LIMIT = Integer.parseInt(System.getenv().getOrDefault("FAST_ANYTHING_RECORD_LIMIT", "500"));
    static final java.util.Random RNG = new java.util.Random(0xFA57);
    static final java.util.List<String> kept = new java.util.ArrayList<>();
    static final java.util.List<Object[]> keptArgs = new java.util.ArrayList<>();
    static final java.util.Set<String> unsupported = new java.util.LinkedHashSet<>();
    static long calls, skipped, nanos;
    static boolean mutates;
    static java.util.function.Function<Object[], Object> fn;

    static {
        Runtime.getRuntime().addShutdownHook(new Thread(FastAnythingRec::save));
    }

    static synchronized Object record(Object[] args, java.util.function.Function<Object[], Object> f) {
        fn = f;
        inside = true;
        try {
            calls++;
            int slot = kept.size() < LIMIT ? kept.size() : (int) (RNG.nextDouble() * calls);
            String a = null;
            Object[] copy = null;
            if (slot < LIMIT) {
                try {
                    a = Json.enc(args);
                    copy = (Object[]) deepCopy(args);
                } catch (Json.Unsupported e) {
                    skipped++;
                    unsupported.add(e.getMessage());
                }
            }
            long t = System.nanoTime();
            Object r;
            try {
                r = f.apply(args);
            } catch (RuntimeException | Error e) {
                nanos += System.nanoTime() - t;
                if (a != null) store(slot, "{\"args\":" + a + ",\"raises\":" + Json.str(e.getClass().getName()) + "}", null);
                throw e;
            }
            nanos += System.nanoTime() - t;
            if (a != null) {
                try {
                    if (!Json.enc(args).equals(a)) mutates = true;
                } catch (Json.Unsupported e) {
                    // seen before the call: can't happen
                }
                try {
                    store(slot, "{\"args\":" + a + ",\"result\":" + Json.enc(r) + "}", copy);
                } catch (Json.Unsupported e) {
                    skipped++;
                    unsupported.add(e.getMessage());
                }
            }
            return r;
        } finally {
            inside = false;
        }
    }

    static void store(int slot, String line, Object[] args) {
        if (slot < kept.size()) {
            kept.set(slot, line);
            keptArgs.set(slot, args);
        } else {
            kept.add(line);
            keptArgs.add(args);
        }
    }

    static Object deepCopy(Object v) {
        if (v == null) return null;
        if (v.getClass().isArray()) {
            int n = java.lang.reflect.Array.getLength(v);
            Object c = java.lang.reflect.Array.newInstance(v.getClass().getComponentType(), n);
            for (int i = 0; i < n; i++) java.lang.reflect.Array.set(c, i, deepCopy(java.lang.reflect.Array.get(v, i)));
            return c;
        }
        if (v instanceof java.util.List<?> l) {
            java.util.List<Object> c = v instanceof java.util.LinkedList ? new java.util.LinkedList<>() : new java.util.ArrayList<>();
            for (Object x : l) c.add(deepCopy(x));
            return c;
        }
        if (v instanceof java.util.Map<?, ?> m) {
            java.util.Map<Object, Object> c = v instanceof java.util.TreeMap ? new java.util.TreeMap<>()
                : v instanceof java.util.LinkedHashMap ? new java.util.LinkedHashMap<>() : new java.util.HashMap<>();
            for (var e : m.entrySet()) c.put(e.getKey(), deepCopy(e.getValue()));
            return c;
        }
        return v;
    }

    static final int[] SLICES = {0, 1, 2, 3, 5, 8, 13, 21, 34, 55};

    static java.util.List<Object> variants(Object v) {
        java.util.List<Object> out = new java.util.ArrayList<>();
        int n = v instanceof String s ? s.codePointCount(0, s.length())
            : v != null && v.getClass().isArray() ? java.lang.reflect.Array.getLength(v)
            : v instanceof java.util.List<?> l ? l.size() : 0;
        if (n < 2) return out;
        for (int len : SLICES) {
            if (len >= n) break;
            for (int rep = 0; rep < (len < 2 ? 1 : 3); rep++) {
                int off = RNG.nextInt(n - len + 1);
                if (v instanceof String s) {
                    out.add(new String(s.codePoints().skip(off).limit(len).toArray(), 0, len));
                } else if (v instanceof java.util.List<?> l) {
                    out.add(deepCopy(new java.util.ArrayList<>(l.subList(off, off + len))));
                } else {
                    Object c = java.lang.reflect.Array.newInstance(v.getClass().getComponentType(), len);
                    System.arraycopy(v, off, c, 0, len);
                    out.add(deepCopy(c));
                }
            }
        }
        return out;
    }

    static synchronized void save() {
        inside = true;
        java.util.List<String> derived = new java.util.ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        long start = System.nanoTime();
        outer:
        for (Object[] args : keptArgs) {
            if (args == null || fn == null) continue;
            for (int i = 0; i < args.length; i++) {
                for (Object smaller : variants(args[i])) {
                    if (derived.size() >= 200 || System.nanoTime() - start > 3_000_000_000L) break outer;
                    Object[] next = (Object[]) deepCopy(args);
                    next[i] = smaller;
                    try {
                        String a = Json.enc(next);
                        if (!seen.add(a)) continue;
                        Object r = fn.apply(next);
                        derived.add("{\"args\":" + a + ",\"result\":" + Json.enc(r) + ",\"derived\":true}");
                    } catch (Throwable e) {
                        // outside the function's domain: not a fair test
                    }
                }
            }
        }
        try {
            StringBuilder b = new StringBuilder();
            for (String line : kept) b.append(line).append('\n');
            for (String line : derived) b.append(line).append('\n');
            java.nio.file.Files.writeString(java.nio.file.Path.of(System.getenv("FAST_ANYTHING_RECORD_OUT")), b, java.nio.charset.StandardCharsets.UTF_8);
            StringBuilder u = new StringBuilder("[");
            for (String s : unsupported) u.append(u.length() > 1 ? "," : "").append(Json.str(s));
            String meta = "{\"calls\":" + calls + ",\"kept\":" + kept.size() + ",\"skipped\":" + skipped + ",\"unsupported\":" + u + "],\"mutates\":" + mutates
                + ",\"original_ns\":" + (calls > 0 ? (double) nanos / calls : 0) + "}";
            java.nio.file.Files.writeString(java.nio.file.Path.of(System.getenv("FAST_ANYTHING_RECORD_META")), meta, java.nio.charset.StandardCharsets.UTF_8);
        } catch (java.io.IOException e) {
            e.printStackTrace();
        }
    }

/*JSON*/
}
