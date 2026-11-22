// How many points of a width x height grid over [-2, 1] x [-1.5, 1.5] stay bounded for max_iter steps.
long long mandelbrot(int width, int height, int max_iter) {
    long long inside = 0;
    for (int py = 0; py < height; py++) {
        for (int px = 0; px < width; px++) {
            double x0 = -2.0 + 3.0 * px / width;
            double y0 = -1.5 + 3.0 * py / height;
            double x = 0.0, y = 0.0;
            int i = 0;
            while (x * x + y * y <= 4.0 && i < max_iter) {
                double t = x * x - y * y + x0;
                y = 2.0 * x * y + y0;
                x = t;
                i++;
            }
            if (i == max_iter) inside++;
        }
    }
    return inside;
}
