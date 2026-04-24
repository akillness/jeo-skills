# RTK Summary

## Command
`rtk json evidence.json` 기반 키/핵심값 추출

## Top-level keys
{
  cli_spotlight:
  [{
      archived: bool,
      description: string[171],
      fit_rationale: string,
      fit_score: int,
      full_name: string,
      lane: string,
      license: string,
      proposal_type: string,
      provenance: string,
      pushed_at: string,
      stars: int,
      updated_at: string,
      url: url
    }] (3)
  generated_at_utc: string,
  lanes:
  {
    agentic:
    {
      degraded_causes:
      {
        license: int
      }
      discovery_count: int,
      dropped_sample:
      [{
          archived: bool,
          description: string,
          drop_reasons:
          [
            ...
          ]
          fit_rationale: string[53],
          fit_score: int,
          full_name: string,
          license: string,
          provenance: string,
          pushed_at: string,
          stars: int,
          updated_at: string,
          url: url
        }] (10)
      kept:
      [{
          archived: bool,
          description: string[126],
          fit_rationale: string[53],
          fit_score: int,
          full_name: string,
          license: date?,
          provenance: string,
          pushed_at: string,
          stars: int,
          updated_at: string,
          url: string[69]
        }] (8)
      keyword: string,
      lane_status: string,
      queries_used:
      [
        string
      ]
      threshold: int
    }
    backend:
    {
      degraded_causes:
      {}
      discovery_count: int,
      dropped_sample:
      []
      kept:
      []
      keyword: string,
      lane_status: string,
      queries_used:
      [string] (3)
      threshold: int
    }
    cli:
    {
      degraded_causes:
      {
        stale: int
      }
      discovery_count: int,
      dropped_sample:
      [{
          archived: bool,
          description: string[167],
          drop_reasons:
          [
            ...
          ]
          fit_rationale: string,
          fit_score: int,
          full_name: string,
          license: string,
          provenance: string,
          pushed_at: string,
          stars: int,
          updated_at: string,
          url: url
        }] (2)
      kept:
      [{
          archived: bool,
          description: string[171],
          fit_rationale: string,
          fit_score: int,
          full_name: string,
          license: string,
          provenance: string,
          pushed_at: string,
          stars: int,
          updated_at: string,
          url: url
        }] (3)
      keyword: string,
      lane_status: string,
      queries_used:
      [string] (3)
      threshold: int
    }
    frontend:
    {
      degraded_causes:
      {
        license: int,
        stale: int
      }
      discovery_count: int,
      dropped_sample:
      [{
          archived: bool,
          description: string[107],
          drop_reasons:
          [
            ...
          ]
          fit_rationale: string[54],
          fit_score: int,
          full_name: string,
          license: string,
          provenance: string,
          pushed_at: string,
          stars: int,
          updated_at: string,
          url: string[59]
        }] (4)
      kept:
      []
      keyword: string,
      lane_status: string,
      queries_used:
      [
        string
      ]
      threshold: int
    }
    game:
    {
      degraded_causes:
      {
        archived: int,
        license: int,
        stale: int
      }
      discovery_count: int,
      dropped_sample:
      [{
          archived: bool,
          description: string[138],
          drop_reasons:
          [
            ...
          ]
          fit_rationale: string,
          fit_score: int,
          full_name: string,
          license: string,
          provenance: string,
          pushed_at: string,
          stars: int,
          updated_at: string,
          url: string[51]
        }] (10)
      kept:
      [{
          archived: bool,
          description: string[138],
          fit_rationale: string,
          fit_score: int,
          full_name: string,
          license: string,
          provenance: string,
          pushed_at: string,
          stars: int,
          updated_at: string,
          url: string[54]
        }] (4)
      keyword: string,
      lane_status: string,
      queries_used:
      [
        string
      ]
      threshold: int
    }
  }
  mode: string,
  provenance_policy:
  [
    string
  ]
  slug: string,
  top_improvement:
  [{
      archived: bool,
      description: string[126],
      fit_rationale: string[53],
      fit_score: int,
      full_name: string,
      lane: string,
      license: date?,
      proposal_type: string,
      provenance: string,
      pushed_at: string,
      stars: int,
      updated_at: string,
      url: string[69]
    }] (3)
  top_new:
  [{
      archived: bool,
      description: string[171],
      fit_rationale: string,
      fit_score: int,
      full_name: string,
      lane: string,
      license: string,
      proposal_type: string,
      provenance: string,
      pushed_at: string,
      stars: int,
      updated_at: string,
      url: url
    }] (3)
}

## CLI spotlight (compact)
- guarinogabriel/Mac-CLI | stars=9062 | license=mit | pushed_at=2026-02-28T02:21:48Z
- abhixdd/ghgrab | stars=825 | license=mit | pushed_at=2026-04-23T14:16:19Z
- gaetanlhf/EXPOSE | stars=269 | license=agpl-3.0 | pushed_at=2025-08-28T18:19:47Z
