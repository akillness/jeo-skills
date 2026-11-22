/* fast-anything recorder for C, force-included with -include for one run. */
#ifndef FAST_ANYTHING_REC_H
#define FAST_ANYTHING_REC_H
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
extern int fa_rec_inside;
extern const int fa_rec_slices[10];
long long fa_rec_now(void);
void fa_rec_begin(void);
void fa_rec_i64(long long v);
void fa_rec_u64(unsigned long long v);
void fa_rec_f64(double v);
void fa_rec_bool(int v);
void fa_rec_str(const char *s);
void fa_rec_arr_i64(const void *p, size_t n, int size, int is_signed);
void fa_rec_arr_f64(const void *p, size_t n, int size);
/* kind: 'i' signed, 'u' unsigned, 'f' float, 'b' bool */
void fa_rec_done_i64(long long r, long long took);
void fa_rec_done_u64(unsigned long long r, long long took);
void fa_rec_done_f64(double r, long long took);
void fa_rec_done_bool(int r, long long took);
void fa_rec_derived_i64(long long r);
void fa_rec_derived_u64(unsigned long long r);
void fa_rec_derived_f64(double r);
void fa_rec_derived_bool(int r);
int fa_rec_derive_ok(void);
size_t fa_rec_rand(size_t below);
size_t fa_rec_chars(const char *s);
char *fa_rec_substr(const char *s, size_t off, size_t len);
void fa_rec_free(void *p);
#ifdef __cplusplus
}
#endif
#endif
