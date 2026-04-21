# Solution Landscape: pattern-detection modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| ripgrep | Fast text/regex search | Cheap first pass, ubiquitous in dev workflow | Line-oriented by default, brittle for structural detection | https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md |
| ast-grep | AST-aware structural search/rules | Better than plain regex for repeated code patterns | Code-focused, not a general anomaly platform | https://ast-grep.github.io/guide/introduction.html |
| Semgrep | Pattern-based code scanning | Reusable rule packs, code-aware syntax | False-positive tuning still matters | https://semgrep.dev/docs/writing-rules/pattern-syntax |
| CodeQL | Query-based variant analysis | Strong for reusable code/security pattern detection | Heavyweight compared with quick grep-like checks | https://codeql.github.com/docs/codeql-overview/about-codeql/ |
| Sigma / YARA | Portable rule/signature layers | Familiar portable rule mental model | Signature/rule upkeep burden | https://sigmahq.io/docs/basics/rules.html ; https://virustotal.github.io/yara/ |
| Datadog / OpenSearch / similar observability tools | Log/event parsing + anomaly dashboards | Native ops workflow and alerting surfaces | Often dashboard/triage-heavy, regex/grok burden remains | https://docs.datadoghq.com/logs/guide/regex_log_parsing/ ; https://docs.opensearch.org/latest/observing-your-data/ad/dashboards-anomaly-detection/ |
| pandas / SciPy / scikit-learn | Custom notebook/statistical anomaly checks | Flexible for baselines, z-scores, outliers, seasonality experiments | Requires manual method choice and explanation discipline | https://pandas.pydata.org/docs/ ; https://docs.scipy.org/doc/scipy/reference/stats.html ; https://scikit-learn.org/stable/modules/outlier_detection.html |
| Monte Carlo SQL detectors / warehouse SQL | SQL-native metric anomaly checks | Uses existing warehouse/query workflow | Custom thresholds and maintenance burden | https://www.montecarlodata.com/blog-how-to-build-your-own-data-anomaly-detectors-using-sql/ |
| Power BI / BI anomaly visuals | Built-in anomaly surfacing for analysts | Good for analyst-facing exploration | Not a full pattern-hunting workflow by itself | https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualization-anomaly-detection |
| AWS Lookout for Metrics + game telemetry stacks | Managed metric anomaly detection | Helpful for telemetry-heavy ops and gaming data | Platform-specific and downstream of instrumentation quality | https://aws.amazon.com/blogs/gametech/detect-game-anomalies-amazon-lookout-for-metrics-game-analytics-pipeline/ |

## Categories
- **Text / regex prefilter:** ripgrep, grok parsing, Sigma, YARA
- **Structural code-pattern scanning:** ast-grep, Semgrep, CodeQL
- **Observability / log anomaly surfaces:** Datadog, OpenSearch, SIEM / monitoring stacks
- **Notebook / statistics / custom analysis:** pandas, SciPy, scikit-learn
- **Warehouse / BI anomaly workflows:** SQL detectors, Power BI, Sheets/exports-driven analysis
- **Game / telemetry-specific stacks:** AWS GameTech / Lookout, PlayFab, GameAnalytics, dashboard pipelines

## What People Actually Use
In practice, teams rarely use one universal "pattern detection" tool. They mix a cheap first-pass method with a domain-specific escalation path:
- regex / grep for quick filters
- structural scanners for repeated code or security rules
- SQL + dashboards + exports for KPI drift
- observability dashboards for log/event anomalies
- telemetry and BI stacks for game/product anomaly review

## Frequency Ranking
1. Regex / search / grok style filtering
2. Structural code scanning (Semgrep / CodeQL / ast-grep)
3. Dashboard-native observability anomaly workflows
4. SQL / warehouse anomaly checks
5. Notebook/statistical outlier analysis
6. BI-native anomaly visuals
7. Game-specific telemetry anomaly platforms

## Key Gaps
- Most solutions are lane-specific; users still need help choosing the right detection mode first.
- False-positive handling and confidence labeling remain recurring pain points.
- Many tools surface anomalies without helping frame trust level, grouping drift, or next handoff.
- Game/product telemetry and business-metric anomaly workflows still depend heavily on instrumentation quality and manual segmentation.

## Contradictions
- Marketed promise: anomaly tools automate detection end-to-end.
- User reality: teams still fall back to SQL, regex, dashboards, spreadsheets, and manual drill-down.

- Marketed promise: code-pattern tools reduce noise automatically.
- User reality: false-positive tuning and structural boundary choices still decide whether teams trust the output.

## Key Insight
The strongest modernization path is not to make `pattern-detection` a giant generic scanning skill. It should become a mode-selecting router for repeated pattern/rule/anomaly hunting: choose between text prefilter, structural code rules, log/event patterning, or metric anomaly detection; force confidence and false-positive notes; then route dashboard-building, deep dataset explanation, raw log triage, or security hardening to adjacent specialist skills.
