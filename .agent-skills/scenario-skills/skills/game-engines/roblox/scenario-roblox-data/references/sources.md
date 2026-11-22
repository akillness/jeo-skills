# Sources

Retrieved or watched in October 2026. Credentials are as the sources present them; "unverified"
means no independent check.

## Code

| Source               | What                                                                                                                                           | URL                                             | Best for                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| loleris (MAD STUDIO) | ProfileStore, pinned commit 45c9847cbcf1fc260369c50eb335aba7c35aecdd, SHA-256 ad43737203688b8e88cab34ebe8c483000c157e53bfb41e35f1b49ee89d0c95f | https://github.com/MadStudioRoblox/ProfileStore | session locks, constants, release channels, Mock |

## Documentation

| Source                          | URL                                                                                      | Best for                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| ProfileStore docs (loleris)     | https://madstudioroblox.github.io/ProfileStore/                                          | API, troubleshooting, trading, Studio Mock       |
| Data stores overview            | https://create.roblox.com/docs/cloud-services/data-stores                                | Studio access setting                            |
| Data store best practices       | https://create.roblox.com/docs/cloud-services/data-stores/best-practices                 | failed writes, retries, key design               |
| Error codes and limits          | https://create.roblox.com/docs/cloud-services/data-stores/error-codes-and-limits         | 2026 budgets, throughput, storage, error codes   |
| Versioning, listing and caching | https://create.roblox.com/docs/cloud-services/data-stores/versioning-listing-and-caching | 4 s cache, hourly versions, snapshots            |
| Player data and purchasing      | https://create.roblox.com/docs/cloud-services/data-stores/player-data-purchasing         | ordered retries, session locks, receipts         |
| Right to be forgotten           | https://create.roblox.com/docs/cloud-services/data-stores/right-to-be-forgotten          | key templates with `{UserId}`                    |
| Data Stores Manager             | https://create.roblox.com/docs/cloud-services/data-stores/data-stores-manager            | browsing keys, storage, restore                  |
| Observability                   | https://create.roblox.com/docs/cloud-services/data-stores/observability                  | request and throttle charts                      |
| Memory store best practices     | https://create.roblox.com/docs/cloud-services/memory-stores/best-practices               | partitions, sharding, expiry                     |
| Cross-server messaging          | https://create.roblox.com/docs/cloud-services/cross-server-messaging                     | topics, size, delivery                           |
| Teleport between places         | https://create.roblox.com/docs/projects/teleport                                         | TeleportOptions, failures, Access Control        |
| Update games                    | https://create.roblox.com/docs/projects/update-games                                     | restarting outdated servers                      |
| Developer Products              | https://create.roblox.com/docs/production/monetization/developer-products                | creating products, ProcessReceipt                |
| Paid random items               | https://create.roblox.com/docs/production/monetization/paid-random-items                 | per-player policy, blocking trades of paid items |
| PolicyService reference         | https://create.roblox.com/docs/reference/engine/classes/PolicyService                    | `IsPaidItemTradingAllowed`, errors               |
| Automate right to erasure       | https://create.roblox.com/docs/cloud/webhooks/automate-right-to-erasure                  | custom deletion when templates cannot match      |

## Videos

| Expert                               | Credential                                                         | URL                                         | Best for                                                   | Best timestamps                                  |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| Suphi Kaner                          | author of Suphi's DataStore Module (partisan comparison)           | https://www.youtube.com/watch?v=ARPfIt16sXI | why session locks matter, UpdateAsync myth, lock expiry    | 00:04:43, 00:10:48, 00:15:36, 00:23:51, 00:25:30 |
| Rileybytes                           | Roblox educator (unverified)                                       | https://www.youtube.com/watch?v=8FIj3gmP5Ls | Developer Products with ProfileStore, saved-before-granted | 00:14:23, 00:16:24, 00:16:55, 00:25:08, 00:29:08 |
| Rileybytes                           | as above                                                           | https://www.youtube.com/watch?v=m2SP_TLeWHI | ProfileStore setup, test store name, session end           | 00:05:39, 00:08:04, 00:09:09, 00:13:43, 00:18:53 |
| MonzterDEV                           | Roblox scripter and educator (unverified)                          | https://www.youtube.com/watch?v=evBhoqeYegQ | ProfileStore service, Cancel, store reset                  | 00:01:52, 00:07:17, 00:10:13                     |
| Possible Panda                       | tutorial creator                                                   | https://www.youtube.com/watch?v=0rmh0FpHBYM | kick on failure, AddUserId, left-early guard               | 00:06:38, 00:07:27, 00:09:25                     |
| BrawlDev                             | tutorial creator scripting since 2016                              | https://www.youtube.com/watch?v=vNsAGifGCvA | TeleportAsync tables, teleport data limits                 | 00:10:40, 00:26:40                               |
| BrawlDev                             | as above                                                           | https://www.youtube.com/watch?v=GfKYmecLVn4 | OrderedDataStore leaderboards                              | 00:07:47                                         |
| Paul1Rb                              | Roblox educator (unverified)                                       | https://www.youtube.com/watch?v=ytuwR-toxBc | TeleportOptions, passing JobIds                            | 00:03:46, 00:06:00                               |
| TextChanged                          | tutorial creator                                                   | https://www.youtube.com/watch?v=NUbjcGDlSLM | cross-server matchmaking, error 773 in multi-client tests  | 00:17:04                                         |
| CJ_Oyer (Connect 2023, Roblox Learn) | independent developer, Roblox Accelerator alumnus (self-described) | https://www.youtube.com/watch?v=gapG2tH-etI | publishing all places together                             | 00:27:33                                         |

Reviewed and used only as anti-pattern baselines: BrawlDev DataStore basics (TIZ3qsCX5S0), Ludius
DataStore intro (1m29JsZ6oPs), Paul1Rb ProfileService (AZ5sOz5RM3w), XTB7 MemoryStore (EpF5oWNS-Pk),
Stewiepfing MessagingService (M2XbROd-lHE), Leif DataService (YSNAFlRF96o), Reactive Dev party queue
(-uCM10NZrvU), PrizeCP multi-place (V2iMbyidODo).
