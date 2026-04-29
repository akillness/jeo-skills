# RTK Summary

## Compact structure (rtk json --keys-only)
{
  chosen_candidate:
  {
    archived: bool,
    description: string[126],
    fit_rationale: string,
    full_name: string,
    lane: string,
    license: date?,
    provenance: string,
    pushed_at: string,
    query: string,
    reasons:
    []
    stars: int,
    url: string[69]
  }
  generated_at: string,
  kept_total: int,
  keyword_families:
  [string] (5)
  lanes:
  {
    agentic ai skill:
    {
      degraded_causes:
      []
      kept:
      [{
          archived: bool,
          description: string[126],
          fit_rationale: string,
          full_name: string,
          lane: string,
          license: date?,
          provenance: string,
          pushed_at: string,
          query: string,
          reasons:
          []
          stars: int,
          url: string[69]
        }] (2)
      kept_count: int,
      lane_status: string,
      median_stars_raw: float,
      query_transcript:
      {
        primary_cmd: string[114],
        primary_exit_code: int,
        primary_query: string,
        primary_result_count: int,
        stderr: string
      }
      raw_count: int,
      rejected_sample:
      [{
          archived: bool,
          description: string,
          fit_rationale: string,
          full_name: string,
          lane: string,
          license: string,
          provenance: string,
          pushed_at: string,
          query: string,
          reasons:
          [
            ...
          ]
          stars: int,
          url: url
        }] (12)
      zero_star_raw: int
    }
    cli open source skill:
    {
      degraded_causes:
      []
      kept:
      []
      kept_count: int,
      lane_status: string,
      median_stars_raw: float,
      query_transcript:
      {
        primary_cmd: string[119],
        primary_exit_code: int,
        primary_query: string,
        primary_result_count: int,
        stderr: string
      }
      raw_count: int,
      rejected_sample:
      []
      zero_star_raw: int
    }
    game development skill:
    {
      degraded_causes:
      []
      kept:
      [
        {
          archived: bool,
          description: string[138],
          fit_rationale: string[56],
          full_name: string,
          lane: string,
          license: string,
          provenance: string,
          pushed_at: string,
          query: string,
          reasons:
          []
          stars: int,
          url: string[54]
        }
      ]
      kept_count: int,
      lane_status: string,
      median_stars_raw: float,
      query_transcript:
      {
        primary_cmd: string[120],
        primary_exit_code: int,
        primary_query: string,
        primary_result_count: int,
        stderr: string
      }
      raw_count: int,
      rejected_sample:
      [{
          archived: bool,
          description: string[138],
          fit_rationale: string[56],
          full_name: string,
          lane: string,
          license: string,
          provenance: string,
          pushed_at: string,
          query: string,
          reasons:
          [
            ...
          ]
          stars: int,
          url: string[51]
        }] (12)
      zero_star_raw: int
    }
    web backend skill:
    {
      degraded_causes:
      []
      kept:
      []
      kept_count: int,
      lane_status: string,
      median_stars_raw: float,
      query_transcript:
      {
        primary_cmd: string[115],
        primary_exit_code: int,
        primary_query: string,
        primary_result_count: int,
        stderr: string
      }
      raw_count: int,
      rejected_sample:
      []
      zero_star_raw: int
    }
    web frontend skill:
    {
      degraded_causes:
      [string] (3)
      kept:
      []
      kept_count: int,
      lane_status: string,
      median_stars_raw: float,
      query_transcript:
      {
        primary_cmd: string[116],
        primary_exit_code: int,
        primary_query: string,
        primary_result_count: int,
        stderr: string
      }
      raw_count: int,
      rejected_sample:
      [{
          archived: bool,
          description: string[107],
          fit_rationale: string[52],
          full_name: string,
          lane: string,
          license: string,
          provenance: string,
          pushed_at: string,
          query: string,
          reasons:
          [
            ...
          ]
          stars: int,
          url: string[59]
        }] (4)
      zero_star_raw: int
    }
  }
  mode: string,
  provenance_labels:
  [string] (2)
  recommended_lane_count: int,
  run_slug: string,
  single_lane_concentration: bool
}
