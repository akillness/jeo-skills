// fast-anything: records calls to /*ID*/ for one run. Generated; removed when the run ends.
#nullable enable
#pragma warning disable
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

static class FastAnythingRec
{
    public static bool Inside;
    static readonly object Gate = new();
    static readonly int Limit = int.TryParse(Environment.GetEnvironmentVariable("FAST_ANYTHING_RECORD_LIMIT"), out var n) ? n : 500;
    static readonly Random Rng = new(0xFA57);
    static readonly List<string> Kept = new();
    static readonly List<string?> KeptArgs = new();
    static readonly List<string> Unsupported = new();
    static long Calls, Skipped, Ticks;
    static bool Mutates;
    static Func<object?[], object?>? Fn;
    static Type[] Types = Array.Empty<Type>();
    static readonly string[] Texts = { "", "ÀÉÎõü ñ", "日本語のテキスト", "emoji 👍🏽🎉", "é́", "İ ß ǅ ΣΑΣ" };
    static readonly int[] Slices = { 0, 1, 2, 3, 5, 8, 13, 21, 34, 55 };

    static FastAnythingRec()
    {
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Save();
    }

    static void Note(string what)
    {
        if (!Unsupported.Contains(what)) Unsupported.Add(what);
    }

    public static object? Record(object?[] args, Type[] types, Func<object?[], object?> f)
    {
        lock (Gate)
        {
            Fn = f;
            Types = types;
            Inside = true;
            try
            {
                Calls++;
                int slot = Kept.Count < Limit ? Kept.Count : (int)(Rng.NextDouble() * Calls);
                string? a = null;
                if (slot < Limit)
                {
                    try { a = Json.Enc(args); }
                    catch (Json.Unsupported e) { Skipped++; Note(e.Message); }
                }
                long t = Stopwatch.GetTimestamp();
                object? r;
                try
                {
                    r = f(args);
                }
                catch (Exception e)
                {
                    Ticks += Stopwatch.GetTimestamp() - t;
                    if (a != null) Store(slot, "{\"args\":" + a + ",\"raises\":" + Json.Str(e.GetType().FullName ?? "Exception") + "}", null);
                    throw;
                }
                Ticks += Stopwatch.GetTimestamp() - t;
                if (a != null && Json.Enc(args) != a) Mutates = true;
                if (a != null)
                {
                    try { Store(slot, "{\"args\":" + a + ",\"result\":" + Json.Enc(r) + "}", a); }
                    catch (Json.Unsupported e) { Skipped++; Note(e.Message); }
                }
                return r;
            }
            finally
            {
                Inside = false;
            }
        }
    }

    static void Store(int slot, string line, string? args)
    {
        if (slot < Kept.Count)
        {
            Kept[slot] = line;
            KeptArgs[slot] = args;
        }
        else
        {
            Kept.Add(line);
            KeptArgs.Add(args);
        }
    }

    static Type Element(Type t)
    {
        t = Nullable.GetUnderlyingType(t) ?? t;
        if (t.IsArray) return t.GetElementType()!;
        return t.IsGenericType ? t.GetGenericArguments()[^1] : typeof(object);
    }

    // Special values for one argument: zero and ±1, -0.0, non-ASCII text, empty collections.
    static IEnumerable<JsonNode?> Edges(JsonNode? v, Type t)
    {
        var u = Nullable.GetUnderlyingType(t) ?? t;
        if (u == typeof(string)) foreach (var s in Texts) yield return JsonValue.Create(s);
        else if (u == typeof(char)) foreach (var s in new[] { "a", "é", "日", " " }) yield return JsonValue.Create(s);
        else if (u == typeof(bool)) { yield return JsonValue.Create(true); yield return JsonValue.Create(false); }
        else if (u == typeof(double) || u == typeof(float)) foreach (var d in new[] { 0.0, -0.0, 1.0, -1.0, 0.5 }) yield return JsonValue.Create(d);
        else if (u.IsPrimitive) foreach (var i in new[] { 0, 1, -1 }) yield return JsonValue.Create(i);
        else if (v is JsonArray arr)
        {
            yield return new JsonArray();
            var inner = Element(t);
            if (inner == typeof(string)) yield return new JsonArray(Texts.Select(s => (JsonNode?)JsonValue.Create(s)).ToArray());
            if (arr.Count > 0) foreach (var e in Edges(arr[0], inner)) yield return new JsonArray(e?.DeepClone());
        }
        else if (v is JsonObject) yield return new JsonObject();
        if (Nullable.GetUnderlyingType(t) != null) yield return null;
    }

    // The same input, much bigger: 4x, 16x, ... up to 4096 items or characters.
    static JsonNode? Bigger(JsonNode? v, int factor)
    {
        if (v is JsonArray a && a.Count > 0)
        {
            int n = Math.Min(4096, a.Count * factor);
            if (n <= a.Count) return null;
            var big = new JsonArray();
            for (int i = 0; i < n; i++) big.Add(a[i % a.Count]?.DeepClone());
            return big;
        }
        if (v is JsonValue s && s.TryGetValue<string>(out var text) && text.Length > 0)
        {
            int n = Math.Min(4096, text.Length * factor);
            if (n <= text.Length) return null;
            var b = new StringBuilder();
            while (b.Length < n) b.Append(text);
            return JsonValue.Create(b.ToString());
        }
        return null;
    }

    // A short version of a recorded value, so edge cases stay cheap when the real inputs are big.
    static JsonNode? Small(JsonNode? v)
    {
        if (v is JsonArray a) return new JsonArray(a.Take(8).Select(Small).ToArray());
        if (v is JsonValue s && s.TryGetValue<string>(out var text))
        {
            var runes = text.EnumerateRunes().Take(32).Select(r => r.ToString());
            return JsonValue.Create(string.Concat(runes));
        }
        return v?.DeepClone();
    }

    // Shorter slices of a string or collection, for the shrunk "derived" cases.
    static IEnumerable<JsonNode?> Variants(JsonNode? v)
    {
        if (v is JsonValue s && s.TryGetValue<string>(out var text))
        {
            var runes = new List<string>();
            foreach (var r in text.EnumerateRunes()) runes.Add(r.ToString());
            int n = runes.Count;
            if (n < 2) yield break;
            foreach (int len in Slices)
            {
                if (len >= n) yield break;
                for (int rep = 0; rep < (len < 2 ? 1 : 3); rep++)
                {
                    int off = Rng.Next(n - len + 1);
                    yield return JsonValue.Create(string.Concat(runes.GetRange(off, len)));
                }
            }
        }
        else if (v is JsonArray a && a.Count >= 2)
        {
            foreach (int len in Slices)
            {
                if (len >= a.Count) yield break;
                for (int rep = 0; rep < (len < 2 ? 1 : 3); rep++)
                {
                    int off = Rng.Next(a.Count - len + 1);
                    var part = new JsonArray();
                    for (int i = off; i < off + len; i++) part.Add(a[i]?.DeepClone());
                    yield return part;
                }
            }
        }
    }

    // Runs the original on args with argument i replaced; keeps the case. Seconds it took, or -1.
    static double Try(JsonArray args, int i, JsonNode? value, string tag, List<string> derived, HashSet<string> seen)
    {
        var next = (JsonArray)args.DeepClone();
        next[i] = value?.DeepClone();
        if (!seen.Add(next.ToJsonString())) return -1;
        try
        {
            var objs = new object?[next.Count];
            for (int k = 0; k < next.Count; k++) objs[k] = Json.Dec(next[k], Types[k]);
            string a = Json.Enc(objs);
            long t = Stopwatch.GetTimestamp();
            var r = Fn!(objs);
            double took = (Stopwatch.GetTimestamp() - t) / (double)Stopwatch.Frequency;
            derived.Add("{\"args\":" + a + ",\"result\":" + Json.Enc(r) + ",\"derived\":" + tag + "}");
            return took;
        }
        catch (Exception)
        {
            return -1; // outside the function's domain: not a fair test
        }
    }

    static void Save()
    {
        lock (Gate)
        {
            Inside = true;
            var derived = new List<string>();
            var seen = new HashSet<string>();
            var clock = Stopwatch.StartNew();
            var cases = new List<JsonArray>();
            foreach (var a in KeptArgs) if (a != null && JsonNode.Parse(a) is JsonArray arr) cases.Add(arr);
            if (Fn != null)
            {
                double Left() => 1.5 - clock.Elapsed.TotalSeconds;
                var grown = new HashSet<int>();
                foreach (var recorded in cases.Take(20))
                {
                    var args = new JsonArray(recorded.Select(Small).ToArray());
                    for (int i = 0; i < args.Count && i < Types.Length; i++)
                    {
                        foreach (var e in Edges(args[i], Types[i]))
                        {
                            if (derived.Count >= 100 || Left() <= 0) goto shrink;
                            Try(args, i, e, "\"edge\"", derived, seen);
                        }
                        if (!grown.Add(i)) continue;
                        double took = 0;
                        foreach (int factor in new[] { 4, 16, 64, 256, 1024 })
                        {
                            var big = Bigger(args[i], factor);
                            if (big == null || derived.Count >= 100 || took * 16 > Left() / 2) break;
                            took = Try(args, i, big, "\"edge\"", derived, seen);
                            if (took < 0) break;
                        }
                    }
                }
            shrink:
                int edges = derived.Count;
                foreach (var args in cases)
                {
                    for (int i = 0; i < args.Count && i < Types.Length; i++)
                    {
                        foreach (var smaller in Variants(args[i]))
                        {
                            if (derived.Count >= 200 + edges || clock.Elapsed.TotalSeconds > 3) goto write;
                            Try(args, i, smaller, "true", derived, seen);
                        }
                    }
                }
            }
        write:
            var b = new StringBuilder();
            foreach (var line in Kept) b.Append(line).Append('\n');
            foreach (var line in derived) b.Append(line).Append('\n');
            System.IO.File.WriteAllText(Environment.GetEnvironmentVariable("FAST_ANYTHING_RECORD_OUT")!, b.ToString(), new UTF8Encoding(false));
            var u = new StringBuilder("[");
            foreach (var s in Unsupported) u.Append(u.Length > 1 ? "," : "").Append(Json.Str(s));
            double ns = Calls > 0 ? Ticks * 1e9 / Stopwatch.Frequency / Calls : 0;
            string meta = "{\"calls\":" + Calls + ",\"kept\":" + Kept.Count + ",\"skipped\":" + Skipped + ",\"unsupported\":" + u + "]"
                + ",\"mutates\":" + (Mutates ? "true" : "false") + ",\"original_ns\":" + ns.ToString("R", CultureInfo.InvariantCulture) + "}";
            System.IO.File.WriteAllText(Environment.GetEnvironmentVariable("FAST_ANYTHING_RECORD_META")!, meta, new UTF8Encoding(false));
        }
    }

/*JSON*/
}
