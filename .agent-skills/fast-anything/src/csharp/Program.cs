// C# side of fast-anything's scan. The CLI runs it as
//     FastAnythingTools describe <file list> <out.json>   every method in the app's sources (Roslyn)
//     FastAnythingTools trace <dir> <out.json>            sampled stacks from the .nettrace files in dir
// Not meant to be run by hand.
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.Diagnostics.Tracing;
using Microsoft.Diagnostics.Tracing.Etlx;

static class Tools
{
    static int Main(string[] args)
    {
        if (args.Length != 3) { Console.Error.WriteLine("usage: describe|trace <in> <out>"); return 2; }
        object result = args[0] switch
        {
            "describe" => Describe.Run(File.ReadAllLines(args[1]).Where(l => l.Trim().Length > 0).Select(l => l.Trim())),
            "trace" => Trace.Run(args[1]),
            _ => throw new ArgumentException(args[0]),
        };
        File.WriteAllText(args[2], JsonSerializer.Serialize(result), new UTF8Encoding(false));
        return 0;
    }
}

static class Trace
{
    public static object Run(string dir)
    {
        var stacks = new Dictionary<string, (int thread, List<string> frames, int count)>();
        int files = 0;
        foreach (var path in Directory.GetFiles(dir, "*.nettrace"))
        {
            files++;
            var etlx = Path.ChangeExtension(path, ".etlx");
            using var log = new TraceLog(TraceLog.CreateFromEventPipeDataFile(path, etlx));
            foreach (var ev in log.Events)
            {
                if (ev.ProviderName != "Microsoft-DotNETCore-SampleProfiler") continue;
                var frames = new List<string>();
                for (var cs = ev.CallStack(); cs != null; cs = cs.Caller)
                {
                    var m = cs.CodeAddress.Method;
                    if (m != null) frames.Add(m.FullMethodName);
                }
                if (frames.Count == 0) continue;
                int thread = ev.ThreadID + 1_000_000 * files;
                var key = thread + "|" + string.Join("|", frames);
                stacks[key] = stacks.TryGetValue(key, out var s) ? (s.thread, s.frames, s.count + 1) : (thread, frames, 1);
            }
        }
        return stacks.Values.Select(s => new { thread = s.thread, frames = s.frames, count = s.count }).ToList();
    }
}

static class Describe
{
    static readonly HashSet<string> Io = ["Console", "File", "Directory", "Path", "FileInfo", "DirectoryInfo", "FileStream",
        "StreamReader", "StreamWriter", "HttpClient", "WebClient", "Socket", "TcpClient", "Process", "Thread", "Task",
        "Parallel", "ThreadPool", "Environment", "Debug", "Trace", "Logger", "ILogger", "Registry", "Timer"];
    static readonly HashSet<string> NondetCalls = ["Guid.NewGuid", "Random.Shared", "Stopwatch.StartNew", "Stopwatch.GetTimestamp",
        "DateTime.Now", "DateTime.UtcNow", "DateTimeOffset.Now", "DateTimeOffset.UtcNow", "DateTime.Today", "Environment.TickCount",
        "Environment.TickCount64", "RandomNumberGenerator"];
    static readonly HashSet<string> NondetNew = ["Random", "Stopwatch"];
    static readonly HashSet<string> Scalars = ["int", "long", "double", "float", "bool", "short", "byte", "sbyte", "uint",
        "ulong", "ushort", "char", "string", "Int32", "Int64", "Double", "Single", "Boolean", "Int16", "Byte", "SByte",
        "UInt32", "UInt64", "UInt16", "Char", "String"];
    static readonly HashSet<string> Lists = ["List", "IList", "IReadOnlyList", "ICollection", "IReadOnlyCollection", "IEnumerable"];
    static readonly HashSet<string> Maps = ["Dictionary", "IDictionary", "IReadOnlyDictionary", "SortedDictionary"];

    public static object Run(IEnumerable<string> files)
    {
        var methods = new List<object>();
        foreach (var path in files)
        {
            var src = File.ReadAllText(path);
            var tree = CSharpSyntaxTree.ParseText(src, path: path);
            var lines = src.Replace("\r", "").Split('\n');
            foreach (var type in tree.GetRoot().DescendantNodes().OfType<TypeDeclarationSyntax>())
                foreach (var m in type.Members.OfType<MethodDeclarationSyntax>())
                    methods.Add(Method(m, type, tree, lines));
        }
        return methods;
    }

    static string Ns(SyntaxNode n)
    {
        var parts = n.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().Select(x => x.Name.ToString()).Reverse();
        return string.Join(".", parts);
    }

    public static bool Supported(string t)
    {
        t = t.Replace(" ", "").Replace("System.Collections.Generic.", "").Replace("System.", "");
        if (t.EndsWith("?")) t = t[..^1];
        if (Scalars.Contains(t)) return true;
        if (t.EndsWith("[]")) return Supported(t[..^2]);
        int lt = t.IndexOf('<');
        if (lt < 0 || !t.EndsWith(">")) return false;
        string raw = t[..lt], inner = t[(lt + 1)..^1];
        if (Lists.Contains(raw)) return Supported(inner);
        if (Maps.Contains(raw) && (inner.StartsWith("string,") || inner.StartsWith("String,"))) return Supported(inner[(inner.IndexOf(',') + 1)..]);
        return false;
    }

    static object Method(MethodDeclarationSyntax m, TypeDeclarationSyntax type, SyntaxTree tree, string[] lines)
    {
        var chain = m.Ancestors().OfType<TypeDeclarationSyntax>().Reverse().Select(t => t.Identifier.Text).ToList();
        string ns = Ns(type);
        string cls = (ns.Length > 0 ? ns + "." : "") + string.Join("+", chain);
        string name = m.Identifier.Text;
        var mods = m.Modifiers.Select(x => x.Text).ToHashSet();
        var blockers = new List<string>();
        var warnings = new List<string>();
        if (!mods.Contains("static")) blockers.Add("instance method (static methods only for now)");
        if (name == "Main") blockers.Add("the entry point");
        if (m.TypeParameterList != null) blockers.Add("generic method");
        if (m.Ancestors().OfType<TypeDeclarationSyntax>().Any(t => t.TypeParameterList != null)) blockers.Add("in a generic class");
        if (mods.Contains("async")) blockers.Add("async");
        if (mods.Contains("unsafe") || mods.Contains("extern") || mods.Contains("partial")) blockers.Add(string.Join(" ", mods.Intersect(["unsafe", "extern", "partial"])));
        if (m.Body == null) blockers.Add(m.ExpressionBody != null ? "expression-bodied (give it a { } body)" : "has no body");
        string returns = m.ReturnType.ToString();
        if (returns == "void") blockers.Add("returns nothing (void)");
        else if (!Supported(returns)) blockers.Add("returns a " + returns);
        var parms = new List<object>();
        var locals = new HashSet<string>();
        foreach (var p in m.ParameterList.Parameters)
        {
            string t = p.Type?.ToString() ?? "?";
            var pm = p.Modifiers.Select(x => x.Text).ToList();
            if (pm.Contains("ref") || pm.Contains("out") || pm.Contains("in")) blockers.Add($"takes {string.Join(" ", pm)} {t}");
            else if (pm.Contains("params")) blockers.Add("takes params");
            else if (pm.Contains("this")) blockers.Add("extension method");
            else if (!Supported(t)) blockers.Add("takes a " + t);
            locals.Add(p.Identifier.Text);
            parms.Add(new { name = p.Identifier.Text, annotation = t, @default = p.Default?.Value.ToString() });
        }
        var fields = type.Members.OfType<FieldDeclarationSyntax>().SelectMany(f => f.Declaration.Variables.Select(v => v.Identifier.Text))
            .Concat(type.Members.OfType<PropertyDeclarationSyntax>().Select(p => p.Identifier.Text)).ToHashSet();
        var statics = type.Members.OfType<MethodDeclarationSyntax>().Where(x => x.Modifiers.Any(t => t.Text == "static"))
            .Select(x => x.Identifier.Text).ToHashSet();
        var io = new List<string>();
        var nondet = new List<string>();
        var helpers = new List<string>();
        bool writesStatic = false;
        SyntaxNode? body = (SyntaxNode?)m.Body ?? m.ExpressionBody;
        if (body != null)
        {
            foreach (var n in body.DescendantNodes())
            {
                switch (n)
                {
                    case VariableDeclaratorSyntax v: locals.Add(v.Identifier.Text); break;
                    case SingleVariableDesignationSyntax d: locals.Add(d.Identifier.Text); break;
                    case ForEachStatementSyntax f: locals.Add(f.Identifier.Text); break;
                }
            }
            foreach (var n in body.DescendantNodes())
            {
                if (n is MemberAccessExpressionSyntax ma)
                {
                    string s = ma.ToString().Replace("System.", "");
                    string head = ma.Expression.ToString().Replace("System.", "");
                    head = head.Contains('.') ? head[(head.LastIndexOf('.') + 1)..] : head;
                    if (Io.Contains(head) && !locals.Contains(head)) Add(io, s);
                    if (NondetCalls.Contains(s) || NondetCalls.Contains(head)) Add(nondet, s);
                }
                if (n is ObjectCreationExpressionSyntax oc)
                {
                    string t = oc.Type.ToString();
                    t = t.Contains('<') ? t[..t.IndexOf('<')] : t;
                    t = t.Contains('.') ? t[(t.LastIndexOf('.') + 1)..] : t;
                    if (NondetNew.Contains(t)) Add(nondet, "new " + t);
                    if (Io.Contains(t)) Add(io, "new " + t);
                }
                if (n is InvocationExpressionSyntax inv)
                {
                    string callee = inv.Expression switch
                    {
                        IdentifierNameSyntax id => id.Identifier.Text,
                        MemberAccessExpressionSyntax ma2 when ma2.Expression.ToString() == type.Identifier.Text => ma2.Name.Identifier.Text,
                        _ => "",
                    };
                    if (callee.Length > 0 && callee != name && statics.Contains(callee)) Add(helpers, callee);
                }
                ExpressionSyntax? target = n switch
                {
                    AssignmentExpressionSyntax a => a.Left,
                    PrefixUnaryExpressionSyntax u when u.IsKind(SyntaxKind.PreIncrementExpression) || u.IsKind(SyntaxKind.PreDecrementExpression) => u.Operand,
                    PostfixUnaryExpressionSyntax u => u.Operand,
                    _ => null,
                };
                if (target is IdentifierNameSyntax tid && fields.Contains(tid.Identifier.Text) && !locals.Contains(tid.Identifier.Text)) writesStatic = true;
                if (target is MemberAccessExpressionSyntax tma && tma.Expression.ToString() == type.Identifier.Text && fields.Contains(tma.Name.Identifier.Text)) writesStatic = true;
                if (target is ElementAccessExpressionSyntax ea && ea.Expression is IdentifierNameSyntax eid && fields.Contains(eid.Identifier.Text) && !locals.Contains(eid.Identifier.Text)) writesStatic = true;
            }
        }
        if (io.Count > 0) blockers.Add("does I/O: " + string.Join(", ", io.Take(3)));
        if (nondet.Count > 0) blockers.Add("not deterministic: " + string.Join(", ", nondet.Take(3)));
        if (writesStatic) blockers.Add("writes static fields");
        if (helpers.Count > 0) warnings.Add("calls " + string.Join(", ", helpers.Take(3)) + ", they get ported together with it");
        if (m.Body != null)
        {
            var open = m.Body.OpenBraceToken;
            var openLine = tree.GetLineSpan(open.Span).StartLinePosition.Line;
            var firstInside = m.Body.Statements.FirstOrDefault();
            var closeLine = tree.GetLineSpan(m.Body.CloseBraceToken.Span).StartLinePosition.Line;
            if ((firstInside != null && tree.GetLineSpan(firstInside.Span).StartLinePosition.Line == openLine) || closeLine == openLine)
                blockers.Add("its { doesn't end a line (put the body on its own lines)");
        }
        var span = tree.GetLineSpan(m.Span);
        int line = tree.GetLineSpan(m.Identifier.Span).StartLinePosition.Line + 1;
        int start = span.StartLinePosition.Line, end = span.EndLinePosition.Line;
        string source = string.Join("\n", lines[start..Math.Min(end + 1, lines.Length)]).TrimEnd();
        return new
        {
            @class = cls,
            owner = string.Join(".", chain),
            name,
            path = tree.FilePath,
            line,
            end_line = end + 1,
            @params = parms,
            returns,
            blockers,
            warnings,
            calls = helpers,
            source,
        };
    }

    static void Add(List<string> xs, string s) { if (!xs.Contains(s)) xs.Add(s); }
}
