# VOLTRONIX — Lighting & Infrastructure

A responsive, photography-led website for VOLTRONIX's street lighting and electrical infrastructure enquiries in Dubai. Built with static HTML, CSS and small progressive JavaScript; no production framework or runtime dependencies.

The 1 November local modernization expands the site to 19 indexable pages and a recoverable 404. See [the website review](website/WEBSITE-REVIEW-20261101.txt) for scope, evidence, screenshots and publication limits. The new marketing controller and lead service remain disabled; this branch has not been deployed.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci --ignore-scripts
npm run build
npm run dev
```

Open http://127.0.0.1:4173. Build output is in `website/dist/`; it can be served by any static host supporting directory index pages.

## Edit

- `website/site.config.mjs`: business name, published contact details and canonical origin.
- `website/services.mjs`: six service/enquiry topics with evidence flags and scope FAQs.
- `website/street-lighting-content.mjs` and `website/templates/street-lighting.mjs`: sourced primary landing-page copy and shared-style template.
- `website/page-content.mjs`: service index, About, contact, quotation, FAQ, cookie information, knowledge index and three buyer guides.
- `website/rta-works.mjs`: retained historical topic data; its eight-category reveal is no longer published.
- `website/scripts/build.mjs`: shared layout, all 19 indexable pages, 404, project brief, sitemap, robots and JSON-LD.
- `website/scripts/marketing-build-policy.mjs`: fail-closed build gate for future coordinated consent ownership of GTM.
- `website/tracking.config.mjs` and `website/dist/assets/tracking.js`: preserved form-receipt and PII-free event bridge.
- `website/marketing.config.mjs` and `website/dist/assets/consent.js`: disabled prepared consent/attribution/lead-client integration.
- `server/lead-service/`: disabled server-side intake/delivery adapters and isolated tests; no automatic replacement of the Zoho form.
- `website/dist/assets/style.css`: responsive visual system.
- `website/dist/assets/app.js`: accessible mobile navigation and section interactions.
- `website/dist/assets/contact-widgets.js`: immediate AI launcher, embedded popup loading/retry and WhatsApp timing.
- `website/photo-sources.json`: image origins, photographer credits and license references.

CSS, JavaScript, logos, fonts and photographs in `dist/assets` are source assets retained by the build. Do not delete `dist` before building.

The navbar uses a mobile menu below 960px, with keyboard-accessible native Services and Resources disclosures. Escape closes open menus and restores focus. Without JavaScript, narrow-screen navigation stays in normal flow so it cannot obscure anchor headings.

Homepage sections use normal document flow. Three buyer starting points link to street lighting, underground cabling and quotation planning. Background video is opt-in, with no media source loaded until playback is requested. Photograph sources and licences remain recorded in `website/photo-sources.json` and credited on `/photography/`; representative imagery does not establish a completed project.

## Enquiries

The contact section embeds Zoho CRM form `5653678000076526082` using the supplied WebFormServeServlet script. Visitors submit their contact details directly to Zoho CRM for VOLTRONIX. Keep the embed script synchronous and inside the contact section so Zoho inserts the form at the correct position. Edit its fields in Zoho CRM. Direct telephone, email and WhatsApp links remain available if JavaScript is disabled or the form cannot load.

The Talk to Maries AI button appears immediately on each page, on the right as a red circular button with the `talk2maries` label, matching voltronix.ae. The green WhatsApp button appears at bottom-left after four seconds. The AI button opens a popup within the page; an early click shows a loading panel and opens the embedded assistant when ready. Loading failures offer an in-page retry instead of navigating elsewhere. The supplied widget is configured in the `ai-assistant-embed` template in `website/scripts/build.mjs`; the early `contact-widgets.js` controller selects its explicit `data-maries-widget` marker so Cloudflare-injected scripts cannot replace it. Opening the panel does not start voice recording. Visitors start voice themselves and must grant microphone permission. The generated permissions policy allows microphone access for the Talk2Maries iframe.

The supplied Zoho SalesIQ widget is included once per page using `zsiqscript`. On desktop, its chat opens in the page at bottom-right when clicked, with Maries 14px above its launcher or 14px to the left of the expanded chat. The controller handles both current and legacy SalesIQ markup and adjusts the shared Maries positioning anchor as Zoho loads, opens, closes or resizes. Its SalesIQ ready/open callbacks keep automatic invitations minimized until the visitor clicks the launcher. As on voltronix.ae, SalesIQ is hidden at widths of 1024px and below; WhatsApp and Maries remain available, with Maries 20px from the right and 96px above the bottom. The controller releases SalesIQ's scroll lock when its panel is hidden on smaller screens. Chat content and automation are managed in Zoho SalesIQ. Local browser suites stub the provider scripts and do not send messages or start conversations.

## SEO and public launch

The local build defaults to the verified public origin **https://rtacontractor.ae**. The 24 October 2026 audit found private-preview canonicals on the public site. Read-only checks on 26 October found the corrected canonicals on all nine public pages and matching public sitemap/robots output. That observation does not establish the hosting deployment process. The same checks found missing-slash redirects to an HTTP URL on port 3100; production routing still needs correction at the actual host. Publishing, GitHub pushes, DNS changes and account submissions require explicit authorization.

Nine static pages have unique metadata, canonicals, social previews and a connected GeneralContractor / WebSite / WebPage graph. Service entities are limited to the three evidence-backed categories (street lighting, cabling and electrical infrastructure). All six service/enquiry pages have breadcrumbs. High-mast, LED/solar and street-lighting maintenance remain enquiry topics pending specific capability evidence. Useful visible FAQs are included without obsolete FAQ rich-result promises.

The existing /services/street-lighting/ page is the primary landing page. It links the supplied latest RTA certificate and states **Conditionally Prequalified**, road lighting only, tunnel lighting excluded, AED 5,000,000 value limit, registration A025-6513466, expiry 20 October 2029. The owner confirmed this is the latest record; current RTA portal status has not been independently checked. Do not shorten this to blanket RTA approval.

The canonical origin may be overridden for an explicitly intended build. SITE_URL accepts only an HTTPS origin without credentials, a path, query or fragment. In PowerShell:

```powershell
$env:SITE_URL = 'https://rtacontractor.ae'
npm run build
npm run check
```

Remove a temporary override with Remove-Item Env:SITE_URL before rebuilding for the default origin. If publishing a private Sites preview later, set SITE_URL explicitly to that preview origin; do not assume a public SEO build belongs at a preview host. The Sites identity in website/.openai/hosting.json is unchanged.

The local Node preview now redirects existing index.html aliases and missing trailing slashes in one hop with 308. It retains query parameters, handles HEAD and genuine 404s, and displays PDFs inline. These rules do not automatically configure the production static host. Identify the actual host behind Cloudflare and configure HTTPS/apex/path redirects there only after authorization. The www host currently serves a duplicate200 response; production host rules remain pending.

Reports (local project files; excluded from dist):

- [Baseline audit](website/reports/seo-baseline-2026-10-24.html)
- [Implementation and validation](website/reports/seo-implementation-2026-10-24.html)
- [Content strategy, indexing, measurement and 30-day plan](website/reports/seo-strategy-2026-10-24.html)
- [ChatGPT discovery audit and 30-day plan](website/reports/chatgpt-discovery-2026-10-26.html)
- [Five-query visibility baseline](website/reports/chatgpt-visibility-baseline-2026-10-26.json)
- [Competitive search review, local improvements and release priorities](website/reports/competitive-search-2026-10-26.html)
- [Redirect candidate, actual Nginx tests and manual release gates](website/reports/redirect-readiness-2026-10-26.html)
- [Completed local readiness work and full-suite evidence](website/reports/local-completion-2026-10-26.html)

The October 24 reports describe that dated implementation. Current Git state, later photographs, public responses and fresh tests are recorded separately in the October 26 discovery report. The new DEWA source on the street-lighting page corroborates company identity and electrical contracting only; it does not establish RTA approval or a current DEWA grade.

The later competitive review preserves that pending work and adds native page shortcuts plus street-lighting context for the primary page's header and floating WhatsApp actions. Its validation JSON records the latest file hashes and tests; older reports remain historical snapshots. The shared stylesheet version is regenerated on every HTML page, while the new navigation styles apply only to the primary page.

Existing generic robots rules already allow search crawlers. No AI training-policy change, security bypass, analytics token, verification token, llms.txt, indexing submission or production action was added. Search visibility and AI citations are not guaranteed.

## Verification

```sh
npm run check
npm run test:browser
npm run test:website
npm run test:contacts
npm run test:works
npm run test:http
npm run test:discovery
npm run test:static
npm run test:safety
npm run test:primary
npm run test:tracking
npm run test:marketing
npm run test:leads
```

The browser checks expect the local preview at port 4173 and installed Chrome on Windows. `test:browser` retains the original nine-page regressions; `test:website` covers all 19 indexable pages at desktop/mobile/narrow widths, accessibility, navigation, FAQ filtering and quotation context. Local QA mocks provider scripts; its synthetic form is a layout fixture. Live provider rendering requires a separate approved check. The primary suite also covers keyboard navigation, JavaScript-disabled content and street-lighting enquiry context. `test:works` checks the supported buyer paths and 404 recovery. Screenshots/reports go to ignored `artifacts/`. No enquiry is sent.

`QA_BASE_URL` can select an isolated local preview using literal `127.0.0.1` or `[::1]`. Browser runners reject remote origins and block external requests, WebSockets, service workers and redirect responses before following them. Actual redirects are tested separately by the Node/Nginx suites. Browser runners accept `QA_ARTIFACTS_DIR` inside ignored `artifacts/` to preserve earlier evidence; they reject symlink/junction output paths. These are test-process settings, not production configuration.

Run the complete local verification with existing Nginx, OpenSSL and Chrome executables:

```sh
npm run test:local -- --nginx /absolute/path/to/nginx --openssl /absolute/path/to/openssl --chrome /absolute/path/to/chrome --output artifacts/local-verification-new-run
```

The output directory must be new. This command builds the site, validates SEO/assets, checks website/server JavaScript syntax and discovers their unit tests. It runs HTTP checks, starts its own ephemeral loopback preview for browser/website/buyer-path/interaction/contact-widget suites, and runs actual Nginx HTTP/TLS integration tests. It stops its preview and Nginx processes afterward. Each step records its command, timestamps, exit code and log in a local JSON summary. A failing step makes the run fail; it never substitutes an older passing result. No dependency is downloaded or installed, and the public `audit:discovery` command is excluded. There is no configured lint or TypeScript check; syntax and runtime checks are reported separately.

The static checker rejects duplicate/conflicting metadata, checks crawler-specific indexing directives and local robots policy for Googlebot, Bingbot and OAI-SearchBot, and verifies lazy video, poster and responsive image sources. Local robots allowance does not verify a live crawler, CDN policy or indexing.

To record read-only public HTTP discovery checks:

```sh
npm run audit:discovery -- --origin https://rtacontractor.ae --output artifacts/discovery-current.json
```

This command makes public GET requests and writes the specified local report. It exits nonzero for observed failures or blocks, including incorrect production redirects. An OAI-labelled request from this machine is a diagnostic, not verified OpenAI crawler traffic. The script records published IP-manifest metadata without installing an allowlist. Real crawler verification needs authorized edge/origin logs and configuration review; search-result samples do not establish ChatGPT answer citations.

The domain-scoped Nginx candidate is under `website/hosting/nginx/`, outside the published static directory. It has not been installed on any host. **Do not deploy it behind TLS termination with the empty trust file:** the actual immediate proxy peers, forwarded-scheme overwrite, public Host preservation and existing edge redirect order must first be verified. The linked release report provides integration and verification steps.

Run its isolated actual-engine regression suite with existing local Nginx/OpenSSL executables (no automatic download or installation):

```sh
npm run test:redirects -- --nginx /absolute/path/to/nginx --openssl /absolute/path/to/openssl --output artifacts/redirect-test-new-run
```

The suite binds loopback ports, creates temporary test TLS material in ignored artifacts and tests the production snippets with a test-only loopback trust entry. It does not change production or follow redirects onto the public network. Its six local passes do not mean the six live defects have been deployed or resolved.

## Sources and ownership

Business identity, logo, contact details and founding year: https://voltronix.ae/ (reviewed 23 October 2026). Completed work links go to the company's existing project portfolio. Stock photographs are representative imagery, not claims of VOLTRONIX projects. The homepage hero and sectors background use image and video assets supplied by the user; their creators and photographic authenticity have not been independently verified. The current background uses the supplied 1280 x 720 H.264 file without transcoding (approximately 7.57 Mbps video bitrate), with refreshed high-quality poster images. The decorative background video loads when its section comes into view, plays silently, pauses offscreen, and has pause/play controls. Reduced-motion visitors see a still frame. No invented reviews or unverified RTA approval badges are included.

Service research references from the user's shared conversation:

- https://imperial-uae.com/
- https://binhanifgroup.com/services/street-lighting-division/
- https://alphaislandtech.com/

Original service copy describes enquiry scopes, not competitors' project histories. Stock photographs are licensed from Unsplash, with the supplied hero image credited separately on `/photography/`; Manrope is distributed with its SIL Open Font License.

The Sites identity is retained in `website/.openai/hosting.json`. This GitHub repository remains the working source; hosted source synchronization uses an isolated publishing checkout so it does not create a nested Git repository here.

The “Authority coordination” slider before the homepage FAQ displays the seven authority logos from VOLTRONIX's corporate website plus the official Dubai RTA mark. The heading clarifies that the marks do not imply partnership or endorsement. Original asset sources are recorded in `website/partner-logos.json`. The slider pauses on hover, offscreen or via its pause control; reduced-motion and JavaScript-disabled visitors get a manually scrollable row.
