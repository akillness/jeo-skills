//! Reference port of fuzzy.findDuplicates (with levenshtein and normalize inside it):
//! what a good agent run produces. CI uses it to test the pipeline without an agent.

use napi::bindgen_prelude::*;
use napi_derive::napi;

/// JavaScript's name.toLowerCase().split(/\s+/).filter(Boolean).join(" "), as UTF-16 code units
/// (what JavaScript compares).
fn normalize(name: &str) -> Vec<u16> {
    let lower = name.to_lowercase();
    let words: Vec<&str> = lower.split(|c: char| c.is_whitespace() || c == '\u{feff}').filter(|w| !w.is_empty()).collect();
    words.join(" ").encode_utf16().collect()
}

#[napi(js_name = "findDuplicates", catch_unwind)]
pub fn find_duplicates(names: Vec<String>, max_distance: Option<f64>) -> Result<Vec<Vec<f64>>> {
    let max = max_distance.unwrap_or(2.0);
    if max < 0.0 {
        return Ok(Vec::new());
    }
    let clean: Vec<Vec<u16>> = names.iter().map(|n| normalize(n)).collect();
    let found = pairs(&clean, max.floor() as usize);
    Ok(found.into_iter().map(|(i, j)| vec![i as f64, j as f64]).collect())
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
