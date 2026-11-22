//! Reference port of Fuzzy::findDuplicates (with levenshtein and normalize inside it):
//! what a good agent run produces. CI uses it to test the pipeline without an agent.
#![allow(non_snake_case)]

/// PHP's implode(' ', preg_split('/\s+/', strtolower(trim($name)), -1, PREG_SPLIT_NO_EMPTY)), as characters.
/// strtolower only touches ASCII; \s without /u is ASCII whitespace.
fn normalize(name: &str) -> Vec<char> {
    let is_space = |c: char| matches!(c, ' ' | '\t' | '\n' | '\r' | '\x0B' | '\x0C');
    let trimmed = name.trim_matches(|c: char| matches!(c, ' ' | '\t' | '\n' | '\r' | '\0' | '\x0B'));
    let mut out = Vec::with_capacity(trimmed.len());
    for word in trimmed.split(is_space).filter(|w| !w.is_empty()) {
        if !out.is_empty() {
            out.push(' ');
        }
        out.extend(word.chars().map(|c| c.to_ascii_lowercase()));
    }
    out
}

pub fn findDuplicates(names: Vec<String>, maxDistance: i64) -> Result<Vec<[i64; 2]>, String> {
    if maxDistance < 0 {
        return Ok(Vec::new());
    }
    let clean: Vec<Vec<char>> = names.iter().map(|n| normalize(n)).collect();
    Ok(pairs(&clean, maxDistance as usize).into_iter().map(|(i, j)| [i as i64, j as i64]).collect())
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
