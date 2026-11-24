# Scanner User-Agent

An authorized assessment can opt in to a stable ARTEX User-Agent on supported target HTTP requests. A security operations center (SOC), incident response team (IR), or computer incident response team (CIRT) can search for that label in web application firewall (WAF) logs and correlate candidate events with an approved assessment record.

## Configure a task

Add `task_user_agents` to the active ARTEX `config.json`, keeping the rest of your configuration. Each key is an existing task ID written as a positive decimal integer without leading zeros. Each task entry needs a nonempty `origins` list of exact approved HTTP or HTTPS origins. Use the scheme and host, with a port when needed. List each origin explicitly and leave out wildcards, paths, queries, fragments, and credentials. ARTEX matches the URL by scheme, host, and port. Host letter case and an explicitly written default port are treated as equivalent.

Omit `reference` or use an empty string for the base label. A public reference may contain 1–64 ASCII letters, digits, dots, underscores, or hyphens. ARTEX validates this setting at startup and rejects an invalid file. Restart after editing. Remove the task's entry to disable its label.

At startup, ARTEX logs a warning and ignores entries with no live task in the database. They stay off for that process even if a task later receives the ID or is restored. Restart with the task present in the database to apply its entry.

If your configuration has the pre-release key `assessment_identification`, move its entries to `task_user_agents` as shown below. Each entry needs an `origins` list. Remove the old key before restarting.

```json
{
  "task_user_agents": {
    "123": {
      "origins": ["https://shop.example.test"],
      "reference": "FS-17"
    },
    "456": {
      "origins": ["http://status.example.test:8080"]
    }
  }
}
```

On their listed origins, task `123` uses `ARTEX-Assessment/1.0 (engagement=FS-17)` and task `456` uses `ARTEX-Assessment/1.0`. Use a reference that both teams can share and that is safe for the receiving service, intermediaries, and their logs. Keep credentials, personal data, and confidential ticket numbers in the private engagement record. See the configuration file search order in the [operations guide](OPS.md#2-configuration-precedence).

## Phase 1 coverage

The first phase covers ARTEX HTTP custom-tool requests with a matching live task ID and a listed destination origin. It also covers the HTTP enrichment probe if called with that task context for a listed origin. The current production code has no caller that enqueues this probe. Chat requests and editor tests use their normal User-Agent behavior.

The origin list also applies with the target gate or noise profile off. Check the approved scope and origin list before enabling the label. The HTTP custom tool retains the generated label while a redirect chain stays on its initial origin. A change of origin removes the label for the rest of the chain, even if the next origin is listed. When enabled, the target gate evaluates each hop under its existing rules. The enrichment probe stops at redirects. Capture can help inspect the request where the route supports it.

The HTTP custom tool's existing explicit User-Agent setting takes precedence over the assessment label, including an explicitly empty value. With a noise profile active, a configured `ARTEX_TARGET_USER_AGENT` can still fill an empty value. See [configuration precedence](OPS.md#2-configuration-precedence).

WebFetch uses the Norma client's own User-Agent. Shell and external tools, browser traffic, model and search providers, MCP, and management calls sit outside this phase.

### Manual replay

Manual replay can resend an operator-selected assessment label from a capture even after the URL is edited. Review the destination and headers before sending and remove the label when it is inappropriate for that destination. Automatic label generation applies only to the task request paths above. [Replay behavior](traffic-rewrite-rules.md#replay)

Phase 1 acceptance uses local HTTP receivers to verify the exact wire value for each covered client, with the noise profile on and off and with direct and recorded routes where supported. Include unconfigured tasks, empty references, explicit User-Agents, listed and unlisted destinations, redirects, and requests without a matching task context. Check that a task ID missing at startup stays disabled for that process, generated labels stay within their configured task and origins, and manual replay sends the selected User-Agent without generating an assessment label.

## WAF triage for SOC, IR, and CIRT

1. Before testing, record the approved assets, UTC time window, permitted activity, and public reference. Share those details and the escalation contact with the defenders through the agreed channel. Treat the label as an optional field in the assessment record.
2. During triage, search for the exact User-Agent or engagement reference where the logger retains it. Check the timestamp, host, method, path, source IP, WAF action, rule ID, and request ID where available. Confirm which fields are retained and if they are redacted in your WAF. [AWS WAF field reference](https://docs.aws.amazon.com/waf/latest/developerguide/logging-fields.html)
3. Join the candidate events to the approved scope and UTC window. Corroborate individual events with evidence such as defender-issued request IDs and the operator's approved run record. Continue standard investigation for events with missing or conflicting evidence. Keep blocked and challenged requests visible for validation.

The User-Agent is self-declared metadata. Verify the engagement independently and leave authorization, authentication, WAF enforcement, alerting, and escalation decisions to the existing controls. A matching header alone cannot establish who sent a request or justify an allowlist entry.

## HackerOne reporting

1. Check the program's security page and the specific asset's scope and testing requirements. If the program specifies an exact User-Agent or another identification header, put that required header in the HTTP custom tool's request headers and check the effective value. Use the stable ARTEX label when the program permits it. [HackerOne security page guide](https://docs.hackerone.com/en/articles/8490833-security-page)
2. Submit through the program's report form and select the affected asset. Include the issue and impact, and add the exact identification value, UTC timestamps, safe request IDs, and sanitized request evidence where helpful. Share only the data the program needs to locate and validate the events. [HackerOne report submission guide](https://docs.hackerone.com/en/articles/8473994-submitting-reports)
3. Use the report thread for correlation questions and follow the program's instructions for any retest. [HackerOne post-submission guide](https://docs.hackerone.com/en/articles/15518592-post-submission-guide)

## Offline WAF log exercise

Use the rows below as a tabletop exercise. They represent fictional WAF records, with reserved TEST-NET addresses. No requests are sent. `assessment` abbreviates `ARTEX-Assessment/1.0 (engagement=FS-17)`, and `—` means the log has no User-Agent value for that event. [RFC 5737](https://www.rfc-editor.org/rfc/rfc5737.html)

The approved record for `FS-17` covers `shop.example.test` from `10:00` inclusive to `10:30` exclusive UTC on the same exercise day. The synthetic run record independently links defender-issued request IDs `W01`, `W02`, and `W03` to that window, host, and reference. Those three events are the exercise's known positives.

| Request ID | UTC time | Host | Source IP | User-Agent | WAF action |
| --- | --- | --- | --- | --- | --- |
| W01 | 10:03 | `shop.example.test` | `192.0.2.10` | assessment | Allow |
| W02 | 10:07 | `shop.example.test` | `198.51.100.24` | assessment | Block |
| W03 | 10:11 | `shop.example.test` | `198.51.100.24` | — | Challenge |
| W04 | 10:14 | `shop.example.test` | `203.0.113.9` | assessment | Block |
| W05 | 10:17 | `status.example.test` | `192.0.2.10` | assessment | Allow |
| W06 | 10:37 | `shop.example.test` | `192.0.2.10` | assessment | Block |
| W07 | 10:18 | `shop.example.test` | `203.0.113.9` | `ExampleClient/1.0` | Allow |

| Filter | Expected IDs | Compared with the known positives |
| --- | --- | --- |
| Exact User-Agent only | W01, W02, W04, W05, W06 | 2 matches, 3 false positives, 1 missed event |
| User-Agent, approved host, and UTC window | W01, W02, W04 | 2 matches, 1 false positive, 1 missed event |
| Run-record request IDs, approved host, and UTC window | W01, W02, W03 | 3 matches, 0 false positives, 0 missed events in this fixture |

`W04` still needs normal triage after the host and window filter. `W03` is recoverable through the request ID in the approved run record even though its User-Agent is missing from the log. The final join uses independent records already available in the exercise. In production, missing request IDs or incomplete records can leave the result unresolved.

## Phase 2 proposal for attributable proxy traffic

Revisit the capture-proxy route separately once it can bind each eligible shell request to a trusted task context and verify the destination against that task's approved scope. Internal attribution metadata should remain inside ARTEX. Apply the stable label once and define its precedence alongside existing proxy rewrite rules.

Before release, verify the header and scope decisions at local receivers for HTTP and intercepted HTTPS. Test same-scope and cross-scope redirects, concurrent tasks, unmarked traffic, direct shell paths, capture disabled, and replay. Include a built-in request already labelled in Phase 1 and verify that the proxy adds neither a second label nor task metadata on the wire. Document the verified routes and how an operator can inspect the outcome.
