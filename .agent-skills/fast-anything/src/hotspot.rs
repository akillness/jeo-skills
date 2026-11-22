//! What a scan finds: functions, how much of the run they cost, and whether they can move to Rust.

use serde::{Deserialize, Serialize};

/// Functions under this share of the run aren't worth porting.
pub const WORTH_IT: f64 = 0.02;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Param {
    pub name: String,
    pub annotation: Option<String>,
    /// Default value as source text, e.g. "2" or "None".
    pub default: Option<String>,
    /// Keyword-only (after `*` in Python).
    pub kwonly: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Hotspot {
    pub id: String,
    pub file: String,
    pub line: u32,
    pub end_line: u32,
    pub name: String,
    pub qualname: String,
    pub module: Option<String>,
    pub kind: String,
    pub ncalls: u64,
    pub tottime: f64,
    pub cumtime: f64,
    /// Share of the run spent in this function, callees included.
    pub share: f64,
    /// 0 = can't be ported, 1 = ideal candidate.
    pub portability: f64,
    pub score: f64,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
    pub params: Vec<Param>,
    pub returns: Option<String>,
    pub source: String,
    /// Functions from the same file this one calls.
    pub calls: Vec<String>,
    /// A portable caller that takes about as long: porting it covers this one too,
    /// and saves a Python/JS -> Rust crossing per call.
    pub covered_by: Option<String>,
    /// Ruby: the module (or Object) whose method this is, as a Ruby expression.
    /// Python: the class of a @staticmethod.
    pub owner: Option<String>,
}

impl Hotspot {
    pub fn portable(&self) -> bool {
        self.blockers.is_empty()
    }

    pub fn worth_it(&self) -> bool {
        self.portable() && self.covered_by.is_none() && self.share >= WORTH_IT
    }
}

/// Give each function an id and a score (time share x portability), best first.
pub fn rank(mut list: Vec<Hotspot>, wall: f64) -> Vec<Hotspot> {
    for h in &mut list {
        h.id = match h.module.as_deref() {
            Some(m) if m != "__main__" => format!("{m}.{}", h.qualname),
            _ => format!("{}:{}", h.file, h.qualname),
        };
        h.share = if wall > 0.0 { (h.cumtime / wall).clamp(0.0, 1.0) } else { 0.0 };
        h.portability = if h.portable() { h.portability.clamp(0.0, 1.0) } else { 0.0 };
        h.score = h.share * h.portability;
    }
    // Prefer the outermost portable function: one call into Rust instead of one per inner call.
    let callers: Vec<(String, String, f64, Vec<String>)> = list
        .iter()
        .filter(|h| h.portable())
        .map(|h| (h.id.clone(), h.file.clone(), h.share, h.calls.clone()))
        .collect();
    for h in list.iter_mut().filter(|h| h.portable()) {
        let cover = callers
            .iter()
            .filter(|(id, file, share, calls)| {
                *id != h.id && *file == h.file && calls.contains(&h.name) && *share >= 0.9 * h.share
            })
            .max_by(|a, b| a.2.total_cmp(&b.2));
        if let Some((id, ..)) = cover {
            h.covered_by = Some(id.clone());
            h.score = 0.0;
        }
    }
    list.sort_by(|a, b| b.score.total_cmp(&a.score).then(b.share.total_cmp(&a.share)));
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hs(name: &str, module: Option<&str>, cumtime: f64, portability: f64, blocked: bool) -> Hotspot {
        Hotspot {
            name: name.into(),
            qualname: name.into(),
            file: "app.py".into(),
            module: module.map(Into::into),
            cumtime,
            portability,
            blockers: if blocked { vec!["does I/O: print".into()] } else { vec![] },
            ..Default::default()
        }
    }

    #[test]
    fn outer_loop_covers_inner_function() {
        let mut outer = hs("find_duplicates", Some("fuzzy"), 9.9, 1.0, false);
        outer.calls = vec!["lev".into()];
        let ranked = rank(vec![hs("lev", Some("fuzzy"), 9.5, 1.0, false), outer], 10.0);
        assert_eq!(ranked[0].id, "fuzzy.find_duplicates");
        assert_eq!(ranked[1].covered_by.as_deref(), Some("fuzzy.find_duplicates"));
        assert!(!ranked[1].worth_it());
    }

    #[test]
    fn portable_beats_bigger_but_blocked() {
        let ranked = rank(
            vec![
                hs("main", Some("__main__"), 10.0, 1.0, true),
                hs("lev", Some("fuzzy"), 9.0, 1.0, false),
                hs("norm", Some("fuzzy"), 0.1, 1.0, false),
            ],
            10.0,
        );
        assert_eq!(ranked[0].id, "fuzzy.lev");
        assert!((ranked[0].share - 0.9).abs() < 1e-9);
        assert_eq!(ranked[1].id, "fuzzy.norm");
        assert_eq!(ranked[2].id, "app.py:main");
        assert_eq!(ranked[2].score, 0.0);
        assert!(!ranked[1].worth_it());
    }
}
