# RTA marketing operations

This directory contains review drafts and executable checks for rtacontractor.ae. Start with [the audit and release review](audit/README.md).

- `marketing-campaigns/`: source-backed search-ad, keyword, social and brand drafts. Run `node operations/marketing-campaigns/generate.mjs` to reproduce the JSON/CSV/SVG pack. `render-assets.mjs` renders PNGs in an isolated local browser; it never posts to a social account.
- `marketing-dashboard/`: private reporting-app source, read-only adapters, data contracts and tests. Reporting credentials and private exports stay outside the checkout and public website. Follow its README to reproduce the local dashboard.
- `quality/`: JavaScript syntax checks, scoped public availability monitoring and protocol tests.
- `search/indexnow.mjs`: a dry run unless `--submit` is supplied. Submission requires a private owner-managed key and an exact matching proof file already served on the live HTTPS website. Do not commit the key, its filename or private configuration. A received submission does not prove indexing.
- `deploy/`: a scoped Nginx redirect review snippet. It has not been applied. The static-host `_headers` file is not a replacement for actual Nginx headers.

The CI workflow runs source/build/static/unit and isolated browser checks. Dependabot configuration prepares weekly dependency review. The public monitor prepares a daily GitHub schedule once the workflow reaches an enabled default branch. No production cron, service or external notification recipient has been installed. Form-delivery health and the separately disabled lead service are documented in [the lead-service README](../server/lead-service/README.md).

Campaign and social publication, billing, budget changes, vendor privacy choices, provider activation and production deployment have separate owner gates. These drafts grant no permission to spend or publish. Keep the existing active form provider until the verified server-side switch is approved.
