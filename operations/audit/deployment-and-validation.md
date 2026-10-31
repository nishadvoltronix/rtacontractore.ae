# Deployment and validation report

**The expanded master release is prepared locally and has not received production approval or been deployed.** The operator is preparing a new complete remote review/deployment plan. The prior tracking-only 22-path plan does **not** cover this larger website, server, operations and dashboard change. Do not reuse it as approval or as a deployment inventory.

## Executed read-only production observations

Fresh native SSH inspection confirmed the expected existing production identity, original source HEAD and all **11 pre-existing dirty entries preserved**. Node is 24.21.0. No `.env` file was present at the two inspected application roots; that is not a claim that credentials do not exist elsewhere or that environment access is configured. No production source, service, process, account ownership or configuration was changed by these inspections.

The RTA Nginx block still serves the existing static output and has no new redirect overrides or security headers. A source `_headers` file is not automatically applied by Nginx. A [scoped review snippet](../deploy/rta-nginx-redirects.conf.example) is prepared; it has not been installed. It must be merged into the existing site block, validated and approved separately, preserving unrelated sites and settings.

Fresh public checks returned HTTPS 200 for the root, canonical slashed street-lighting URL, robots, sitemap and existing public verification file. TLS was valid through **21 January 2027**. The `www` host returned 200 without redirecting to the apex. The **slashless** street-lighting URL returned a redirect that downgraded to HTTP and exposed an alternate port, then timed out. The local site uses canonical slashed links, but those source links do not fix the live redirect.

Independent nameserver evidence confirms Cloudflare. One local IPv4/IPv6 resolver tool failed, while DNS over HTTPS and system/TLS lookup worked. There is no basis to label DNS broken. Generic public HTTPS observations do not establish crawler identity, private ownership or performance.

## Executed local validation

| Check | Recorded result | Scope |
| --- | --- | --- |
| Static generation | 19 indexable pages plus noindex 404 | Local build; not live publication |
| Build reproducibility | 144 output files byte-identical across repeated builds | Stable reviewed website build snapshot |
| Static website checks | 2,202 passed; 47 local asset references verified | Current website source build |
| Website browser suite | 338 assertions passed | Desktop/mobile, including narrow layouts |
| Retained browser regressions | 251 assertions passed | Existing page behavior |
| Primary service regressions | 353 assertions passed | With and without JavaScript |
| Contact/assistant widgets | 19 assertions passed | Delayed/retry/keyboard behavior |
| Buyer paths and 404 | 122 assertions passed | Multiple widths with/without JavaScript |
| Final integration smoke | 25 checks passed | All routes on mobile plus selected intermediate layouts |
| Accessibility | 38 axe scans; zero serious/critical findings | Automated local scope, not complete conformance certification |
| Private dashboard | 39 unit, 45 general browser and 26 native-snapshot checks passed | Five views; authenticated native GSC export reviewed; API reporting adapters remain unconnected |
| Campaign assets | One RSA with 15 headlines/4 descriptions validated; five graphics rendered | Draft generation/rendering, not publishing approval |
| Final integrated Node run | 137 passed, zero failed/skipped | Website, consent, lead service, reporting and operations contracts; isolated provider fixtures |
| Focused hardening | 29 lead-service, 18 marketing and 5 operations tests passed | Dedupe context, private storage, ambiguous receipts, URL/proof guards, purge/delivery races and consented click-ID mappings |
| JavaScript parsing | 65 JavaScript files passed | JSX is handled by the separate dashboard build |

The website browser tests use isolated local Chrome, blocked external traffic and stubbed providers. They send no real enquiry, start no live CRM/chat conversation and do not use the owner's signed-in browser. Local screenshots include explicitly synthetic provider layout fixtures. Zero page errors/unexpected provider connections were recorded in the reported suites. This proves the tested local behavior; it does not establish current provider rendering, live delivery, production permissions/durability, real-user Core Web Vitals, rankings or legal compliance.

An anonymous public PageSpeed baseline request returned HTTP 429. No performance score or field Core Web Vitals result was manufactured, and no credential or quota workaround was attempted. The website improvements have local structural/browser verification; their deployed performance still requires measurement.

The full combined Nginx/OpenSSL local driver was not executed because the required executables were unavailable in the checkout/PATH. Individual listed suites were executed separately. `git diff --check` was reported clean for the website review. Final integrated build, static and application tests must be rerun against the final frozen release after independent lead/consent fixes settle.

## Change inventory

The release adds ten authored pages and improves generated HTML/layout, metadata, internal links, sitemap, 404 recovery, static assets and tests. Main source locations are recorded in [website review](website-review.md). New prepared modules include [lead service](../../server/lead-service/README.md), [marketing configuration](../../website/marketing.config.mjs), [build activation policy](../../website/scripts/marketing-build-policy.mjs), [marketing draft pack](../marketing-campaigns/generated/), [private dashboard source](../marketing-dashboard/README.md), [quality tools](../quality/), [IndexNow CLI](../search/indexnow.mjs), CI/monitor workflows and dependency configuration. This documentation directory records the eight deliverables.

The dashboard is a private loopback-only local app with five views, date presets/custom controls, source inspection and explicitly disconnected/unavailable metrics. The public website does not serve it. No API credentials or private bindings are in this report, and no live API report has been retrieved by its prepared adapters. Synthetic unit fixtures are not its performance snapshot.

## Remaining release gates

1. Finish independent source review, freeze the exact expanded diff and record final meaningful test results. Verify no private credentials, customer data or operational bindings enter the public repository.
2. Prepare a **new** server review from the current production state with complete path inventory, preserved dirty changes, exact backups/metadata, safe transfer, isolated build and bounded failure/rollback plan. Include new and generated files; do not infer coverage from the earlier 22-path release.
3. Resolve the scoped HTTPS/slash redirect at the actual Nginx layer under explicit approval. Save the exact current configuration, validate syntax, apply only the approved graceful reload and verify from outside; no DNS, security or unrelated site changes are implied.
4. Obtain explicit approval for the concrete production release. The current master frontend plan preserves live GTM version 3 and leaves new consent/attribution/server capture flags false. Version 4 is a separate unpublished draft and must not be automatically published.
5. Secure OAuth, exact CRM/HUB contracts, purpose/URL gates, private storage/retention/proxy policy and a one-provider form switch must be verified before activating the separate lead/consent features. Local tests do not waive these gates.
6. After approved deployment, smoke-test all canonical routes/assets, slashless/apex/www behavior, sitemap/robots/verification file, keyboard/mobile fallbacks, tag ownership and permitted provider behavior. Compare actual SDK delivery separately from processed platform reports. A new real lead test requires its own explicit authorization; existing proof does not justify automatic test submissions.

## Rollback boundaries

The new release requires exact preimages of affected production files, metadata and unrelated dirty changes, plus a tested restore procedure. Restore the saved served build/source and only the specifically approved configuration change; validate before the corresponding reload. Do not erase original dirty work, reset unrelated history or reuse an incomplete old path list.

For the current master plan, live GTM version 3 remains the baseline. If a later separately approved coordinated tracking release changes the legacy bridge or consent, record its actual published version and restore source/container ownership together on rollback. A local HTML restore cannot itself roll back a remote container. Conversely, publishing the paused legacy-bridge draft before the replacement source is verified can remove event ownership.

The existing `trackingConfig.enabled` flag removes **both GTM snippets and the adapter** on build. It is not an adapter-only rollback; preserving the existing Google/Clarity loader requires restoring the correct prechange served build. The new marketing activation flags are false and do not currently control those existing providers. No service restart, deployment, schedule installation or production approval is claimed by this report.
