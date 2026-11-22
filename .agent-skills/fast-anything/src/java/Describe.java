// Java side of fast-anything's scan: reads the app's sources with javac's own parser and describes
// every method. The CLI runs it as  java Describe.java <file list> <out.json>. Not meant to be run by hand.
import com.sun.source.tree.*;
import com.sun.source.util.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.lang.model.element.Modifier;
import javax.tools.*;

public class Describe {
    static final Set<String> IO = Set.of("System.out", "System.err", "System.in", "System.exit", "System.getenv", "Files",
        "Paths", "Path", "File", "FileReader", "FileWriter", "BufferedReader", "BufferedWriter", "Scanner", "Socket",
        "HttpClient", "URL", "Thread", "ProcessBuilder", "Runtime", "PrintStream", "PrintWriter", "FileInputStream",
        "FileOutputStream", "Console", "Logger", "ExecutorService", "Executors", "CompletableFuture");
    static final Set<String> NONDET = Set.of("Math.random", "System.nanoTime", "System.currentTimeMillis",
        "ThreadLocalRandom.current", "Instant.now", "LocalDateTime.now", "LocalDate.now", "LocalTime.now", "UUID.randomUUID",
        "Clock.systemUTC", "ZonedDateTime.now");
    static final Set<String> NONDET_NEW = Set.of("Random", "SecureRandom", "SplittableRandom", "Date");
    static final Set<String> SCALARS = Set.of("int", "long", "double", "float", "boolean", "short", "byte", "Integer",
        "Long", "Double", "Float", "Boolean", "Short", "Byte", "String");
    static final Set<String> LISTS = Set.of("List", "ArrayList", "Collection", "LinkedList");
    static final Set<String> MAPS = Set.of("Map", "HashMap", "LinkedHashMap", "TreeMap");

    static StringBuilder out = new StringBuilder("[");
    static boolean first = true;

    public static void main(String[] args) throws Exception {
        List<Path> files = new ArrayList<>();
        for (String line : Files.readAllLines(Path.of(args[0]), StandardCharsets.UTF_8)) if (!line.isBlank()) files.add(Path.of(line.trim()));
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        StandardJavaFileManager fm = compiler.getStandardFileManager(null, null, StandardCharsets.UTF_8);
        JavacTask task = (JavacTask) compiler.getTask(null, fm, d -> {}, List.of("-proc:none"), null, fm.getJavaFileObjectsFromPaths(files));
        SourcePositions pos = Trees.instance(task).getSourcePositions();
        for (CompilationUnitTree unit : task.parse()) {
            String src = unit.getSourceFile().getCharContent(true).toString();
            String pkg = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
            String path = Path.of(unit.getSourceFile().toUri()).toString();
            new Unit(unit, src, pos, path).classes(unit.getTypeDecls(), pkg.isEmpty() ? "" : pkg + ".", "");
        }
        Files.writeString(Path.of(args[1]), out.append("]").toString(), StandardCharsets.UTF_8);
    }

    record Unit(CompilationUnitTree unit, String src, SourcePositions pos, String path) {
        int line(long p) { return (int) unit.getLineMap().getLineNumber(p); }
        long start(Tree t) { return pos.getStartPosition(unit, t); }
        long end(Tree t) { return pos.getEndPosition(unit, t); }
        String text(Tree t) { return t == null ? null : src.substring((int) start(t), (int) end(t)); }

        void classes(List<? extends Tree> decls, String binary, String source) {
            for (Tree t : decls) {
                if (!(t instanceof ClassTree ct) || ct.getSimpleName().isEmpty()) continue;
                String bin = binary + ct.getSimpleName(), own = source + ct.getSimpleName();
                Set<String> fields = new HashSet<>(), statics = new HashSet<>();
                for (Tree m : ct.getMembers()) {
                    if (m instanceof VariableTree v) fields.add(v.getName().toString());
                    if (m instanceof MethodTree mt && mt.getModifiers().getFlags().contains(Modifier.STATIC)) statics.add(mt.getName().toString());
                }
                for (Tree m : ct.getMembers()) {
                    if (m instanceof MethodTree mt && mt.getBody() != null && mt.getReturnType() != null) method(mt, bin, own, ct.getSimpleName().toString(), fields, statics);
                    else if (m instanceof ClassTree) classes(List.of(m), bin + "$", own + ".");
                }
            }
        }

        void method(MethodTree mt, String bin, String owner, String simple, Set<String> fields, Set<String> statics) {
            String name = mt.getName().toString();
            List<String> blockers = new ArrayList<>(), warnings = new ArrayList<>();
            var flags = mt.getModifiers().getFlags();
            if (!flags.contains(Modifier.STATIC)) blockers.add("instance method (static methods only for now)");
            if (name.equals("main")) blockers.add("the entry point");
            if (!mt.getTypeParameters().isEmpty()) blockers.add("generic method");
            if (!mt.getThrows().isEmpty()) blockers.add("declares checked exceptions");
            if (flags.contains(Modifier.SYNCHRONIZED)) blockers.add("synchronized");
            String returns = text(mt.getReturnType());
            if (returns.equals("void")) blockers.add("returns nothing (void)");
            else if (!supported(returns)) blockers.add("returns a " + returns);
            StringBuilder params = new StringBuilder("[");
            Set<String> locals = new HashSet<>();
            for (VariableTree p : mt.getParameters()) {
                String type = text(p.getType());
                if (type.contains("...")) blockers.add("takes varargs");
                else if (!supported(type)) blockers.add("takes a " + type);
                locals.add(p.getName().toString());
                if (params.length() > 1) params.append(',');
                params.append("{\"name\":").append(q(p.getName().toString())).append(",\"annotation\":").append(q(type)).append('}');
            }
            params.append(']');
            Set<String> io = new LinkedHashSet<>(), nondet = new LinkedHashSet<>(), helpers = new LinkedHashSet<>();
            boolean[] writesStatic = {false};
            new TreeScanner<Void, Void>() {
                @Override public Void visitVariable(VariableTree v, Void x) { locals.add(v.getName().toString()); return super.visitVariable(v, x); }
                @Override public Void visitMethodInvocation(MethodInvocationTree m, Void x) {
                    String sel = m.getMethodSelect().toString();
                    String head = sel.contains(".") ? sel.substring(0, sel.indexOf('.')) : "";
                    String two = sel.lastIndexOf('.') > 0 ? sel.substring(0, sel.lastIndexOf('.')) : "";
                    if (IO.contains(two) || IO.contains(head) || IO.contains(sel)) io.add(sel);
                    if (NONDET.contains(sel)) nondet.add(sel);
                    String bare = sel.startsWith(simple + ".") ? sel.substring(simple.length() + 1) : sel;
                    if (!bare.contains(".") && statics.contains(bare) && !bare.equals(name)) helpers.add(bare);
                    return super.visitMethodInvocation(m, x);
                }
                @Override public Void visitMemberSelect(MemberSelectTree m, Void x) {
                    String s = m.toString();
                    if (s.equals("System.in") || s.equals("System.out") || s.equals("System.err")) io.add(s);
                    return super.visitMemberSelect(m, x);
                }
                @Override public Void visitNewClass(NewClassTree n, Void x) {
                    String t = n.getIdentifier().toString().replaceAll("<.*", "");
                    if (IO.contains(t)) io.add("new " + t);
                    if (NONDET_NEW.contains(t)) nondet.add("new " + t);
                    return super.visitNewClass(n, x);
                }
                void wrote(ExpressionTree target) {
                    if (target instanceof IdentifierTree id && fields.contains(id.getName().toString()) && !locals.contains(id.getName().toString())) writesStatic[0] = true;
                    if (target instanceof MemberSelectTree ms && ms.getExpression().toString().equals(simple) && fields.contains(ms.getIdentifier().toString())) writesStatic[0] = true;
                }
                @Override public Void visitAssignment(AssignmentTree a, Void x) { wrote(a.getVariable()); return super.visitAssignment(a, x); }
                @Override public Void visitCompoundAssignment(CompoundAssignmentTree a, Void x) { wrote(a.getVariable()); return super.visitCompoundAssignment(a, x); }
                @Override public Void visitUnary(UnaryTree u, Void x) { wrote(u.getExpression()); return super.visitUnary(u, x); }
                @Override public Void visitLambdaExpression(LambdaExpressionTree l, Void x) { return super.visitLambdaExpression(l, x); }
            }.scan(mt.getBody(), null);
            if (!io.isEmpty()) blockers.add("does I/O: " + String.join(", ", io.stream().limit(3).toList()));
            if (!nondet.isEmpty()) blockers.add("not deterministic: " + String.join(", ", nondet.stream().limit(3).toList()));
            if (writesStatic[0]) blockers.add("writes static fields");
            if (!helpers.isEmpty()) warnings.add("calls " + String.join(", ", helpers.stream().limit(3).toList()) + ", they get ported together with it");
            long brace = start(mt.getBody());
            int lineEnd = src.indexOf('\n', (int) brace);
            String after = src.substring((int) brace + 1, lineEnd < 0 ? src.length() : lineEnd).trim();
            if (!after.isEmpty() && !after.startsWith("//")) blockers.add("its { doesn't end a line (put the body on its own lines)");
            int line = line(start(mt)), endLine = line(end(mt));
            String[] lines = src.split("\n", -1);
            String source = String.join("\n", Arrays.asList(lines).subList(line - 1, Math.min(endLine, lines.length))).stripTrailing().replace("\r", "");
            if (!first) out.append(',');
            first = false;
            out.append("{\"class\":").append(q(bin)).append(",\"owner\":").append(q(owner)).append(",\"name\":").append(q(name))
                .append(",\"path\":").append(q(path)).append(",\"line\":").append(line).append(",\"end_line\":").append(endLine)
                .append(",\"params\":").append(params).append(",\"returns\":").append(q(returns))
                .append(",\"blockers\":").append(list(blockers)).append(",\"warnings\":").append(list(warnings))
                .append(",\"calls\":").append(list(new ArrayList<>(helpers))).append(",\"source\":").append(q(source)).append('}');
        }
    }

    static boolean supported(String t) {
        t = t.replace(" ", "").replace("java.util.", "").replace("java.lang.", "");
        if (SCALARS.contains(t)) return true;
        if (t.endsWith("[]")) return supported(t.substring(0, t.length() - 2));
        int lt = t.indexOf('<');
        if (lt < 0 || !t.endsWith(">")) return false;
        String raw = t.substring(0, lt), inner = t.substring(lt + 1, t.length() - 1);
        if (LISTS.contains(raw)) return supported(inner);
        if (MAPS.contains(raw) && inner.startsWith("String,")) return supported(inner.substring(7));
        return false;
    }

    static String list(List<String> xs) {
        StringBuilder b = new StringBuilder("[");
        for (String x : xs) b.append(b.length() > 1 ? "," : "").append(q(x));
        return b.append(']').toString();
    }

    static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> { if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); }
            }
        }
        return b.append('"').toString();
    }
}
