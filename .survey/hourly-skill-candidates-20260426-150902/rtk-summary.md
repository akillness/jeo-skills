Data code (973 lines)
General purpose code file


## Lane metrics (RTK JSON keys)
{
  evidence:
  [{
      candidate:
      {
        archived: bool,
        description: string[126],
        full_name: string,
        license: null,
        pushed_at: string,
        stars: int,
        updated_at: string,
        url: string[69]
      }
      lane: string,
      phase: string,
      provenance: string,
      query: string
    }] (36)
  generated_at: string,
  lanes:
  [{
      degraded_causes:
      {
        license: int
      }
      kept:
      []
      kept_count: int,
      lane: string,
      lane_status: string,
      median_stars_raw: int,
      raw_count: int,
      raw_top:
      [{
          archived: bool,
          description: string[72],
          full_name: string,
          license: null,
          pushed_at: string,
          stars: int,
          updated_at: string,
          url: url
        }] (8)
      searched:
      [{
          phase: string,
          query: string
        }] (2)
      stage2_used: bool,
      zero_star_raw: int
    }] (5)
  mode: string,
  provenance: string,
  recommended_lane_count: int,
  run_slug: string,
  single_lane_concentration: bool
}
