// Count the points inside the Mandelbrot set at a few zoom levels, the slow way.
//     clang -O2 -ffp-contract=off main.c mandelbrot.c -o mandelbrot
// (-ffp-contract=off: no fused multiply-add, so every compiler gives the same doubles)
#include <stdio.h>

long long mandelbrot(int width, int height, int max_iter);

int main(void) {
    long long total = 0;
    for (int k = 1; k <= 8; k++) {
        long long inside = mandelbrot(160 * k, 120 * k, 2000);
        printf("%4dx%-4d %lld points inside\n", 160 * k, 120 * k, inside);
        total += inside;
    }
    printf("total %lld\n", total);
    return 0;
}
