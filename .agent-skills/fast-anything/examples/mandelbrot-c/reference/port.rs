//! Reference port of mandelbrot: what a good agent run produces. CI uses it to test the pipeline
//! without an agent. Same arithmetic in the same order (so the same doubles), rows spread over threads.

pub fn mandelbrot(width: i32, height: i32, max_iter: i32) -> Result<i64, String> {
    if width <= 0 || height <= 0 {
        return Ok(0);
    }
    let threads = std::thread::available_parallelism().map_or(1, |n| n.get()).min(height as usize);
    let total = std::thread::scope(|s| {
        let workers: Vec<_> = (0..threads)
            .map(|t| {
                s.spawn(move || {
                    let mut inside = 0i64;
                    for py in (t as i32..height).step_by(threads) {
                        let y0 = -1.5 + 3.0 * py as f64 / height as f64;
                        for px in 0..width {
                            let x0 = -2.0 + 3.0 * px as f64 / width as f64;
                            let (mut x, mut y, mut i) = (0.0f64, 0.0f64, 0);
                            while x * x + y * y <= 4.0 && i < max_iter {
                                let t = x * x - y * y + x0;
                                y = 2.0 * x * y + y0;
                                x = t;
                                i += 1;
                            }
                            if i == max_iter {
                                inside += 1;
                            }
                        }
                    }
                    inside
                })
            })
            .collect();
        workers.into_iter().map(|w| w.join().expect("worker panicked")).sum::<i64>()
    });
    Ok(total)
}
