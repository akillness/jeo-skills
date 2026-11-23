# Deliberate bugs in Tiny Todo (spoilers)

The demo app ships with 11 known bugs so you can score your agents. Run the
testers, read `SUMMARY.md`, and count how many of these they report.

| # | Screen | Bug | Who should catch it |
|---|---|---|---|
| 1 | Sign-up | Email check rejects `+`, capitals and sub-domains (`name+tag@mail.example.com`) | Everyone using a `+` test address |
| 2 | Sign-up | Error message is "Something went wrong" whatever the problem | Everyone who hits bug 1 or 3 |
| 3 | Sign-up | 8-character password rule is never shown before failing | Impatient personas |
| 4 | Sign-up | Keyboard hides "Continue" on small iPhones (no keyboard avoidance) | iPhone SE persona |
| 5 | Home | Search is case-sensitive: "Apples" finds nothing, "apples" finds "Buy apples" | Personas who search |
| 6 | Home | Empty tasks can be added | Personas who try odd inputs |
| 7 | Home | Header has a fixed height: cut with large text sizes | Large-text personas |
| 8 | Home | "1 tasks" | Detail-oriented personas |
| 9 | Home | No empty state (empty list or no search result = blank screen) | Personas who delete everything or search |
| 10 | Home | Task text is hard-coded dark grey: unreadable in dark mode | Dark-mode personas |
| 11 | Home | Delete target is a 12-pt "x", no confirmation, no undo | Everyone with fingers |

Gray labels (`#888`) on a light background are also low-contrast: a bonus
finding for accessibility-minded personas.
