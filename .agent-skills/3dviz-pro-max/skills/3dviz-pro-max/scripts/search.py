"""Lexical suggestions, not a semantic router or a probability of correctness."""
import argparse
from collections import Counter
import json
import math
import re
import unicodedata
from manifest_contract import COLLECTIONS, KNOWLEDGE_KINDS
from catalog import SKILL_ROOT, field_text, fingerprint, load_catalog


def tokens(text):
    normalized = unicodedata.normalize('NFKC', text).casefold().replace('’', "'")
    return re.findall(r"\d+(?:[x×]\d+)+|[\w]+(?:')?|[+−=]", normalized)


def expand(query, cfg):
    """Alias phrases widen a lexical query; they never assert that two phrases mean the same."""
    terms = set(tokens(query))
    normalized = unicodedata.normalize('NFKC', query).casefold().replace('’', "'")
    expanded = set()
    for phrase, extra in cfg.get('query_aliases', {}).items():
        # Phrase match on word boundaries: 'foam' must not fire inside 'foamboard'.
        if re.search(rf'(?<!\w){re.escape(phrase)}(?!\w)', normalized):
            expanded.update(token for term in extra for token in tokens(term))
    return terms | expanded, expanded - terms


def search(query, manifest, records, limit=5, direction=None, exclude_ids=(), algorithm=None,
           collection='recipes', kind=None):
    if collection not in COLLECTIONS or (kind is not None and kind not in KNOWLEDGE_KINDS):
        raise ValueError('Unknown collection or knowledge kind')
    if not 1 <= limit <= 20:
        raise ValueError('limit must be between 1 and 20')
    cfg = manifest['search']
    method = algorithm or cfg['algorithm']
    if method not in ('weighted-field-bm25', 'overlap'):
        raise ValueError('Unknown search algorithm')
    terms, expanded = expand(query, cfg)
    active = [r for r in records if r.get('status') == 'active' and
              (collection == 'all' or r['id'].startswith(
                  'recipe.' if collection == 'recipes' else 'knowledge.'))]
    results = []
    # Corpus statistics are stable across structured filters.
    corpora = {field: [Counter(tokens(field_text(r, field))) for r in active]
               for field in cfg['fields']}
    n = len(active)
    for i, record in enumerate(active):
        if record['id'] in exclude_ids or (direction and direction not in record['direction_ids']):
            continue
        if kind and record.get('knowledge_kind') != kind:
            continue
        exact = query.strip().casefold() == record['id'].casefold()
        alias = any(tokens(a) == tokens(query) for a in record.get('aliases', {}).get('en', []))
        score, matches = 0.0, []
        for field, boost in cfg['fields'].items():
            corpus = corpora[field]
            bag = corpus[i]
            hit = terms & bag.keys()
            if not hit:
                continue
            matches.append(field)
            if method == 'overlap':
                score += boost * len(hit)
                continue
            avg = sum(sum(b.values()) for b in corpus) / max(n, 1)
            length = sum(bag.values())
            for term in hit:
                df = sum(term in b for b in corpus)
                # Positive smoothed IDF; weighted sum of independently normalized fields.
                idf = math.log1p((n - df + 0.5) / (df + 0.5))
                tf = bag[term]
                denominator = tf + cfg['k1'] * (1 - cfg['b'] + cfg['b'] * length / max(avg, 1))
                score += boost * idf * tf * (cfg['k1'] + 1) / denominator
        if terms and (score > 0 or exact or alias):
            results.append({'id': record['id'], 'revision': record['revision'],
                            'title': record['title']['en'], 'path': record.get('_path'),
                            'collection': 'knowledge' if record['id'].startswith('knowledge.') else 'recipes',
                            'kind': record.get('knowledge_kind', 'recipe'),
                            'score': round(score, 6), 'exact_id': exact, 'exact_alias': alias,
                            'matched_fields': matches, 'summary': record['summary']})
    results.sort(key=lambda r: (-r['exact_id'], -r['exact_alias'], -r['score'], r['id']))
    ambiguous = len([r for r in results if r['exact_alias']]) > 1
    if not results:
        hint = 'no match: describe the look in plain words; the catalog is not a menu'
    elif len(results) < 3:
        hint = 'few candidates: rephrase in plain words, or narrow with --kind style-profile / --kind lighting-profile'
    else:
        hint = ''
    return {'status': 'ambiguous' if ambiguous else 'candidates' if results else 'no-match',
            'query': query, 'algorithm': method, 'index_version': cfg['version'],
            'expanded_terms': sorted(expanded), 'hint': hint,
            'catalog_hash': fingerprint(manifest, records), 'results': results[:limit],
            'notice': 'Lexical candidates only. Interpret negation and intent before choosing. '
                      'Scores are not probabilities; no match does not limit creative capability.'}


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('query', help='Plain words; manifest query aliases add related craft terms')
    parser.add_argument('--limit', type=int, default=5)
    parser.add_argument('--direction')
    parser.add_argument('--collection', choices=sorted(COLLECTIONS), default='all',
                        help='Both collections by default; narrow with recipes or knowledge')
    parser.add_argument('--kind', choices=sorted(KNOWLEDGE_KINDS))
    parser.add_argument('--exclude-id', action='append', default=[])
    parser.add_argument('--algorithm', choices=['overlap', 'weighted-field-bm25'])
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    try:
        manifest, records, _ = load_catalog(collection=args.collection)
        print(json.dumps(search(args.query, manifest, records, args.limit, args.direction,
                                args.exclude_id, args.algorithm, args.collection, args.kind), indent=2))
    except (ValueError, OSError, KeyError) as error:
        parser.exit(2, f'{error}\n')


if __name__ == '__main__':
    main()
