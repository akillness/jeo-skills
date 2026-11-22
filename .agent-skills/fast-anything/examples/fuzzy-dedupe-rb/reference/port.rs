//! Reference port of Fuzzy.find_duplicates (with levenshtein and normalize inside it):
//! what a good agent run produces. CI uses it to test the pipeline without an agent.

/// Ruby's name.downcase.split.join(" "): split only splits on ASCII whitespace.
fn normalize(name: &str) -> Vec<char> {
    let lower = name.to_lowercase();
    let mut out = Vec::with_capacity(lower.len());
    for word in lower.split(|c: char| matches!(c, ' ' | '\t' | '\n' | '\x0B' | '\x0C' | '\r')).filter(|w| !w.is_empty()) {
        if !out.is_empty() {
            out.push(' ');
        }
        out.extend(word.chars());
    }
    out
}

pub fn find_duplicates(names: Vec<String>, max_distance: i64) -> Result<Vec<(i64, i64)>, String> {
    if max_distance < 0 {
        return Ok(Vec::new());
    }
    let clean: Vec<Vec<char>> = names.iter().map(|n| normalize(n)).collect();
    Ok(pairs(&clean, max_distance as usize).into_iter().map(|(i, j)| (i as i64, j as i64)).collect())
}

/// Edit distance, one row on the shorter side; stops early once it can't be <= limit.
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

/// All (i, j) with i < j and distance <= max, in the same order as the nested loops.
/// Rows are spread over threads round-robin, then merged back into order.
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
                            // the distance is at least the length difference
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
