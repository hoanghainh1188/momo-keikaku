# OQ9 market recon r1-1: trackers in VN offshore for Japan, and where Backlog leavers go

Researcher run: 2026-09-20. Public web only. ~22 tool calls.
Decision served: ship the Backlog connector first and Jira later, for Japanese client projects delivered by Vietnamese offshore teams.

Questions:
- Q1. Which trackers show up in VN job postings for BrSE, Japan-market PM, Comtor and Japan-project QA?
- Q2. Is there any survey or report on tracker share (Backlog / Jira / Redmine) in VN offshore work for Japan?
- Q3. Where are teams going after leaving Backlog following Nulab's plan change on 2027-01-01? Are vendors running migration campaigns?

Format: claim | source URL | publisher | pub_date | accessed | confidence | class

## Findings

### Q1: Job postings

**Sampling method.** I searched "tuyển BrSE Backlog Redmine", "BrSE job requirements Backlog Jira Redmine Japan" and a domain-restricted search of itviec, topcv, topdev, vietnamworks and careerviet. I then tried to open 6 postings. 3 opened and 3 failed: ITviec returned 410, and two TopCV pages returned 403. Of the 3 that opened, 2 have near-identical text and are probably the same headhunter posting reposted, so there are really only 2 independent postings. This is far too small to measure share. It only shows whether each tool appears.

- F1. A BrSE posting for Japanese clients requires skill with "Redmine, Zira [sic], Backlog, Odoo", dated 19/11/2024. | https://timviec365.vn/brseky-su-cau-noi-tieng-nhat-ha-noi-che-djo-tot5070tr-p2015275.html | timviec365 (Hrvalu headhunter) | 2024-11-19 | 2026-09-20 | medium (primary posting, but older than the 2025-26 window) | traction
- F2. TD Consulting posting TDC00184 (BrSE) lists the same four tools, "Redmine, Jira, Backlog, Odoo", and requires Japanese communication. The text looks like F1's, so count it as one posting, not two. | https://tdconsulting.vn/job/tdc00184-brse-ky-su-cau-noi/ | TD Consulting | undated | 2026-09-20 | medium | traction
- F3. Vitalify Asia's Bridge Project Manager posting (Japanese PO, N2 required) says "PJ Task Management: Redmine / Jira / Backlog / Etc..". The posting has expired and shows no date. | https://topdev.vn/detail-jobs/bridge-project-manager-bpm-vitalify-asia-cong-ty-tnhh-vitalify-a-chau-2071386 | TopDev | undated (expired) | 2026-09-20 | medium | traction
- F4. The search-engine snippet for the Vitalify ITviec posting also lists "Jira/Confluence, Redmine, Backlog". I could not open the page itself (HTTP 410). | https://itviec.com/it-jobs/bridge-project-manager-brse-it-communicator-vitalify-asia-3350 | ITviec | unknown | 2026-09-20 | low (snippet only) | traction
- F5. Every posting I could read that names a tracker names all three (Redmine, Jira, Backlog) together, usually with Redmine first. No posting named Backlog alone or Jira alone. Tally: 2 of 2 independent postings name Backlog, 2 of 2 name Jira and 2 of 2 name Redmine. Asana did not appear. | derived from F1-F3 | - | - | - | low (n=2) | traction

### Q2: Surveys and reports

- F6. A Nulab report on Backlog in Vietnam says some VN offshore firms pick Redmine or GitLab because they are self-hosted and free. It says Backlog use follows the client: CodLuck uses it because its Japanese partners "frequently use 'Backlog'". It names 7 VN Backlog users (CodLuck, NAL, PIRAGO, Relipa, TOMOSIA, VMO, VHEC) and one firm still evaluating it (Haposoft, currently on Redmine). | https://nulab.com/ja/blog/backlog/case-study-report-on-the-use-of-backlog-in-vietnam/ | Nulab (vendor) | undated | 2026-09-20 | medium (vendor source, but gives qualitative support for client-driven tool choice) | traction
- F7. Nulab publishes case studies on VN offshore firms that serve Japan: HBLab (Hanoi/Yokohama, "cuts costs by 20%") and PiraGo. It has also run a webinar on offshore software in Vietnam using Backlog. | https://nulab.com/blog/user-stories/offshore-development-company-hblab-cuts-costs-20-using-backlog/ ; https://backlog.com/ja/blog/case-study-pirago/ ; https://community.nulab.com/t/webinar-offshore-software-in-vietnam-project-management-using-backlog/220 | Nulab | undated | 2026-09-20 | medium (vendor marketing) | traction
- F8. CO-WELL Asia announced it was developing a Vietnamese-language version of Backlog. This points to a VN partner channel for Nulab. I read only the title and did not open the page. | https://co-well.vn/en/announcement-of-developing-the-vietnamese-version-of-backlog-project-managing-tool/ | CO-WELL Asia | unknown | 2026-09-20 | low | traction
- F9. The 2025 Offshore Development White Paper (オフショア開発白書) ranks Vietnam first at 43% as an offshore destination, according to secondary write-ups. Neither the white paper summaries nor the search results contained any tracker-usage data. | https://shiftasia.com/ja/column/2025%E5%B9%B4%E7%89%88%E3%82%AA%E3%83%95%E3%82%B7%E3%83%A7%E3%82%A2%E9%96%8B%E7%99%BA%E7%99%BD%E6%9B%B8%E3%81%8B%E3%82%89%E8%AA%AD%E3%81%BF%E8%A7%A3%E3%81%8F%E6%9C%80%E6%96%B0%E5%8B%95%E5%90%91/ ; https://deha.co.jp/magazine/offshore-white-paper-2025/ | SHIFT ASIA / DEHA (secondary) | 2025 | 2026-09-20 | medium for the 43% figure; there is no tracker data | traction

### Q3: Backlog repricing and churn

- F10. The price change is confirmed. Starting 2027-01-01 Backlog moves to 3 plans: Economy ¥21,000/mo (max 15 users), Business ¥36,300/mo (unlimited users) and Professional ¥100,000/mo. The old Standard plan (unlimited users) cost ¥16,000/mo, so staying on unlimited users costs about 2.27x. Existing contracts switch at their first renewal after 2027-01-01. | https://www.itmedia.co.jp/news/article/2608/27/2000000862/ ; https://backlog.com/ja/blog/new-plans-2027/ ; https://nulab.com/ja/info/backlog-plan-renewal/ | ITmedia NEWS; Nulab | 2026-08-27 | 2026-09-20 | high | sentiment/fact
- F11. ITmedia reports strong negative reaction on social media, quoting "2.27倍は無理" and "続ける意味がなくなったので乗り換える". The article names no destination tools. | https://www.itmedia.co.jp/news/article/2608/27/2000000862/ | ITmedia NEWS | 2026-08-27 | 2026-09-20 | high (that the backlash happened) | sentiment
- F12. In the Hatena Bookmark comments on the ITmedia story, the extraction found Redmine and Linear named once each and Jira named once (unfavourably). The dominant view is reluctant retention: there are alternatives, "but none are just right". The extraction tool may have missed some comments. | https://b.hatena.ne.jp/entry/s/www.itmedia.co.jp/news/article/2608/27/2000000862/ | Hatena | 2026-08-27 onward | 2026-09-20 | low-medium | sentiment
- F13. A first-person Qiita post: the author is on the Starter plan, which is being discontinued, so their cost rises about 7.8x (¥30,780 to ¥239,400 per year). They weighed GitHub Issues, rejected because clients and sales staff cannot use it; Trac, rejected as outdated; and Redmine, described as "a lot of customers use it" but not modern enough. They chose none of these and built a read-only Backlog archive viewer (backlog-x) instead. | https://qiita.com/a-kanae/items/c1546912c4a1115fcf6c | Qiita (@a-kanae) | 2026-09-08 | 2026-09-20 | high as one data point | sentiment
- F14. Two note.com essays (How many designs, and 社内SEまるお) discuss the price rise but neither says the author is leaving, and neither names a destination. | https://note.com/howmanydesigns/n/nee7672c9eee6 ; https://note.com/se_maruo/n/n4a699e22b6e2 | note | 2026-08-27 / 2026-08-30 | 2026-09-20 | medium | sentiment
- F15. Oflight's column sets out 4 options: downgrade to Economy, accept Business, self-host Redmine, or outsource Redmine or switch to another SaaS (Linear, Jira, Asana, Notion). It points out that Nulab's official importer only works Redmine to Backlog, so there is no official tool for leaving. | https://www.oflight.co.jp/ja/columns/backlog-price-hike-redmine-migration-2026 | Oflight Co. | 2026-08-28 | 2026-09-20 | low for actual movement (option-listing column) | sentiment
- F16. Search-result snippets mention SMEs worried about user-count overages from inviting partners (パートナー招待). That matters for multi-company offshore setups. I did not trace this to a first-person source. | aggregated snippet (app-tatsujin / aipicks listicles) | - | 2026 | 2026-09-20 | low | sentiment

## Leads worth chasing

1. The X trending page "Backlogスタンダードプランが2027年から大幅値上げへ" (https://x.com/i/trending/2092780091977916914) needs a logged-in browser. It is probably the richest source of named destinations.
2. The full Hatena comment list. The WebFetch extraction looked incomplete.
3. Nulab's Vietnam report (F6) links to its source companies. Asking CodLuck, NAL, Relipa, TOMOSIA and VMO directly which trackers their Japanese clients require would give a real split.
4. The offshore white paper itself from オフショア開発.com (Resorz). Its full PDF may have a tool question; I only saw secondary summaries.
5. TopCV and ITviec block the fetch tool (403/410). A browser-based sample of about 30 current postings would give a count worth using.
6. Whether Atlassian, Asana, Linear or ClickUp in Japan run Backlog-specific switching offers after the 2026-08 announcement. Watch through Q4 2026.
7. The Enterprise-plan help article (support-ja.backlog.com 58585222415257) covers obligations before the switch date. It may matter for connector plan and API-limit assumptions.

## Looked for but could not find

- "Backlogからの乗り換え キャンペーン 2026": no vendor migration campaign. Results were Backlog's own referral campaign and phone-carrier offers.
- "Backlog 値上げ 脱Backlog 移行しました": no first-person post reporting a completed migration.
- "Backlog 乗り換え 値上げ Jira": only listicles or option columns name Jira. No first-person post chose Jira.
- "Backlog 値上げ 移行先 Redmine Notion": no posts about actually moving to Notion, GitHub Projects, Plane, OpenProject, Brabio, Wrike or ClickUp.
- "オフショア開発白書 2025 プロジェクト管理ツール ベトナム": no tracker-share data.
- "kỹ sư cầu nối Backlog Redmine Jira yêu cầu": results were mostly Viblo tutorials, not postings.
- I did not search for TopDev or ITviec market reports with tool-usage questions because of budget.

## Verdicts

- **Q1, tracker dominance in VN offshore for Japan: unresolved. Confidence low.** Every sampled BrSE or Japan PM posting lists Redmine, Jira and Backlog together as expected skills (n=2 independent postings). That points to a multi-tracker world where the client picks the tool. The evidence does not show that Backlog, or any single tracker, dominates. Redmine appears at least as often as Backlog.
- **Q2, surveys and share data: none found. Confidence medium that no public share data exists in the sources checked.** Nulab's own Vietnam report gives qualitative support that Japanese clients bring Backlog and VN vendors follow, with Redmine or GitLab as free self-hosted defaults. That supports a client-driven connector strategy but gives no share number.
- **Q3, Backlog churn destinations: too early to see real migrations. Confidence medium.** The backlash is real and well documented (ITmedia, 2026-08-27). But first-person posts so far show hesitation, not moves: downgrading, archiving, or staying reluctantly. Named candidates, in rough order of appearance: Redmine (most often, including once as "customers use it"), GitHub Issues, Linear, Jira, Notion and Asana. Jira shows up mainly in option lists, not in actual choices. There is no vendor migration campaign and no official export tool from Nulab. Most renewals switch after 2027-01-01, so movement should be re-checked in Q1 2027.

**Implication for the decision.** This is evidence only, not a recommendation. Nothing here contradicts shipping Backlog first. It does suggest that a Redmine connector could matter as much as Jira for this segment, both as an existing VN offshore default and as the destination most often named by people leaving Backlog.
