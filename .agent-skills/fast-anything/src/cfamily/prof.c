/* fast-anything profiler runtime: compiled into the app for one run. */
#ifndef _CRT_SECURE_NO_WARNINGS
#define _CRT_SECURE_NO_WARNINGS
#endif
#include <stdio.h>
#include <stdlib.h>
#include "fa_clock.h"
#include "fa_prof.h"

#define FA_MAX 65536
typedef struct { long long calls, own, cum; int active; } fa_stat;
static fa_stat fa_stats[FA_MAX];
static __thread long long fa_children[1024];
static __thread int fa_depth;
static long long fa_started;

#ifdef __cplusplus
extern "C" {
#endif
fa_prof_frame fa_prof_enter(int id) {
    fa_prof_frame f;
    f.id = id;
    if (id >= 0 && id < FA_MAX) fa_stats[id].active++;
    if (fa_depth < 1024) fa_children[fa_depth] = 0;
    fa_depth++;
    f.t = fa_now();
    return f;
}

void fa_prof_exit(fa_prof_frame *f) {
    long long took = fa_now() - f->t;
    fa_depth--;
    long long children = fa_depth < 1024 ? fa_children[fa_depth] : 0;
    if (f->id >= 0 && f->id < FA_MAX) {
        fa_stat *s = &fa_stats[f->id];
        s->calls++;
        s->own += took - children;
        if (--s->active == 0) s->cum += took;
    }
    if (fa_depth > 0 && fa_depth <= 1024) fa_children[fa_depth - 1] += took;
}
#ifdef __cplusplus
}
#endif

static void fa_prof_save(void) {
    const char *path = getenv("FAST_ANYTHING_PROF_OUT");
    FILE *out = path ? fopen(path, "wb") : NULL;
    if (!out) return;
    fprintf(out, "{\"wall\":%.9f,\"stats\":{", (double) (fa_now() - fa_started) / 1e9);
    int first = 1;
    for (int i = 0; i < FA_MAX; i++) {
        if (!fa_stats[i].calls) continue;
        fprintf(out, "%s\"%d\":[%lld,%.9f,%.9f]", first ? "" : ",", i, fa_stats[i].calls, (double) fa_stats[i].own / 1e9, (double) fa_stats[i].cum / 1e9);
        first = 0;
    }
    fprintf(out, "}}");
    fclose(out);
}

__attribute__((constructor)) static void fa_prof_start(void) {
    fa_started = fa_now();
    atexit(fa_prof_save);
}
