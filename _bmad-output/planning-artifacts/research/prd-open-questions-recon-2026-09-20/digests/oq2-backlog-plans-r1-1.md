# OQ2 digest: Backlog plans (2027-01-01) vs estimated/actual hours + API (round 1, researcher 1)

Accessed: 2026-09-20. Public web only. Evidence retrieved this run; anything not evidenced is labelled.

Questions owned:
- Q1. New plan lineup effective 2027-01-01: names, prices, limits, feature matrix (予定時間/実績時間, 工数管理, ガント, 横断ガント, バーンダウン, API, カスタム属性).
- Q2. Current (pre-2027) matrix; old-to-new mapping; transition/grandfathering.
- Q3. API availability per plan; do estimatedHours/actualHours come back regardless of plan; rate limits; 2025-2026 API changes (worklog endpoints?).
- Q4. 2026 announcements about moving hours features; user reactions.

## Plan-by-feature table (new plans, effective 2027-01-01)

Primary source for every cell unless noted: official PDF "new-plans-2027.pdf", https://backlog.com/ja/service-document/new-plans-2027.pdf (Nulab; linked from the official "現在のプランと新しいプランの機能比較" help-center page). I read the rendered pages directly.

| Row | Economy | Business | Professional | Source |
|---|---|---|---|---|
| Monthly billing (JPY, excl. tax) | ¥21,000 | ¥36,300 | ¥100,000 | PDF p1 |
| Annual billing (5% off) | ¥19,950/mo (¥239,400/yr) | ¥34,485/mo (¥413,820/yr) | ¥95,000/mo (¥1,140,000/yr) | PDF p1 |
| Users | 15 | Unlimited (10,000 recommended max) | Unlimited (10,000 recommended max) | PDF p1 |
| Projects | 30 | Unlimited | Unlimited | PDF p1 |
| Storage | 30GB | 100GB | 300GB (+ paid option) | PDF p1 |
| 予定時間 / 実績時間 (estimated/actual hours) | **No row in the matrix** | no row | no row | PDF p1-2 (absent) |
| 工数管理 | No row | no row | no row | PDF (absent) |
| 親子課題 (parent/child issues) | yes | yes | yes | PDF p1 |
| 孫課題, 3 levels (NEW, summer 2026) | no | yes | yes | PDF p1 |
| Burndown chart | yes | yes | yes | PDF p1 |
| Gantt chart | yes | yes | yes | PDF p1 |
| Gantt, long-range display | no | yes | yes | PDF p1 |
| Cross-project Gantt (NEW, fall 2026) | no | yes | yes | PDF p1 |
| Custom attributes (カスタム属性) | no | yes | yes | PDF p1 |
| Backlog AI Assistant (free quota / paid extra) | no | yes (capped / paid) | yes (capped / paid) | PDF p1 |
| Nulab Flowbase (free quota) | no | yes (capped) | yes (capped) | PDF p1 |
| Webhook | yes | yes | yes | PDF p2 |
| **API** | **yes** | **yes** | **yes** | PDF p2 |
| SAML / audit log / provisioning | no | via Nulab Pass | via Nulab Pass | PDF p2 |

The PDF only covers Economy, Business and Professional. It does not show Free or Enterprise. From the official blog: the Free plan continues, but its user cap drops from 10 to 5. Enterprise keeps its features and gets new pricing.

## Current (pre-2027) matrix (for comparison)

Source: https://backlog.com/ja/pricing/ (Nulab, current page, which carries the banner "※2027年1月1日からプランが変わります")

| Row | Free | Starter | Standard | Premium | Platinum |
|---|---|---|---|---|---|
| Monthly price | ¥0 | ¥2,700 | ¥16,000 | ¥27,000 | ¥75,000 |
| Users | 10 (1 project) | 30 | Unlimited* | Unlimited* | Unlimited* |
| 開始日/予定時間/実績時間 | no (inferred: "Standard and above" rule) | **no** | yes | yes | yes |
| Gantt | not stated | no | yes (6-month range) | yes | yes |
| Burndown | not stated | no | yes | yes | yes |
| Custom attributes | not stated | no | no | yes | yes |
| API | not listed on page | not listed | not listed | not listed | not listed |

## Findings

Format: claim | source URL | publisher | pub_date | accessed | confidence | class

1. Nulab announced a Backlog plan revision on 2026-06-17, effective 2027-01-01. The current four paid plans become three: Economy, Business, Professional. | https://nulab.com/ja/info/backlog-plan-renewal/ ; https://backlog.com/ja/blog/new-plans-2027/ | Nulab | 2026-06-17 | 2026-09-20 | high | pricing
2. New prices (excl. tax): Economy ¥21,000/mo (¥19,950/mo on annual billing), Business ¥36,300 (¥34,485), Professional ¥100,000 (¥95,000). Economy is capped at 15 users and 30 projects. Business and Professional have unlimited users and projects. | new-plans-2027.pdf + blog | Nulab | 2026-06-17 | 2026-09-20 | high | pricing
3. 3-month and 6-month billing are discontinued. Bank-transfer customers move to annual billing only. Card customers keep monthly or annual. | nulab.com/ja/info/backlog-plan-renewal/ ; blog | Nulab | 2026-06-17 | 2026-09-20 | high | pricing
4. Transition: current plans accept new contracts until 2026-12-31. Existing contracts move to the new plan at their first renewal on or after 2027-01-01. In the blog's words: "2027年1月1日以降の最初の契約更新日に、新しいプランでの契約更新になります". | blog | Nulab | 2026-06-17 | 2026-09-20 | high | pricing
5. Old-to-new mapping. Standard with ≤15 users and ≤30 projects becomes Economy automatically. Standard above those limits must move to Business or Professional. Premium becomes Business. Platinum becomes Professional. Starter has no equivalent and needs manual action. Free stays Free, but the cap drops 10 to 5 users: existing 6-10 users keep access, but no new members can be added. Enterprise gets new pricing with unchanged features. Education/NPO keep the 50% discount. | blog; help-center comparison page (mapping Standard→Economy, Premium→Business, Platinum→Professional, Starter→none) | Nulab | 2026-06-17 (help page date not shown) | 2026-09-20 | high | pricing
6. The official new-plan feature matrix has **no row for 予定時間/実績時間 or 工数**. All three new plans include Gantt and burndown. Long-range Gantt, cross-project Gantt, custom attributes, 孫課題, AI Assistant and Flowbase are Business/Professional only. | new-plans-2027.pdf | Nulab | ~2026-06 | 2026-09-20 | high (for what the matrix shows) | feature
7. Today, 開始日, 予定時間 and 実績時間 are Standard-and-above attributes. The pricing page says "一部の課題の属性（開始日、予定時間、実績時間）はスタンダードプラン以上でご利用いただけます". So Starter and Free currently lack hours in the UI. | https://backlog.com/ja/pricing/ | Nulab | current page (undated) | 2026-09-20 | high | feature
8. INFERENCE, not directly evidenced: all three new paid plans probably expose 予定時間/実績時間 in the UI. Three reasons: (a) the lowest new plan, Economy, is the auto-migration target for Standard, which has hours today; (b) Economy includes Gantt and burndown, which are Standard-tier features today; (c) no source says hours move to a higher tier. Whether the new Free plan has hours is unknown. Today's Free plan lacks them under the Standard-and-above rule. | derived from 5, 6, 7 | - | - | 2026-09-20 | medium | feature
9. The API is marked available on Economy, Business and Professional. | new-plans-2027.pdf p2 | Nulab | ~2026-06 | 2026-09-20 | high | api
10. The issue object in the API docs includes `startDate`, `estimatedHours` and `actualHours`, shown as `null` in the example. The get-issue doc says nothing about plan gating. It is unknown whether Starter/Free spaces return null or omit the fields. | https://developer.nulab.com/ja/docs/backlog/api/2/get-issue/ | Nulab | undated | 2026-09-20 | high (fields exist); unknown (plan behaviour) | api
11. Rate limits are per user, per minute, and separate for four request types: read, update, search (issue/wiki list and count) and icon. The limit is shared across all of one user's API keys. The docs say the limits "上記の種別とプランによって異なります". Headers are X-RateLimit-Limit, -Remaining and -Reset. Exceeding the limit returns HTTP 429. | https://developer.nulab.com/ja/docs/backlog/rate-limit/ | Nulab | undated (example dated 2020-11) | 2026-09-20 | high | api
12. Documented values: paid plans get read 600/min, update 150/min, search 150/min and icon 60/min. The Free plan gets 60, 15, 15 and 6. Nulab may apply stricter limits temporarily when there are signs of an outage. `GET /api/v2/rateLimit` returns the live limits for the user. | https://backlog.com/ja/blog/backlog-api-rate-limit-announcement/ (2021-01-25); https://developer.nulab.com/ja/docs/backlog/api/2/get-rate-limit/ (example 600/150/150/60) | Nulab | 2021-01-25 | 2026-09-20 | high (values as of 2021, still shown in docs) | api
13. The API changelog lists no 2025-2026 entries for worklogs, time entries or hours. Recent entries: 2.113.3 (2025-09-11) removed deprecated group APIs. 2.117.1 (2025-12-24) added useSubversion/useGit/repository to notification and activity responses. 2.118.0-2.120.1 (2026-01-21 to 2026-03-31) added Document APIs: add, delete, comments, count and tags. The most recent entry, 2026-03-31, changed Document-delete permissions. | https://developer.nulab.com/ja/docs/backlog/changelog/ | Nulab | latest entry 2026-03-31 | 2026-09-20 | high | api
14. Neither the renewal announcement nor the blog mentions any change to API access or rate limits. | nulab.com/ja/info/backlog-plan-renewal/ ; blog | Nulab | 2026-06-17 | 2026-09-20 | medium (evidence of absence) | api
15. Trade press covered the renewal, e.g. @IT on 2026-07-24 ("Backlogが現行プラン廃止へ..."). The fetch summary of that article gave prices that contradict the official PDF, so I discarded them. | https://atmarkit.itmedia.co.jp/ait/articles/2607/24/news048.html | ITmedia | 2026-07-24 | 2026-09-20 | low (for details) | pricing

## Leads worth chasing

- support-ja.backlog.com per-plan migration articles. The Starter one is https://support-ja.backlog.com/hc/ja/articles/58584410096153 and the Enterprise one is .../58585222415257. Both returned HTTP 403 to WebFetch and curl. Try a browser or Wayback. The Starter article probably says what Starter spaces must do and whether hours data survives.
- The help-center page "現在のプランと新しいプランの機能比較" may include a Free-plan column or text beyond the PDF. Worth a browser read.
- Hands-on check: call `GET /api/v2/rateLimit` and `GET /api/v2/issues/:key` on a Free or Starter space to see how estimatedHours/actualHours behave (null vs absent), and whether the rate-limit numbers change for Economy after the migration.
- The "Backlog 課題の属性" help article (support-ja 360035642814) may state plan gating for 予定時間/実績時間 after 2027. It returned no content via curl.
- Whether Enterprise (on-prem/cloud) rate limits differ: not researched.

## Looked for but could not find

- An explicit 予定時間/実績時間 or 工数 row in the new-plan matrix. It is absent from both pages of the official PDF.
- Any statement on hours for the new Free plan. The PDF excludes Free, and the announcement and blog only mention its user cap.
- Per-plan rate-limit numbers for the new plans. There is no post-2021 announcement, and the docs only say the limits differ by plan.
- Any 2026 Nulab announcement moving 実績時間 to a higher tier. The official renewal pages, the blog and the API changelog contain nothing of the kind. User reactions: searched only incidentally, nothing specific about hours found.
- Worklog or time-entry API endpoints. None in the changelog through 2026-03-31.
- Official docs on whether the API returns hours fields on plans without the feature. The get-issue doc has no plan note.

## Verdict per question

- **Q1:** Three paid plans from 2027-01-01. Economy: ¥21,000/mo, 15 users, 30 projects. Business: ¥36,300/mo, unlimited. Professional: ¥100,000/mo, unlimited. Free continues with 5 users, and Enterprise continues. API, Gantt and burndown are on all three paid plans. Custom attributes, long-range Gantt and cross-project Gantt are Business and above. The matrix has no hours row. Hours are *probably* on all paid plans (medium confidence, inference from finding 8).
- **Q2:** Today hours (and start date) are Standard and above; Starter and Free lack them. Mapping: Standard→Economy (if ≤15 users/30 projects, otherwise Business+), Premium→Business, Platinum→Professional. Starter has no equivalent. Free stays Free with 5 users. The switch happens at the first renewal on or after 2027-01-01, and new contracts on the old plans are accepted until 2026-12-31.
- **Q3:** The API is on all new paid plans. The issue object carries estimatedHours/actualHours, but plan-dependent behaviour is undocumented. Rate limits are per user per minute: 600/150/150/60 for paid, 60/15/15/6 for Free (2021 figures, still in the docs), exposed through X-RateLimit headers and /api/v2/rateLimit. No rate-limit change has been announced for 2026-2027. No worklog endpoints were added in 2025-2026.
- **Q4:** No evidence of hours moving to a higher tier. The gating that did move to higher tiers is AI, cross-project Gantt, 孫課題 and custom attributes (Business and above).
