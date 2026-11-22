/*PACKAGE*/
/*IMPORTS*/
// fast-anything: calls the verified Rust port of /*ID*/. Generated; remove with  fast-anything disable /*ID*/
// FAST_ANYTHING_DISABLE=1 runs the Java version instead. Add --enable-native-access=ALL-UNNAMED to silence Java's notice.
final class /*CLASS*/ {
    static /*RET*/ type; // the original's return type, read back with reflection
    static final java.lang.reflect.Type TYPE;
    static final java.lang.invoke.MethodHandle CALL, FREE;
    static final boolean ON;

    static {
        java.lang.reflect.Type t = Object.class;
        java.lang.invoke.MethodHandle c = null, f = null;
        if (System.getenv("FAST_ANYTHING_DISABLE") == null) {
            try {
                t = /*CLASS*/.class.getDeclaredField("type").getGenericType();
                var linker = java.lang.foreign.Linker.nativeLinker();
                var lib = java.lang.foreign.SymbolLookup.libraryLookup(java.nio.file.Path.of(/*LIB*/), java.lang.foreign.Arena.global());
                c = linker.downcallHandle(lib.find("fa_call").orElseThrow(), java.lang.foreign.FunctionDescriptor.of(
                    java.lang.foreign.ValueLayout.ADDRESS, java.lang.foreign.ValueLayout.ADDRESS, java.lang.foreign.ValueLayout.JAVA_LONG, java.lang.foreign.ValueLayout.ADDRESS));
                f = linker.downcallHandle(lib.find("fa_free").orElseThrow(), java.lang.foreign.FunctionDescriptor.ofVoid(
                    java.lang.foreign.ValueLayout.ADDRESS, java.lang.foreign.ValueLayout.JAVA_LONG));
            } catch (Throwable e) {
                c = null;
            }
        }
        TYPE = t;
        CALL = c;
        FREE = f;
        ON = c != null;
    }

    static Object call(Object[] args) {
        byte[] in = Json.enc(args).getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try (var arena = java.lang.foreign.Arena.ofConfined()) {
            var input = arena.allocate(Math.max(1, in.length));
            java.lang.foreign.MemorySegment.copy(in, 0, input, java.lang.foreign.ValueLayout.JAVA_BYTE, 0, in.length);
            var len = arena.allocate(java.lang.foreign.ValueLayout.JAVA_LONG);
            var out = (java.lang.foreign.MemorySegment) CALL.invokeExact(input, (long) in.length, len);
            long n = len.get(java.lang.foreign.ValueLayout.JAVA_LONG, 0);
            byte[] bytes = out.reinterpret(n).toArray(java.lang.foreign.ValueLayout.JAVA_BYTE);
            FREE.invokeExact(out, n);
            var reply = (java.util.Map<?, ?>) Json.parse(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
            if (reply.containsKey("error")) throw new RuntimeException("fast-anything: " + reply.get("error"));
            return Json.convert(reply.get("ok"), TYPE);
        } catch (RuntimeException | Error e) {
            throw e;
        } catch (Throwable e) {
            throw new RuntimeException(e);
        }
    }

/*JSON*/
}
