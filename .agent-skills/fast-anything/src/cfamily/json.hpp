// ---- JSON for fast-anything's C++ recorder and bridge (C++14). Generated; don't edit.
inline bool fa_utf8(const std::string &s) {
    size_t i = 0;
    while (i < s.size()) {
        unsigned char c = (unsigned char) s[i];
        int n = c < 0x80 ? 0 : (c >> 5) == 6 ? 1 : (c >> 4) == 14 ? 2 : (c >> 3) == 30 ? 3 : -1;
        if (n < 0 || i + n >= s.size() + (n == 0)) return n == 0;
        for (int k = 1; k <= n; k++)
            if (((unsigned char) s[i + k] & 0xC0) != 0x80) return false;
        i += n + 1;
    }
    return true;
}
inline bool enc_str(std::string &o, const std::string &s) {
    if (!fa_utf8(s)) return false;
    o += '"';
    for (unsigned char c : s) {
        if (c == '"' || c == '\\') { o += '\\'; o += (char) c; }
        else if (c < 0x20) { char t[8]; std::snprintf(t, sizeof t, "\\u%04x", c); o += t; }
        else o += (char) c;
    }
    o += '"';
    return true;
}
inline bool enc(std::string &o, bool v) { o += v ? "true" : "false"; return true; }
template <class T> typename std::enable_if<std::is_integral<T>::value, bool>::type enc(std::string &o, T v) { o += std::to_string(v); return true; }
template <class T> typename std::enable_if<std::is_floating_point<T>::value, bool>::type enc(std::string &o, T v) {
    if (!std::isfinite((double) v)) return false;
    char t[40];
    std::snprintf(t, sizeof t, "%.17g", (double) v);
    if (!std::strpbrk(t, ".eE")) std::strcat(t, ".0");
    o += t;
    return true;
}
inline bool enc(std::string &o, const std::string &v) { return enc_str(o, v); }
inline bool enc(std::string &o, const char *v) { if (!v) { o += "null"; return true; } return enc_str(o, v); }
template <class A, class B> bool enc(std::string &o, const std::pair<A, B> &v);
template <class T, class Al> bool enc(std::string &o, const std::vector<T, Al> &v);
template <class T, size_t N> bool enc(std::string &o, const std::array<T, N> &v);
template <class T, class C, class Al> bool enc(std::string &o, const std::map<std::string, T, C, Al> &v);
template <class T, class H, class E, class Al> bool enc(std::string &o, const std::unordered_map<std::string, T, H, E, Al> &v);
template <class It> bool enc_seq(std::string &o, It a, It b) {
    o += '[';
    for (It i = a; i != b; ++i) {
        if (i != a) o += ',';
        if (!enc(o, *i)) return false;
    }
    o += ']';
    return true;
}
template <class T, class Al> bool enc(std::string &o, const std::vector<T, Al> &v) { return enc_seq(o, v.begin(), v.end()); }
template <class T, size_t N> bool enc(std::string &o, const std::array<T, N> &v) { return enc_seq(o, v.begin(), v.end()); }
template <class A, class B> bool enc(std::string &o, const std::pair<A, B> &v) {
    o += '[';
    if (!enc(o, v.first)) return false;
    o += ',';
    if (!enc(o, v.second)) return false;
    o += ']';
    return true;
}
template <class M> bool enc_map(std::string &o, const M &m) {
    std::vector<const std::string *> keys;
    for (auto &kv : m) keys.push_back(&kv.first);
    std::sort(keys.begin(), keys.end(), [](const std::string *a, const std::string *b) { return *a < *b; });
    o += '{';
    for (size_t i = 0; i < keys.size(); i++) {
        if (i) o += ',';
        if (!enc_str(o, *keys[i])) return false;
        o += ':';
        if (!enc(o, m.at(*keys[i]))) return false;
    }
    o += '}';
    return true;
}
template <class T, class C, class Al> bool enc(std::string &o, const std::map<std::string, T, C, Al> &v) { return enc_map(o, v); }
template <class T, class H, class E, class Al> bool enc(std::string &o, const std::unordered_map<std::string, T, H, E, Al> &v) { return enc_map(o, v); }
inline bool enc_all(std::string &) { return true; }
template <class A, class... R> bool enc_all(std::string &o, const A &a, const R &...r) {
    if (o.size() > 1) o += ',';
    return enc(o, a) && enc_all(o, r...);
}

// a small DOM, for the bridge's replies
struct V {
    int kind = 0; // 0 null, 1 bool, 2 number, 3 string, 4 array, 5 object
    bool b = false;
    double num = 0;
    long long i = 0;
    bool is_int = false;
    std::string s;
    std::vector<V> arr;
    std::vector<std::pair<std::string, V>> obj;
    const V *get(const char *k) const {
        for (auto &kv : obj)
            if (kv.first == k) return &kv.second;
        return nullptr;
    }
};
inline void ws(const char *&p) { while (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t') p++; }
inline V parse(const char *&p) {
    V v;
    ws(p);
    if (*p == '{') {
        v.kind = 5;
        p++;
        ws(p);
        if (*p == '}') { p++; return v; }
        while (true) {
            ws(p);
            V k = parse(p);
            ws(p);
            p++; // :
            v.obj.emplace_back(k.s, parse(p));
            ws(p);
            if (*p++ == '}') return v;
        }
    }
    if (*p == '[') {
        v.kind = 4;
        p++;
        ws(p);
        if (*p == ']') { p++; return v; }
        while (true) {
            v.arr.push_back(parse(p));
            ws(p);
            if (*p++ == ']') return v;
        }
    }
    if (*p == '"') {
        v.kind = 3;
        p++;
        while (*p && *p != '"') {
            if (*p != '\\') { v.s += *p++; continue; }
            p++;
            char e = *p++;
            if (e == 'n') v.s += '\n';
            else if (e == 't') v.s += '\t';
            else if (e == 'r') v.s += '\r';
            else if (e == 'b') v.s += '\b';
            else if (e == 'f') v.s += '\f';
            else if (e == 'u') {
                unsigned cp = (unsigned) std::strtoul(std::string(p, 4).c_str(), nullptr, 16);
                p += 4;
                if (cp >= 0xD800 && cp < 0xDC00 && p[0] == '\\' && p[1] == 'u') {
                    unsigned lo = (unsigned) std::strtoul(std::string(p + 2, 4).c_str(), nullptr, 16);
                    p += 6;
                    cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                }
                if (cp < 0x80) v.s += (char) cp;
                else if (cp < 0x800) { v.s += (char) (0xC0 | (cp >> 6)); v.s += (char) (0x80 | (cp & 63)); }
                else if (cp < 0x10000) { v.s += (char) (0xE0 | (cp >> 12)); v.s += (char) (0x80 | ((cp >> 6) & 63)); v.s += (char) (0x80 | (cp & 63)); }
                else { v.s += (char) (0xF0 | (cp >> 18)); v.s += (char) (0x80 | ((cp >> 12) & 63)); v.s += (char) (0x80 | ((cp >> 6) & 63)); v.s += (char) (0x80 | (cp & 63)); }
            } else v.s += e;
        }
        p++;
        return v;
    }
    if (std::strncmp(p, "true", 4) == 0) { v.kind = 1; v.b = true; p += 4; return v; }
    if (std::strncmp(p, "false", 5) == 0) { v.kind = 1; p += 5; return v; }
    if (std::strncmp(p, "null", 4) == 0) { p += 4; return v; }
    v.kind = 2;
    const char *start = p;
    while (*p && std::strchr("+-0123456789.eE", *p)) p++;
    std::string num(start, p);
    v.is_int = num.find_first_of(".eE") == std::string::npos;
    v.num = std::strtod(num.c_str(), nullptr);
    v.i = v.is_int ? std::strtoll(num.c_str(), nullptr, 10) : (long long) v.num;
    return v;
}
inline void from(const V &v, bool &out) { out = v.b; }
template <class T> typename std::enable_if<std::is_integral<T>::value>::type from(const V &v, T &out) { out = (T) (v.is_int ? v.i : (long long) v.num); }
template <class T> typename std::enable_if<std::is_floating_point<T>::value>::type from(const V &v, T &out) { out = (T) (v.is_int ? (double) v.i : v.num); }
inline void from(const V &v, std::string &out) { out = v.s; }
template <class A, class B> void from(const V &v, std::pair<A, B> &out);
template <class T, class Al> void from(const V &v, std::vector<T, Al> &out);
template <class T, size_t N> void from(const V &v, std::array<T, N> &out);
template <class T, class C, class Al> void from(const V &v, std::map<std::string, T, C, Al> &out);
template <class T, class H, class E, class Al> void from(const V &v, std::unordered_map<std::string, T, H, E, Al> &out);
template <class T, class Al> void from(const V &v, std::vector<T, Al> &out) {
    out.clear();
    out.reserve(v.arr.size());
    for (auto &x : v.arr) { T t{}; from(x, t); out.push_back(std::move(t)); }
}
template <class T, size_t N> void from(const V &v, std::array<T, N> &out) {
    for (size_t i = 0; i < N && i < v.arr.size(); i++) from(v.arr[i], out[i]);
}
template <class A, class B> void from(const V &v, std::pair<A, B> &out) {
    if (v.arr.size() == 2) { from(v.arr[0], out.first); from(v.arr[1], out.second); }
}
template <class T, class C, class Al> void from(const V &v, std::map<std::string, T, C, Al> &out) {
    out.clear();
    for (auto &kv : v.obj) { T t{}; from(kv.second, t); out.emplace(kv.first, std::move(t)); }
}
template <class T, class H, class E, class Al> void from(const V &v, std::unordered_map<std::string, T, H, E, Al> &out) {
    out.clear();
    for (auto &kv : v.obj) { T t{}; from(kv.second, t); out.emplace(kv.first, std::move(t)); }
}
