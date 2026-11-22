/* fast-anything profiler for one run: force-included with -include, removed afterwards. */
#ifndef FAST_ANYTHING_PROF_H
#define FAST_ANYTHING_PROF_H
#ifdef __cplusplus
extern "C" {
#endif
typedef struct { int id; long long t; } fa_prof_frame;
fa_prof_frame fa_prof_enter(int id);
void fa_prof_exit(fa_prof_frame *f);
#ifdef __cplusplus
}
#endif
#if defined(__SYCL_DEVICE_ONLY__)
/* SYCL device code (icpx -fsycl): the device pass can't call host functions, and kernels run on the device anyway */
#define FA_PROF(id)
#else
#define FA_PROF(id) __attribute__((cleanup(fa_prof_exit))) fa_prof_frame fa_prof_frame_ = fa_prof_enter(id)
#endif
#endif
