// fast-anything recorder for C++ (C++14), force-included with -include for one run.
#ifndef FAST_ANYTHING_REC_HPP
#define FAST_ANYTHING_REC_HPP
#ifdef __cplusplus
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string>
#include <tuple>
#include <type_traits>
#include <unordered_map>
#include <utility>
#include <vector>

namespace fa_rec {
/*JSON*/

struct State {
    bool inside = false;
    std::vector<std::string> kept, derived;
    long long calls = 0, skipped = 0, nanos = 0, derive_started = 0;
    size_t edges = 0, edge_calls = 0;
    std::map<std::string, bool> seen;
    std::map<size_t, bool> grown;
    size_t limit = 0;
    unsigned long long rng = 0xFA57;
};
inline State &st() { static State s; return s; }
inline long long now() {
    return (long long) std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
}
inline unsigned long long next() {
    auto &r = st().rng;
    r ^= r << 13;
    r ^= r >> 7;
    r ^= r << 17;
    return r;
}
inline void save() {
    auto &s = st();
    if (const char *path = std::getenv("FAST_ANYTHING_RECORD_OUT")) {
        if (FILE *f = std::fopen(path, "wb")) {
            for (auto &l : s.kept) std::fprintf(f, "%s\n", l.c_str());
            for (auto &l : s.derived) std::fprintf(f, "%s\n", l.c_str());
            std::fclose(f);
        }
    }
    if (const char *path = std::getenv("FAST_ANYTHING_RECORD_META")) {
        if (FILE *f = std::fopen(path, "wb")) {
            std::fprintf(f, "{\"calls\":%lld,\"kept\":%zu,\"skipped\":%lld,\"unsupported\":[%s],\"original_ns\":%.3f}", s.calls, s.kept.size(), s.skipped,
                         s.skipped ? "\"a value JSON can't hold\"" : "", s.calls ? (double) s.nanos / (double) s.calls : 0.0);
            std::fclose(f);
        }
    }
}
inline bool &registered() {
    static bool r = (std::atexit(save), true);
    return r;
}
inline bool derive_ok() {
    auto &s = st();
    const char *d = std::getenv("FAST_ANYTHING_RECORD_DERIVE");
    if (d && d[0] == '0') return false;
    if (!s.derive_started) s.derive_started = now();
    return s.derived.size() < 200 + s.edges && now() - s.derive_started < 3000000000LL;
}
inline bool edge_ok() {
    auto &s = st();
    const char *d = std::getenv("FAST_ANYTHING_RECORD_DERIVE");
    if (d && d[0] == '0') return false;
    if (!s.derive_started) s.derive_started = now();
    return s.edges < 100 && now() - s.derive_started < 1500000000LL;
}
inline long long edge_left() { return 1500000000LL - (now() - st().derive_started); }

// Edge cases: inputs where ports and originals tend to part ways, of the same type as the recorded value.
template <class T> typename std::enable_if<!std::is_arithmetic<T>::value, std::vector<T>>::type edges(const T &) { return {}; }
template <class T> typename std::enable_if<std::is_arithmetic<T>::value, std::vector<T>>::type edges(const T &v) {
    std::vector<T> out;
    if (std::is_same<T, bool>::value) return out;
    std::vector<double> xs = {0, 1};
    if (std::is_signed<T>::value) xs.push_back(-1);
    if (std::is_floating_point<T>::value) xs.push_back(sizeof(T) >= 8 ? 1e300 : 1e30);
    for (double x : xs)
        if ((T) x != v) out.push_back((T) x);
    return out;
}
inline std::vector<std::string> edges(const std::string &v) {
    size_t mid = 0, chars = 0;
    for (size_t i = 0; i < v.size(); i++) chars += ((unsigned char) v[i] & 0xC0) != 0x80;
    for (size_t i = 0, c = 0; i <= v.size(); i++) {
        if (i == v.size() || ((unsigned char) v[i] & 0xC0) != 0x80) {
            if (c == chars / 2) { mid = i; break; }
            c++;
        }
    }
    // an accent, CJK, an emoji with a modifier, a combining mark (UTF-8 bytes)
    const std::string a = "\xC3\xA9", cjk = "\xE6\x97\xA5\xE6\x9C\xAC", emoji = "\xF0\x9F\x91\x8D\xF0\x9F\x8F\xBD", comb = "e\xCC\x81";
    return {v.substr(0, mid) + a + v.substr(mid), v + cjk, emoji + v, v + comb, ""};
}
template <class T, class Al> std::vector<std::vector<T, Al>> edges(const std::vector<T, Al> &v) {
    std::vector<std::vector<T, Al>> out;
    if (v.empty()) return out;
    out.emplace_back();
    auto es = edges(v[0]);
    for (size_t k = 0; k < es.size() && k < 4; k++) {
        out.push_back(v);
        out.back()[0] = es[k];
    }
    return out;
}
// A short version of a recorded value, so edge cases stay cheap when the real inputs are big.
template <class T> T small(const T &v) { return v; }
inline std::string small(const std::string &v) {
    size_t i = 0, chars = 0;
    for (; i < v.size(); i++)
        if (((unsigned char) v[i] & 0xC0) != 0x80 && chars++ == 64) break;
    return v.substr(0, i);
}
template <class T, class Al> std::vector<T, Al> small(const std::vector<T, Al> &v) {
    return v.size() > 8 ? std::vector<T, Al>(v.begin(), v.begin() + 8) : v;
}
template <class Tup, size_t... I> Tup small_tuple(const Tup &t, std::index_sequence<I...>) { return Tup(small(std::get<I>(t))...); }

template <class T> bool bigger(const T &, int, T &) { return false; }
inline bool bigger(const std::string &v, int factor, std::string &out) {
    if (v.empty() || v.size() * (size_t) factor > 4096 * 4) return false;
    out.clear();
    for (int k = 0; k < factor; k++) out += v;
    return true;
}
template <class T, class Al> bool bigger(const std::vector<T, Al> &v, int factor, std::vector<T, Al> &out) {
    if (v.empty() || v.size() * (size_t) factor > 4096) return false;
    out.clear();
    for (int k = 0; k < factor; k++) out.insert(out.end(), v.begin(), v.end());
    return true;
}

static const size_t SLICES[] = {0, 1, 2, 3, 5, 8, 13, 21, 34, 55};
template <class T> std::vector<T> variants(const T &) { return {}; }
inline std::vector<std::string> variants(const std::string &v) {
    std::vector<size_t> starts;
    for (size_t i = 0; i < v.size(); i++)
        if (((unsigned char) v[i] & 0xC0) != 0x80) starts.push_back(i);
    std::vector<std::string> out;
    size_t n = starts.size();
    starts.push_back(v.size());
    if (n < 2) return out;
    for (size_t len : SLICES) {
        if (len >= n) break;
        for (int rep = 0; rep < (len < 2 ? 1 : 3); rep++) {
            size_t off = (size_t) (next() % (n - len + 1));
            out.push_back(v.substr(starts[off], starts[off + len] - starts[off]));
        }
    }
    return out;
}
template <class T, class Al> std::vector<std::vector<T, Al>> variants(const std::vector<T, Al> &v) {
    std::vector<std::vector<T, Al>> out;
    size_t n = v.size();
    if (n < 2) return out;
    for (size_t len : SLICES) {
        if (len >= n) break;
        for (int rep = 0; rep < (len < 2 ? 1 : 3); rep++) {
            size_t off = (size_t) (next() % (n - len + 1));
            out.emplace_back(v.begin() + off, v.begin() + off + len);
        }
    }
    return out;
}

template <class F, class Tup, size_t... I> auto apply(F &f, Tup &t, std::index_sequence<I...>) -> decltype(f(std::get<I>(t)...)) {
    return f(std::get<I>(t)...);
}
template <class Tup, size_t... I> bool encode_tuple(std::string &o, const Tup &t, std::index_sequence<I...>) { return enc_all(o, std::get<I>(t)...); }
template <size_t I, class F, class Tup, class Seq> void derive_one(F &f, const Tup &args, Seq seq) {
    for (auto &smaller : variants(std::get<I>(args))) {
        if (!derive_ok()) return;
        Tup next_args = args;
        std::get<I>(next_args) = smaller;
        std::string in = "[";
        if (!encode_tuple(in, next_args, seq)) continue;
        in += "]";
        try {
            auto r = apply(f, next_args, seq);
            std::string out;
            if (enc(out, r)) st().derived.push_back("{\"args\":" + in + ",\"result\":" + out + ",\"derived\":true}");
        } catch (...) {
            // outside the function's domain: not a fair test
        }
    }
}
template <class F, class Tup, class Seq> long long edge_try(F &f, const Tup &next_args, Seq seq) {
    std::string in = "[";
    if (!encode_tuple(in, next_args, seq)) return -1;
    in += "]";
    auto &s = st();
    if (s.seen[in]) return -1;
    s.seen[in] = true;
    try {
        Tup copy = next_args;
        long long t = now();
        auto r = apply(f, copy, seq);
        long long took = now() - t;
        std::string out;
        if (!enc(out, r)) return -1;
        s.derived.push_back("{\"args\":" + in + ",\"result\":" + out + ",\"derived\":\"edge\"}");
        s.edges++;
        return took;
    } catch (...) {
        return -1;  // outside the function's domain: not a fair test
    }
}
template <size_t I, class F, class Tup, class Seq> void edge_one(F &f, const Tup &args, Seq seq) {
    const Tup base = small_tuple(args, seq);
    for (auto &e : edges(std::get<I>(base))) {
        if (!edge_ok()) return;
        Tup next_args = base;
        std::get<I>(next_args) = e;
        edge_try(f, next_args, seq);
    }
    auto &s = st();
    typename std::decay<decltype(std::get<I>(args))>::type big;
    if (s.grown[I] || !bigger(std::get<I>(base), 4, big)) return;
    // much bigger inputs, only while their time (assumed quadratic) fits the budget
    s.grown[I] = true;
    long long took;
    try {
        Tup copy = base;
        long long t = now();
        apply(f, copy, seq);
        took = now() - t;
    } catch (...) {
        return;
    }
    // 4x bigger each step, from the short version of the input, up to 4096 items
    for (int factor : {4, 16, 64, 256, 512}) {
        if (!edge_ok() || !bigger(std::get<I>(base), factor, big) || took * 16 > edge_left() / 2) return;
        Tup next_args = base;
        std::get<I>(next_args) = big;
        took = edge_try(f, next_args, seq);
        if (took < 0) return;
    }
}
template <class F, class Tup, size_t... I> void derive_all(F &f, const Tup &args, std::index_sequence<I...> seq) {
    if (st().edge_calls++ < 20) {
        int edge_dummy[] = {0, (edge_one<I>(f, args, seq), 0)...};
        (void) edge_dummy;
    }
    int dummy[] = {0, (derive_one<I>(f, args, seq), 0)...};
    (void) dummy;
}

template <class F, class... A> auto call(F f, const A &...a) -> decltype(f(a...)) {
    auto &s = st();
    registered();
    s.inside = true;
    struct Reset {
        ~Reset() { st().inside = false; }
    } reset;
    if (!s.limit) {
        const char *l = std::getenv("FAST_ANYTHING_RECORD_LIMIT");
        s.limit = l && std::atoi(l) > 0 ? (size_t) std::atoi(l) : 500;
    }
    s.calls++;
    size_t slot = s.kept.size() < s.limit ? s.kept.size() : (size_t) (next() % (unsigned long long) s.calls);
    std::string in = "[";
    bool ok = slot < s.limit && enc_all(in, a...);
    in += "]";
    long long t = now();
    auto r = f(a...);
    s.nanos += now() - t;
    if (slot < s.limit) {
        std::string out;
        if (ok && enc(out, r)) {
            std::string line = "{\"args\":" + in + ",\"result\":" + out + "}";
            if (slot < s.kept.size()) s.kept[slot] = line;
            else s.kept.push_back(line);
            if (derive_ok()) {
                std::tuple<typename std::decay<A>::type...> args(a...);
                derive_all(f, args, std::index_sequence_for<A...>{});
            }
        } else {
            s.skipped++;
        }
    }
    return r;
}
} // namespace fa_rec
#endif
#endif
