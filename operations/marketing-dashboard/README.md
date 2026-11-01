# Private RTA marketing dashboard

This module provides the authored dashboard, metric rules, provider-response normalizers and a read-only refresh CLI. The rendered app and private reviewed snapshot live outside `website/dist`; they are not part of the public contractor website.

The starter supports configuration-only evidence and explicit unavailable states. Actual native exports can subsequently add observed snapshots through the separate native-export importer below. Private performance values and raw exports are not embedded in this repository. The source inspector retains provenance and definitions. No automatic reporting connection or marketing-results claim is implied by a configured tag.

## Build and preview

Use the installed Data plugin's canonical `prepare-data-app.mjs` with `--surface dashboard`, a new output directory and the reviewed snapshot. Read that app's `AGENTS.md`, then install this authored content:

```powershell
node operations/marketing-dashboard/install-content.mjs --project-dir PRIVATE_DATA_APP
node DATA_PLUGIN_ROOT/scripts/data-app.mjs build --project-dir PRIVATE_DATA_APP --separate-data
node DATA_PLUGIN_ROOT/scripts/data-app-preview.mjs start --project-dir PRIVATE_DATA_APP
```

`DATA_PLUGIN_ROOT` and `PRIVATE_DATA_APP` above are explicit path placeholders. The canonical preparer supplies a fresh app ID; this installer preserves it. It changes only authored content and reviewed data, never the protected Data runtime. The installed Data plugin is required; no package installation or runtime fork is provided here.

The official preview helper serves loopback only and registers the current user's login service. Stop that exact preview with the helper's `stop --project-dir` command. It does not change the production webserver, DNS, billing, campaign status or public sharing.

## Measurements and dates

- Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, Custom and Reset period are available. Without verified date coverage, the shared custom calendar is disabled and says why. Other presets can select an uncovered window and display Unavailable.
- Distinct GA4 users require an exact-period response. Daily or channel user counts are never summed. The request includes the apex and `www` RTA hostnames.
- GA4/Ads/CRM dates use Dubai time; Search Console dates use Pacific Time. These windows are not silently merged into a common daily conversion rate.
- Cost per paid enquiry requires compatible costs and verified paid-enquiry attribution. Platform conversions, clicks, contact intent and assistant activity are not automatically accepted CRM enquiries.
- Spend requires complete compatible reports from both configured search-ad platforms. An empty report is not manufactured into zero spend. No Meta/LinkedIn spend is included in that search-platform total.
- CRM reporting requires exact `RTA_Website_Origin`, verified origin-capture coverage from the actual cutover, explicit technical-test exclusion and unique submission IDs. Field creation alone does not establish historical coverage. The current capture service is disabled.
- Qualification, quote value and won revenue remain unavailable until their actual CRM/HUB semantics and joins are verified. A pipeline stage is not assumed to prove qualification or revenue.
- Current and immediately preceding equal-length periods are separate. Missing comparison history is never replaced by an endpoint delta. Today/provisional observations are not labeled finalized; live refresh refuses an end date beyond an operator-verified `finalizedThroughDate`.

## Private reporting bindings

Copy `bindings.example.json` to a private location, supply verified source IDs and a supported Google Ads API version, and keep all bindings disabled until ownership/access and date coverage are confirmed. Tokens are read from named server environment variables. They must never appear in dashboard JSON, source control, client JavaScript or command arguments.

```powershell
node operations/marketing-dashboard/refresh.mjs --snapshot PRIVATE_DATA_APP/src/data.json --provider ga4 --config PRIVATE_BINDINGS --start 2026-10-01 --end 2026-10-31
node operations/marketing-dashboard/refresh.mjs --snapshot PRIVATE_DATA_APP/src/data.json --input PRIVATE_PROVIDER_EXPORT
```

These dates are command examples, not recorded performance. Successful refresh preserves app identity and unrelated queries, marks authoring Updating and requires the canonical rebuild/review workflow. The CLI uses fixed read-only reporting endpoints, rejects redirects, caps response sizes, checks concurrent snapshot changes and atomically replaces the reviewed JSON. It does not schedule refresh or start an API listener.

GA4, Search Console and Google Ads have live read-only request adapters. They have been tested with isolated synthetic responses; no authenticated production report was retrieved by this module. Microsoft Advertising's authenticated SDK binding and Zoho's scoped live reporting binding remain disabled. Their strict owner-export import contracts are implemented. No API availability or report completeness is guessed.

## Export envelope

`schemaVersion: 1`; `provider` is `ga4`, `gsc`, `googleAds`, `microsoftAds` or `zoho`; `obtainedBy` is `owner-export` for an actual owner export; include an ISO `obtainedAt`, `websiteOrigin: https://rtacontractor.ae`, `coverageVerified: true` and exact `{startDate,endDate}` range. `request`/`response` must match the relevant function in `lib/providers.mjs`. Never relabel a synthetic response as an actual export.

- GA4: the exact hostname-filtered `ga4Request(range)` and native RunReport response. Thresholding, sampling, truncation, schema restrictions, unexpected metrics or timezone mismatches fail closed.
- Search Console: the exact finalized property-total `gscRequest(range)` and native `byProperty` response. Top query/page rows cannot replace property totals.
- Google Ads: a complete native SearchStream response for `googleAdsQuery(range, verifiedCampaignId)`, AED and Dubai timezone. Duplicates and unsafe micros precision are rejected. Campaign conversions remain explicitly platform-reported.
- Microsoft Advertising: `response` contains `reportType: CampaignPerformanceReport`, `aggregation: Daily`, `returnOnlyCompleteData: true`, `reportTimeZone: AbuDhabiMuscat`, and `rows` with native `TimePeriod`, `CampaignId`, `CampaignName`, `CurrencyCode`, `Impressions`, `Clicks`, `Spend`, `Conversions`. This requires a genuine reviewed report; the application does not construct one from assumptions.
- Zoho: `response.complete: true`, the verified `originCaptureCompleteFrom` day and complete records with only the fields required by the normalizer. Contact fields, record IDs and submission IDs are discarded before the snapshot is written. Corporate records and technical tests are excluded; unknown test flags, missing unique keys or duplicates fail closed.

Native AI, Clarity, social, keyword, landing-page and quote/revenue views retain explicit unavailable states until their actual report formats and source ownership are verified. A prepared view is not a claim of a completed reporting connection. Credentials and raw exports belong outside the app; `.private/` and private/export filenames are ignored by Git.

## Native Search Console browser CSV exports

`import-native-gsc.mjs` accepts a genuine downloaded CSV ZIP, its independently pinned SHA256, a private record of the observed authenticated UI scope, and the existing private app snapshot. It does **not** fabricate an API request or wrap a browser export as an API response.

```powershell
node operations/marketing-dashboard/import-native-gsc.mjs --zip PRIVATE_NATIVE_ZIP --scope PRIVATE_UI_SCOPE_JSON --expected-sha256 PINNED_SHA256 --snapshot PRIVATE_DATA_APP/src/data.json
```

The private scope records `schemaVersion: 1`, `acquisition: native_authenticated_browser_csv_export`, `propertyVerifiedInUI: true`, `property: https://rtacontractor.ae/`, `searchType: Web (text-based)`, `granularity: Daily`, `additionalFilters: []`, the exact `{startDate,endDate}` and `observedExportDate`. Property identity comes from the authenticated UI observation; it is not encoded in Filters.csv. Do not invent that observation or the hash.

The importer verifies ZIP/hash/CRC and exact CSV headers, reads only Chart.csv, Filters.csv, Pages.csv and header-only Queries.csv in memory, and ignores the other ZIP contents. Every requested daily row must actually exist, in order, without duplicates. Missing days are rejected rather than filled. Blank rates/positions remain null; positions are never averaged across zero-impression days. Page URLs must meet a strict public RTA URL contract, and retain the full-export period. Nonempty query rows need a separately reviewed privacy contract.

The source records the actual archive/entry hashes, native UI scope, observation/import dates and transformation. Complete **date-row coverage within that exported snapshot** does not establish data finalization; the UI says the snapshot may be revised. Reported daily clicks and impressions can be summed only within fully covered selected dates. Search result page rows are not GA4 landing-page sessions. Header-only Queries.csv means no query rows were exported, not zero searches or invented keywords.

The Search & AI tab defaults to available native snapshot dates when it has no existing selection. “View available dates” restores that actual window; Reset restores Last 7 days. Overview retains its independent Last 7 days default. Outside the available dates, metrics remain unavailable. A later successful API import can retire the native snapshot as the active metric source while retaining its provenance.

## Validation and source references

```powershell
node --test operations/marketing-dashboard/test/model.test.mjs
node --test operations/marketing-dashboard/test/native-gsc.test.mjs
node operations/marketing-dashboard/test/browser-verify.mjs
node operations/marketing-dashboard/test/browser-native-gsc.mjs
```

Browser checks use a fresh headless Chrome context restricted to localhost, with no logged-in profile or external providers. Synthetic unit fixtures never populate the reviewed app. The browser suite checks every authored view, date/reset/custom behavior, source inspection, export choices and mobile overflow. The native-export browser checks compare the actual reviewed snapshot with visible metrics, daily rows, chart marks, source metadata and covered/uncovered selections.

The report contracts were checked against official documentation: [GA4 RunReport](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport), [GA4 response metadata](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData), [Search Console query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [Google Ads reporting](https://developers.google.com/google-ads/api/docs/reporting/overview), and [Microsoft report requests](https://learn.microsoft.com/en-us/advertising/reporting-service/reportrequest?view=bingads-13).
