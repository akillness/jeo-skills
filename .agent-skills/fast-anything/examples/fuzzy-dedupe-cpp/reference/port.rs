//! Reference port of find_duplicates (with levenshtein and normalize inside it):
//! what a good agent run produces. CI uses it to test the pipeline without an agent.

/// The C++ normalize: ASCII lowercase, whitespace (std::isspace in the C locale) squeezed and trimmed, as bytes.
fn normalize(name: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(name.len());
    let mut space = false;
    for &c in name.as_bytes() {
        if matches!(c, b' ' | b'\t' | b'\n' | b'\x0B' | b'\x0C' | b'\r') {
            space = !out.is_empty();
            continue;
        }
        if space {
            out.push(b' ');
        }
        space = false;
        out.push(c.to_ascii_lowercase());
    }
    out
}

pub fn find_duplicates(names: Vec<String>, max_distance: i32) -> Result<Vec<(i32, i32)>, String> {
    if max_distance < 0 {
        return Ok(Vec::new());
    }
    let clean: Vec<Vec<u8>> = names.iter().map(|n| normalize(n)).collect();
    Ok(pairs(&clean, max_distance as usize).into_iter().map(|(i, j)| (i as i32, j as i32)).collect())
}

/// Edit distance, one row on the shorter side, common prefix and suffix skipped.
fn distance<T: PartialEq>(a: &[T], b: &[T], row: &mut Vec<usize>) -> usize {
    let prefix = a.iter().zip(b).take_while(|(x, y)| x == y).count();
    let (a, b) = (&a[prefix..], &b[prefix..]);
    let suffix = a.iter().rev().zip(b.iter().rev()).take_while(|(x, y)| x == y).count();
    let (a, b) = (&a[..a.len() - suffix], &b[..b.len() - suffix]);
    let (long, short) = if a.len() >= b.len() { (a, b) } else { (b, a) };
    if short.is_empty() {
        return long.len();
    }
    row.clear();
    row.extend(0..=short.len());
    for (i, ca) in long.iter().enumerate() {
        let mut diagonal = row[0];
        row[0] = i + 1;
        for (j, cb) in short.iter().enumerate() {
            let above = row[j + 1];
            row[j + 1] = (above + 1).min(row[j] + 1).min(diagonal + usize::from(ca != cb));
            diagonal = above;
        }
    }
    row[short.len()]
}

/// All (i, j) with i < j and distance <= max, in the original loop order, spread over threads.
fn pairs<T: PartialEq + Sync>(clean: &[Vec<T>], max: usize) -> Vec<(usize, usize)> {
    let threads = std::thread::available_parallelism().map_or(1, |n| n.get()).min(clean.len().max(1));
    let mut found: Vec<(usize, usize)> = std::thread::scope(|s| {
        let workers: Vec<_> = (0..threads)
            .map(|t| {
                s.spawn(move || {
                    let mut row = Vec::new();
                    let mut out = Vec::new();
                    for i in (t..clean.len()).step_by(threads) {
                        for j in i + 1..clean.len() {
                            if clean[i].len().abs_diff(clean[j].len()) <= max && distance(&clean[i], &clean[j], &mut row) <= max {
                                out.push((i, j));
                            }
                        }
                    }
                    out
                })
            })
            .collect();
        workers.into_iter().flat_map(|w| w.join().expect("worker panicked")).collect()
    });
    found.sort_unstable();
    found
}
