/* fast-anything recorder runtime for C: compiled into the app for one run. */
#ifndef _CRT_SECURE_NO_WARNINGS
#define _CRT_SECURE_NO_WARNINGS
#endif
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "fa_clock.h"
#include "fa_rec.h"

int fa_rec_inside;
const int fa_rec_slices[10] = {0, 1, 2, 3, 5, 8, 13, 21, 34, 55};

typedef struct { char *p; size_t len, cap; } fa_buf;
static fa_buf fa_args, fa_line;
static char **fa_kept, **fa_derived;
static size_t fa_nkept, fa_nderived, fa_limit;
static long long fa_calls, fa_skipped, fa_nanos, fa_derive_started;
static int fa_bad; /* the current call has something JSON can't hold */
static unsigned long long fa_rng = 0xFA57;

static void fa_put(fa_buf *b, const char *s, size_t n) {
    if (b->len + n + 1 > b->cap) {
        b->cap = (b->len + n + 1) * 2;
        b->p = (char *) realloc(b->p, b->cap);
    }
    memcpy(b->p + b->len, s, n);
    b->len += n;
    b->p[b->len] = 0;
}
static void fa_puts(fa_buf *b, const char *s) { fa_put(b, s, strlen(s)); }
static void fa_sep(void) {
    if (fa_args.len > 1) fa_puts(&fa_args, ",");
}

long long fa_rec_now(void) { return fa_now(); }
void fa_rec_begin(void) {
    fa_args.len = 0;
    fa_bad = 0;
    fa_puts(&fa_args, "[");
}
void fa_rec_i64(long long v) {
    char t[32];
    fa_sep();
    snprintf(t, sizeof t, "%lld", v);
    fa_puts(&fa_args, t);
}
void fa_rec_u64(unsigned long long v) {
    char t[32];
    fa_sep();
    snprintf(t, sizeof t, "%llu", v);
    fa_puts(&fa_args, t);
}
static void fa_f64_to(fa_buf *b, double v) {
    char t[40];
    if (!isfinite(v)) {
        fa_bad = 1;
        fa_puts(b, "null");
        return;
    }
    snprintf(t, sizeof t, "%.17g", v);
    if (!strpbrk(t, ".eE")) strcat(t, ".0");
    fa_puts(b, t);
}
void fa_rec_f64(double v) {
    fa_sep();
    fa_f64_to(&fa_args, v);
}
void fa_rec_bool(int v) {
    fa_sep();
    fa_puts(&fa_args, v ? "true" : "false");
}
static int fa_utf8_ok(const unsigned char *s) {
    while (*s) {
        int n = *s < 0x80 ? 0 : (*s >> 5) == 6 ? 1 : (*s >> 4) == 14 ? 2 : (*s >> 3) == 30 ? 3 : -1;
        if (n < 0) return 0;
        s++;
        while (n--) {
            if ((*s & 0xC0) != 0x80) return 0;
            s++;
        }
    }
    return 1;
}
void fa_rec_str(const char *s) {
    fa_sep();
    if (!s) {
        fa_puts(&fa_args, "null");
        return;
    }
    if (!fa_utf8_ok((const unsigned char *) s)) fa_bad = 1;
    fa_puts(&fa_args, "\"");
    for (const unsigned char *c = (const unsigned char *) s; *c; c++) {
        char t[8];
        if (*c == '"' || *c == '\\') {
            t[0] = '\\';
            t[1] = (char) *c;
            fa_put(&fa_args, t, 2);
        } else if (*c < 0x20) {
            snprintf(t, sizeof t, "\\u%04x", *c);
            fa_puts(&fa_args, t);
        } else {
            fa_put(&fa_args, (const char *) c, 1);
        }
    }
    fa_puts(&fa_args, "\"");
}
void fa_rec_arr_i64(const void *p, size_t n, int size, int is_signed) {
    fa_sep();
    fa_puts(&fa_args, "[");
    for (size_t i = 0; i < n; i++) {
        char t[32];
        const char *e = (const char *) p + i * size;
        if (is_signed) {
            long long v = size == 1 ? *(const signed char *) e : size == 2 ? *(const short *) e : size == 4 ? *(const int *) e : *(const long long *) e;
            snprintf(t, sizeof t, "%s%lld", i ? "," : "", v);
        } else {
            unsigned long long v = size == 1 ? *(const unsigned char *) e : size == 2 ? *(const unsigned short *) e : size == 4 ? *(const unsigned *) e : *(const unsigned long long *) e;
            snprintf(t, sizeof t, "%s%llu", i ? "," : "", v);
        }
        fa_puts(&fa_args, t);
    }
    fa_puts(&fa_args, "]");
}
void fa_rec_arr_f64(const void *p, size_t n, int size) {
    fa_sep();
    fa_puts(&fa_args, "[");
    for (size_t i = 0; i < n; i++) {
        if (i) fa_puts(&fa_args, ",");
        fa_f64_to(&fa_args, size == 4 ? (double) ((const float *) p)[i] : ((const double *) p)[i]);
    }
    fa_puts(&fa_args, "]");
}

static unsigned long long fa_next(void) {
    fa_rng ^= fa_rng << 13;
    fa_rng ^= fa_rng >> 7;
    fa_rng ^= fa_rng << 17;
    return fa_rng;
}
size_t fa_rec_rand(size_t below) { return below ? (size_t) (fa_next() % below) : 0; }

static char *fa_finish(const char *result, int derived) {
    fa_line.len = 0;
    fa_puts(&fa_line, "{\"args\":");
    fa_puts(&fa_line, fa_args.p);
    fa_puts(&fa_line, "],\"result\":");
    fa_puts(&fa_line, result);
    fa_puts(&fa_line, derived ? ",\"derived\":true}" : "}");
    char *copy = (char *) malloc(fa_line.len + 1);
    memcpy(copy, fa_line.p, fa_line.len + 1);
    return copy;
}
static void fa_keep(const char *result, long long took) {
    if (!fa_limit) {
        const char *l = getenv("FAST_ANYTHING_RECORD_LIMIT");
        fa_limit = l && atoi(l) > 0 ? (size_t) atoi(l) : 500;
        fa_kept = (char **) calloc(fa_limit, sizeof(char *));
    }
    fa_calls++;
    fa_nanos += took;
    if (fa_bad) {
        fa_skipped++;
        return;
    }
    size_t slot = fa_nkept < fa_limit ? fa_nkept : (size_t) (fa_next() % (unsigned long long) fa_calls);
    if (slot >= fa_limit) return;
    char *line = fa_finish(result, 0);
    if (slot < fa_nkept) {
        free(fa_kept[slot]);
    } else {
        fa_nkept++;
    }
    fa_kept[slot] = line;
}
static void fa_derive(const char *result) {
    if (fa_bad) return;
    fa_derived = (char **) realloc(fa_derived, (fa_nderived + 1) * sizeof(char *));
    fa_derived[fa_nderived++] = fa_finish(result, 1);
}
static const char *fa_fmt_i64(long long r) { static char t[32]; snprintf(t, sizeof t, "%lld", r); return t; }
static const char *fa_fmt_u64(unsigned long long r) { static char t[32]; snprintf(t, sizeof t, "%llu", r); return t; }
static const char *fa_fmt_f64(double r) {
    static fa_buf b;
    b.len = 0;
    fa_f64_to(&b, r);
    return b.p;
}
void fa_rec_done_i64(long long r, long long took) { fa_keep(fa_fmt_i64(r), took); }
void fa_rec_done_u64(unsigned long long r, long long took) { fa_keep(fa_fmt_u64(r), took); }
void fa_rec_done_f64(double r, long long took) { fa_keep(fa_fmt_f64(r), took); }
void fa_rec_done_bool(int r, long long took) { fa_keep(r ? "true" : "false", took); }
void fa_rec_derived_i64(long long r) { fa_derive(fa_fmt_i64(r)); }
void fa_rec_derived_u64(unsigned long long r) { fa_derive(fa_fmt_u64(r)); }
void fa_rec_derived_f64(double r) { fa_derive(fa_fmt_f64(r)); }
void fa_rec_derived_bool(int r) { fa_derive(r ? "true" : "false"); }

int fa_rec_derive_ok(void) {
    const char *d = getenv("FAST_ANYTHING_RECORD_DERIVE");
    if (d && d[0] == '0') return 0;
    if (!fa_derive_started) fa_derive_started = fa_now();
    return fa_nderived < 200 && fa_now() - fa_derive_started < 3000000000LL;
}

size_t fa_rec_chars(const char *s) {
    size_t n = 0;
    for (; *s; s++) n += ((unsigned char) *s & 0xC0) != 0x80;
    return n;
}
char *fa_rec_substr(const char *s, size_t off, size_t len) {
    const char *a = s;
    while (*a && off) {
        a++;
        while (((unsigned char) *a & 0xC0) == 0x80) a++;
        off--;
    }
    const char *b = a;
    while (*b && len) {
        b++;
        while (((unsigned char) *b & 0xC0) == 0x80) b++;
        len--;
    }
    char *out = (char *) malloc((size_t) (b - a) + 1);
    memcpy(out, a, (size_t) (b - a));
    out[b - a] = 0;
    return out;
}
void fa_rec_free(void *p) { free(p); }

static void fa_rec_save(void) {
    const char *path = getenv("FAST_ANYTHING_RECORD_OUT"), *meta = getenv("FAST_ANYTHING_RECORD_META");
    FILE *out = path ? fopen(path, "wb") : NULL;
    if (out) {
        for (size_t i = 0; i < fa_nkept; i++) fprintf(out, "%s\n", fa_kept[i]);
        for (size_t i = 0; i < fa_nderived; i++) fprintf(out, "%s\n", fa_derived[i]);
        fclose(out);
    }
    FILE *m = meta ? fopen(meta, "wb") : NULL;
    if (m) {
        fprintf(m, "{\"calls\":%lld,\"kept\":%zu,\"skipped\":%lld,\"unsupported\":[%s],\"original_ns\":%.3f}", fa_calls, fa_nkept,
                fa_skipped, fa_skipped ? "\"NaN, infinity or a string that isn't UTF-8\"" : "", fa_calls ? (double) fa_nanos / (double) fa_calls : 0.0);
        fclose(m);
    }
}

__attribute__((constructor)) static void fa_rec_start(void) { atexit(fa_rec_save); }
