# VOLTRONIX — Lighting & Infrastructure

A responsive, photography-led website for VOLTRONIX's street lighting and electrical infrastructure enquiries in Dubai. Built with static HTML, CSS and small progressive JavaScript; no production framework or runtime dependencies.

## Run locally

Requires Node.js 22 or later.

```sh
npm install
npm run build
npm run dev
```

Open http://127.0.0.1:4173. Build output is in `website/dist/`; it can be served by any static host supporting directory index pages.

## Edit

- `website/site.config.mjs`: business name, published contact details and canonical origin.
- `website/services.mjs`: six service/enquiry topics with evidence flags and scope FAQs.
- `website/street-lighting-content.mjs` and `website/templates/street-lighting.mjs`: sourced primary landing-page copy and shared-style template.
- `website/rta-works.mjs`: the eight RTA-related work categories in the “What We Do” photo grid before Our Expertise.
- `website/scripts/build.mjs`: shared layout, home, service, privacy and photography pages; sitemap, robots and JSON-LD.
- `website/dist/assets/style.css`: responsive visual system.
- `website/dist/assets/app.js`: accessible mobile navigation and section interactions.
- `website/dist/assets/contact-widgets.js`: immediate AI launcher, embedded popup loading/retry and WhatsApp timing.
- `website/photo-sources.json`: image origins, photographer credits and license references.

CSS, JavaScript, logos, fonts and photographs in `dist/assets` are source assets retained by the build. Do not delete `dist` before building.

The navbar uses a phone menu below 768px. Tablets and larger screens keep the full navigation, with logo size, text and spacing scaling between 768px and 1280px. Resizing out of the phone layout closes its menu and releases the page scroll lock.

The About section pins as the sectors and following content scroll over it. Taller mobile layouts scroll through all About content before pinning. Short viewports and reduced-motion preferences use normal scrolling, and keyboard focus reveals any covered About link.

The “What We Do” section opens with a large title, then reveals its eight RTA-related work categories as the visitor scrolls. When the full grid fits below the header, it stays in place while the cards appear one at a time. Smaller screens use a natural scrolling reveal. Reduced-motion preferences, short viewports, and JavaScript-disabled browsers show the complete static grid. Keyboard focus reveals each card, and the desktop sequence includes a direct link to Our Expertise. Each card links to the project enquiry section. The controller is `website/dist/assets/works-scroll.js`; photograph sources and licenses are recorded in `website/photo-sources.json` and credited on `/photography/`.

## Enquiries

The contact section embeds Zoho CRM form `5653678000076526082` using the supplied WebFormServeServlet script. Visitors submit their contact details directly to Zoho CRM for VOLTRONIX. Keep the embed script synchronous and inside the contact section so Zoho inserts the form at the correct position. Edit its fields in Zoho CRM. Direct telephone, email and WhatsApp links remain available if JavaScript is disabled or the form cannot load.

The Talk to Maries AI button appears immediately on each page, on the right as a red circular button with the `talk2maries` label, matching voltronix.ae. The green WhatsApp button appears at bottom-left after four seconds. The AI button opens a popup within the page; an early click shows a loading panel and opens the embedded assistant when ready. Loading failures offer an in-page retry instead of navigating elsewhere. The supplied widget is configured in the `ai-assistant-embed` template in `website/scripts/build.mjs`; the early `contact-widgets.js` controller selects its explicit `data-maries-widget` marker so Cloudflare-injected scripts cannot replace it. The same right-side positioning anchor used by AC Experts keeps the assistant 20px from the side and 96px above the bottom, independently of WhatsApp. Opening the panel does not start voice recording. Visitors start voice themselves and must grant microphone permission. The generated permissions policy allows microphone access for the Talk2Maries iframe. Local browser suites stub the provider script and do not start an assistant conversation.

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
npm run test:contacts
npm run test:works
npm run test:http
npm run test:discovery
npm run test:static
npm run test:safety
npm run test:primary
```

The browser check expects the local preview to be running at port 4173 and installed Chrome on Windows. It checks all nine pages on desktop/mobile, links, accessibility, images, metadata, navigation, FAQ accordions and the Zoho embed installation. Local QA stubs the Zoho script to avoid external requests; live rendering must be checked separately without sending a CRM lead. The primary-page suite also covers keyboard navigation, narrow screens, JavaScript-disabled content and street-lighting enquiry context. Screenshots and reports go to ignored `artifacts/`. No enquiry is sent.

`QA_BASE_URL` can select an isolated local preview using literal `127.0.0.1` or `[::1]`. Browser runners reject remote origins and block external requests, WebSockets, service workers and redirect responses before following them. Actual redirects are tested separately by the Node/Nginx suites. All three browser runners accept `QA_ARTIFACTS_DIR` inside ignored `artifacts/` to preserve earlier evidence; they reject symlink/junction output paths. These are test-process settings, not production configuration.

Run the complete local verification with existing Nginx, OpenSSL and Chrome executables:

```sh
npm run test:local -- --nginx /absolute/path/to/nginx --openssl /absolute/path/to/openssl --chrome /absolute/path/to/chrome --output artifacts/local-verification-new-run
```

The output directory must be new. This command builds the site, validates SEO and assets, checks JavaScript syntax, discovers every `website/scripts/*.test.mjs` unit suite, runs HTTP checks, starts its own ephemeral loopback preview for browser/scroll/interaction tests, and runs actual Nginx HTTP/TLS integration tests. It stops its preview and Nginx processes afterward. Each step records its command, timestamps, exit code and log in a local JSON summary. A failing step makes the run fail; it never substitutes an older passing result. No dependency is downloaded or installed, and the public `audit:discovery` command is excluded. There is no configured lint or TypeScript check; syntax and runtime checks are reported separately.

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
