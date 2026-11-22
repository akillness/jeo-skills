// AgentKit v0.1 (Unity Expert Skills, 2026-09-24). Minimal JSON reader and writer for the job
// protocol, so AgentKit needs no package (JsonUtility cannot read or write dictionaries).
// Parse -> Dictionary<string, object>, List<object>, string, double, long, bool or null.
// Serialize accepts those plus Unity structs (Vector2/3/4, Quaternion, Color, Rect, Bounds),
// enums (by name), IDictionary, IEnumerable, and any other object by its public fields.
// Run in Unity 6000.3.21f1 on 2026-09-24 through every AgentKit job (tests/code/unity-expert).
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Text;
using UnityEngine;

namespace AgentKit
{
    public static class AgentJson
    {
        // ------------------------------------------------------------------ parse
        public static object Parse(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            int i = 0;
            object v = ParseValue(json, ref i);
            SkipWs(json, ref i);
            if (i < json.Length) throw new FormatException("AgentJson: trailing characters at " + i);
            return v;
        }

        public static Dictionary<string, object> ParseObject(string json)
        {
            return Parse(json) as Dictionary<string, object> ?? new Dictionary<string, object>();
        }

        static void SkipWs(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        static object ParseValue(string s, ref int i)
        {
            SkipWs(s, ref i);
            if (i >= s.Length) throw new FormatException("AgentJson: unexpected end");
            char c = s[i];
            if (c == '{') return ParseObj(s, ref i);
            if (c == '[') return ParseArr(s, ref i);
            if (c == '"') return ParseStr(s, ref i);
            if (c == 't' && string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (c == 'f' && string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (c == 'n' && string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            return ParseNum(s, ref i);
        }

        static Dictionary<string, object> ParseObj(string s, ref int i)
        {
            var d = new Dictionary<string, object>();
            i++;
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return d; }
            while (true)
            {
                SkipWs(s, ref i);
                string k = ParseStr(s, ref i);
                SkipWs(s, ref i);
                if (i >= s.Length || s[i] != ':') throw new FormatException("AgentJson: ':' expected at " + i);
                i++;
                d[k] = ParseValue(s, ref i);
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == '}') { i++; return d; }
                throw new FormatException("AgentJson: ',' or '}' expected at " + i);
            }
        }

        static List<object> ParseArr(string s, ref int i)
        {
            var l = new List<object>();
            i++;
            SkipWs(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return l; }
            while (true)
            {
                l.Add(ParseValue(s, ref i));
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == ']') { i++; return l; }
                throw new FormatException("AgentJson: ',' or ']' expected at " + i);
            }
        }

        static string ParseStr(string s, ref int i)
        {
            if (s[i] != '"') throw new FormatException("AgentJson: string expected at " + i);
            i++;
            var sb = new StringBuilder();
            while (i < s.Length)
            {
                char c = s[i++];
                if (c == '"') return sb.ToString();
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[i++];
                switch (e)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber));
                        i += 4;
                        break;
                    default: sb.Append(e); break;
                }
            }
            throw new FormatException("AgentJson: unterminated string");
        }

        static object ParseNum(string s, ref int i)
        {
            int start = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            string n = s.Substring(start, i - start);
            if (n.Length == 0) throw new FormatException("AgentJson: bad value at " + start);
            if (n.IndexOfAny(new[] { '.', 'e', 'E' }) < 0 &&
                long.TryParse(n, NumberStyles.Integer, CultureInfo.InvariantCulture, out long l))
                return l;
            return double.Parse(n, NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        // ------------------------------------------------------------------ serialize
        public static string Serialize(object o, bool pretty = false)
        {
            var sb = new StringBuilder();
            Write(sb, o, pretty, 0, 0);
            return sb.ToString();
        }

        static void Indent(StringBuilder sb, bool pretty, int level)
        {
            if (!pretty) return;
            sb.Append('\n');
            sb.Append(' ', level * 2);
        }

        static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        static void WriteNumber(StringBuilder sb, double d)
        {
            if (double.IsNaN(d) || double.IsInfinity(d)) { sb.Append("null"); return; }
            sb.Append(d.ToString("R", CultureInfo.InvariantCulture));
        }

        static void Write(StringBuilder sb, object o, bool pretty, int level, int depth)
        {
            if (depth > 32) { WriteString(sb, "<max depth>"); return; }
            switch (o)
            {
                case null: sb.Append("null"); return;
                case string s: WriteString(sb, s); return;
                case bool b: sb.Append(b ? "true" : "false"); return;
                case char ch: WriteString(sb, ch.ToString()); return;
                case float f: WriteNumber(sb, f); return;
                case double d: WriteNumber(sb, d); return;
                case decimal m: sb.Append(m.ToString(CultureInfo.InvariantCulture)); return;
                case int _: case long _: case short _: case byte _: case uint _: case ulong _: case ushort _: case sbyte _:
                    sb.Append(Convert.ToString(o, CultureInfo.InvariantCulture)); return;
                case Enum e: WriteString(sb, e.ToString()); return;
                case Vector2 v2: Write(sb, new[] { v2.x, v2.y }, false, level, depth + 1); return;
                case Vector3 v3: Write(sb, new[] { v3.x, v3.y, v3.z }, false, level, depth + 1); return;
                case Vector4 v4: Write(sb, new[] { v4.x, v4.y, v4.z, v4.w }, false, level, depth + 1); return;
                case Vector2Int i2: Write(sb, new[] { i2.x, i2.y }, false, level, depth + 1); return;
                case Vector3Int i3: Write(sb, new[] { i3.x, i3.y, i3.z }, false, level, depth + 1); return;
                case Quaternion q: Write(sb, new[] { q.eulerAngles.x, q.eulerAngles.y, q.eulerAngles.z }, false, level, depth + 1); return;
                case Color c: Write(sb, new[] { c.r, c.g, c.b, c.a }, false, level, depth + 1); return;
                case Color32 c32: Write(sb, new[] { (int)c32.r, c32.g, c32.b, c32.a }, false, level, depth + 1); return;
                case Rect r: Write(sb, new[] { r.x, r.y, r.width, r.height }, false, level, depth + 1); return;
                case Bounds bo:
                    Write(sb, new Dictionary<string, object> { { "center", bo.center }, { "size", bo.size } }, pretty, level, depth + 1);
                    return;
                case UnityEngine.Object uo:
                    WriteString(sb, uo ? uo.name + " (" + uo.GetType().Name + ")" : "null");
                    return;
                case IDictionary dict:
                {
                    sb.Append('{');
                    bool first = true;
                    foreach (DictionaryEntry kv in dict)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        Indent(sb, pretty, level + 1);
                        WriteString(sb, Convert.ToString(kv.Key, CultureInfo.InvariantCulture));
                        sb.Append(pretty ? ": " : ":");
                        Write(sb, kv.Value, pretty, level + 1, depth + 1);
                    }
                    if (!first) Indent(sb, pretty, level);
                    sb.Append('}');
                    return;
                }
                case IEnumerable seq:
                {
                    sb.Append('[');
                    bool first = true;
                    foreach (var item in seq)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        Write(sb, item, false, level + 1, depth + 1);
                    }
                    sb.Append(']');
                    return;
                }
            }
            // Any other object: its public instance fields (and readable properties when no fields).
            var t = o.GetType();
            var fields = t.GetFields(BindingFlags.Public | BindingFlags.Instance);
            var d2 = new Dictionary<string, object>();
            foreach (var fi in fields) d2[fi.Name] = fi.GetValue(o);
            if (fields.Length == 0)
            {
                foreach (var pi in t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
                {
                    if (!pi.CanRead || pi.GetIndexParameters().Length > 0) continue;
                    try { d2[pi.Name] = pi.GetValue(o); } catch { }
                }
            }
            if (d2.Count == 0) { WriteString(sb, o.ToString()); return; }
            Write(sb, d2, pretty, level, depth + 1);
        }

        // ------------------------------------------------------------------ typed access helpers
        public static double ToDouble(object v, double def = 0)
        {
            if (v == null) return def;
            if (v is double d) return d;
            if (v is long l) return l;
            if (v is int i) return i;
            if (v is float f) return f;
            if (v is bool b) return b ? 1 : 0;
            double.TryParse(Convert.ToString(v, CultureInfo.InvariantCulture), NumberStyles.Float,
                CultureInfo.InvariantCulture, out double r);
            return r;
        }

        public static Vector3 ToVector3(object v, Vector3 def)
        {
            if (v is IList l && l.Count >= 3)
                return new Vector3((float)ToDouble(l[0]), (float)ToDouble(l[1]), (float)ToDouble(l[2]));
            return def;
        }

        public static Color ToColor(object v, Color def)
        {
            if (v is IList l && l.Count >= 3)
                return new Color((float)ToDouble(l[0]), (float)ToDouble(l[1]), (float)ToDouble(l[2]),
                    l.Count > 3 ? (float)ToDouble(l[3]) : 1f);
            return def;
        }
    }
}
