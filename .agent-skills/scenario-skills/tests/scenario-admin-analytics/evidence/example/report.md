# Synthetic analytics example

2026-06-01T00:00:00Z inclusive to 2026-08-31T23:59:59.999Z inclusive, UTC.

Retrieved 2026-09-01T09:00:00Z. Source: Scenario MCP usage.

Consumed CU: **39,000.00 CU**. Model activity: **594 jobs**, **4 models**.

Model CU: 40,500.00. Model minus overall CU: +1,500.00 (separate measures).

## Models

| Model         | CU        | Jobs | API-key CU (subset) |
| ------------- | --------- | ---- | ------------------- |
| Video model B | 18,900.00 | 90   | 0.00                |
| Image model A | 12,600.00 | 420  | 3,600.00            |
| 3D model C    | 7,200.00  | 24   | 0.00                |
| Audio model D | 1,800.00  | 60   | 900.00              |

## Identities, full period

| Identity   | Type         | CU        |
| ---------- | ------------ | --------- |
| Artist 01  | Human        | 23,500.00 |
| Artist 02  | Human        | 11,000.00 |
| Automation | API identity | 4,500.00  |

## Top 5 models per identity, by CU

| Identity   | Type         | Rank | Model         | CU    | Jobs |
| ---------- | ------------ | ---- | ------------- | ----- | ---- |
| Automation | API identity | 1    | Image model A | 3600  | 120  |
| Automation | API identity | 2    | Audio model D | 900   | 30   |
| Artist 01  | Human        | 1    | Video model B | 12600 | 60   |
| Artist 01  | Human        | 2    | Image model A | 7500  | 250  |
| Artist 01  | Human        | 3    | 3D model C    | 3600  | 12   |
| Artist 01  | Human        | 4    | Audio model D | 600   | 20   |
| Artist 02  | Human        | 1    | Video model B | 6300  | 30   |
| Artist 02  | Human        | 2    | 3D model C    | 3600  | 12   |
| Artist 02  | Human        | 3    | Image model A | 1500  | 50   |
| Artist 02  | Human        | 4    | Audio model D | 300   | 10   |

## Top 5 identities for the top 10 models, by CU

| Model         | Rank | Identity   | Type         | CU    | Jobs |
| ------------- | ---- | ---------- | ------------ | ----- | ---- |
| Video model B | 1    | Artist 01  | Human        | 12600 | 60   |
| Video model B | 2    | Artist 02  | Human        | 6300  | 30   |
| Image model A | 1    | Artist 01  | Human        | 7500  | 250  |
| Image model A | 2    | Automation | API identity | 3600  | 120  |
| Image model A | 3    | Artist 02  | Human        | 1500  | 50   |
| 3D model C    | 1    | Artist 01  | Human        | 3600  | 12   |
| 3D model C    | 2    | Artist 02  | Human        | 3600  | 12   |
| Audio model D | 1    | Automation | API identity | 900   | 30   |
| Audio model D | 2    | Artist 01  | Human        | 600   | 20   |
| Audio model D | 3    | Artist 02  | Human        | 300   | 10   |

## Coverage and interpretation

- Scope and dates match the MCP request; access is limited to the connected credential.
- Consumed CU is after discounts. Model CU measures generation activity; the difference from overall
  consumption is not allocated to models.
- CU and job counts measure usage, not productivity, ROI, seat activation, or time saved.
- Overall and identity consumption cover the original full period. Model filters apply to generation
  activity only.
- Per-user usage queries reconcile to every model's CU, API-key CU and job count.
