# RTK Summary

## Token-optimized stats
```
1224L 3624W 46466B
```

## Top-level keys
```
{
  generated_at: string,
  kept_candidates:
  [{
      archived: bool,
      description: string[171],
      fit_rationale: string[74],
      license: string,
      metadata_gate:
      {
        license_present: bool,
        not_archived: bool,
        recent_activity: bool,
        score: int
      }
      provenance:
      {
        command: string[101],
        label: string,
        method: string
      }
      pushed_at: string,
      query: string,
      repo: string,
      stars: int,
      updated_at: string,
      url: url
    }] (25)
  policy:
  {
    metadata_minimum:
    [string] (4)
    provenance: string,
    required_queries:
    [string] (5)
  }
  raw_results:
  {
    agentic ai skill:
    [{
        description: string[126],
        fullName: string,
        isArchived: bool,
        license:
        {
          key: date?,
          name: string,
          url: url
        }
        pushedAt: string,
        stargazersCount: int,
        updatedAt: string,
        url: string[69]
      }] (20)
    cli open source skill:
    []
    game development skill:
    [{
        description: string[138],
        fullName: string,
        isArchived: bool,
        license:
        {
          key: string,
          name: string,
          url: url
        }
        pushedAt: string,
        stargazersCount: int,
        updatedAt: string,
        url: string[51]
      }] (20)
    web backend skill:
    []
    web frontend skill:
    [{
        description: string[107],
        fullName: string,
        isArchived: bool,
        license:
        {
          key: string,
          name: string,
          url: string
        }
        pushedAt: string,
        stargazersCount: int,
        updatedAt: string,
        url: string[59]
      }] (4)
  }
  seed_recovery:
  [{
      lane: string,
      results: int,
      seed_query: string
    }] (2)
}
```

## Run highlights
- required_queries: 5
- kept_candidates: 25
- seed_recovery_lanes: 2
- top_candidates: LeCoupa/awesome-cheatsheets, cli/cli, payloadcms/payload, vuejs/vue-cli, angular/angular-cli
