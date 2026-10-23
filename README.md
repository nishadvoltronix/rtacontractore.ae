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
- `website/services.mjs`: six services, detailed scopes and FAQs.
- `website/scripts/build.mjs`: shared layout, home, service, privacy and photography pages; sitemap, robots and JSON-LD.
- `website/dist/assets/style.css`: responsive visual system.
- `website/dist/assets/app.js`: accessible mobile navigation and enquiry preparation.
- `website/photo-sources.json`: image origins, photographer credits and license references.

CSS, JavaScript, logos, fonts and photographs in `dist/assets` are source assets retained by the build. Do not delete `dist` before building.

The About section pins as the sectors and following content scroll over it. Taller mobile layouts scroll through all About content before pinning. Short viewports and reduced-motion preferences use normal scrolling, and keyboard focus reveals any covered About link.

## Enquiries

The form validates and prepares an enquiry locally. Visitors review it and choose an email or WhatsApp link; they press send in their own application. It does not claim to submit a lead to a server, store personal details or send messages automatically. Direct telephone, email and WhatsApp links are also available. Without JavaScript, direct contact links remain available and the form's submit action stays disabled.

## SEO and public launch

Nine static pages have unique titles and descriptions, canonicals, social metadata, descriptive image alternatives and internal links. Six service pages include Service and BreadcrumbList JSON-LD, with shared GeneralContractor and WebSite data. A sitemap, robots file, custom 404 page and hosting headers are included. FAQ content is visible HTML; no obsolete FAQ rich-result promises are made.

The Sites preview is private by default. Private pages cannot be indexed by search engines. Before a public domain launch, connect the intended domain and rebuild with its canonical origin:

```powershell
$env:SITE_URL = 'https://rtacontractore.ae'
npm run build
npm run check
```

Deploy `website/dist/` at that same origin, verify public access and redirects, and submit its sitemap to the site's Google Search Console property. Public launch, DNS changes and Search Console verification are separate from a private preview. Search ranking and indexing are not guaranteed.

## Verification

```sh
npm run check
npm run test:browser
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
