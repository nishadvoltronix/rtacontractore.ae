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
- `website/dist/assets/app.js`: accessible mobile navigation and enquiry preparation.
- `website/photo-sources.json`: image origins, photographer credits and license references.

CSS, JavaScript, logos, fonts and photographs in `dist/assets` are source assets retained by the build. Do not delete `dist` before building.

The About section pins as the sectors and following content scroll over it. Taller mobile layouts scroll through all About content before pinning. Short viewports and reduced-motion preferences use normal scrolling, and keyboard focus reveals any covered About link.

The “What We Do” section opens with a large title, then reveals its eight RTA-related work categories as the visitor scrolls. When the full grid fits below the header, it stays in place while the cards appear one at a time. Smaller screens use a natural scrolling reveal. Reduced-motion preferences, short viewports, and JavaScript-disabled browsers show the complete static grid. Keyboard focus reveals each card, and the desktop sequence includes a direct link to Our Expertise. Each card links to the project enquiry section. The controller is `website/dist/assets/works-scroll.js`; photograph sources and licenses are recorded in `website/photo-sources.json` and credited on `/photography/`.

## Enquiries

The form validates and prepares an enquiry locally. Visitors review it and choose an email or WhatsApp link; they press send in their own application. It does not claim to submit a lead to a server, store personal details or send messages automatically. Direct telephone, email and WhatsApp links are also available. Without JavaScript, direct contact links remain available and the form's submit action stays disabled.

## SEO and public launch

The local build now defaults to the verified public origin **https://rtacontractor.ae**. The 24 October 2026 audit found that this public site's existing metadata and sitemap still point to the private Sites preview. This local correction has NOT been deployed. Publishing, GitHub pushes, DNS changes and account submissions require explicit authorization.

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

Existing generic robots rules already allow search crawlers. No AI training-policy change, security bypass, analytics token, verification token, llms.txt, indexing submission or production action was added. Search visibility and AI citations are not guaranteed.

## Verification

```sh
npm run check
npm run test:browser
npm run test:works
npm run test:http
```

The browser check expects the local preview to be running at port 4173 and installed Chrome on Windows. It checks desktop/mobile layouts, links, accessibility, images, metadata, the navigation, FAQ accordions and enquiry preparation. Screenshots and reports go to ignored `artifacts/`. It does not send an enquiry.

## Sources and ownership

Business identity, logo, contact details and founding year: https://voltronix.ae/ (reviewed 23 October 2026). Completed work links go to the company's existing project portfolio. Stock photographs are representative imagery, not claims of VOLTRONIX projects. The homepage hero and sectors background use image and video assets supplied by the user; their creators and photographic authenticity have not been independently verified. The current background uses the supplied 1280 x 720 H.264 file without transcoding (approximately 7.57 Mbps video bitrate), with refreshed high-quality poster images. The decorative background video loads when its section comes into view, plays silently, pauses offscreen, and has pause/play controls. Reduced-motion visitors see a still frame. No invented reviews or unverified RTA approval badges are included.

Service research references from the user's shared conversation:

- https://imperial-uae.com/
- https://binhanifgroup.com/services/street-lighting-division/
- https://alphaislandtech.com/

Original service copy describes enquiry scopes, not competitors' project histories. Stock photographs are licensed from Unsplash, with the supplied hero image credited separately on `/photography/`; Manrope is distributed with its SIL Open Font License.

The Sites identity is retained in `website/.openai/hosting.json`. This GitHub repository remains the working source; hosted source synchronization uses an isolated publishing checkout so it does not create a nested Git repository here.

The “Authority coordination” slider before the homepage FAQ displays the seven authority logos from VOLTRONIX's corporate website plus the official Dubai RTA mark. The heading clarifies that the marks do not imply partnership or endorsement. Original asset sources are recorded in `website/partner-logos.json`. The slider pauses on hover, offscreen or via its pause control; reduced-motion and JavaScript-disabled visitors get a manually scrollable row.
