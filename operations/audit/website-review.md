# Website improvement report

The retained architecture is a Node-generated static website. No production framework migration or new browser dependency was introduced. The shared layout, factual business identity, service content and generated pages remain in the existing website structure. The current source produces **19 indexable pages**, plus a noindex recovery page; **10 pages are new**.

## Page map

| Canonical route | Change | Purpose and evidence boundary |
| --- | --- | --- |
| `/` | Improved | Clear company/service introduction and three buyer starting points; unsupported work-topic gallery removed |
| `/services/` | New | Service and enquiry-topic index |
| `/about/` | New | Independent legal company, published contact/location and qualification context |
| `/services/street-lighting/` | Improved | Primary landing page; conditional road-lighting scope, limits and tunnel exclusion retained |
| `/services/underground-cabling/` | Improved | Cabling scope and project interfaces |
| `/services/electrical-infrastructure/` | Improved | Electrical infrastructure scope and interfaces |
| `/services/high-mast-area-lighting/` | Improved | Specialist enquiry topic; capability/availability requires confirmation |
| `/services/led-solar-lighting/` | Improved | Specialist enquiry topic; no inherited blanket RTA qualification |
| `/services/lighting-maintenance/` | Improved | Enquiry topic; actual scope/availability requires confirmation |
| `/request-a-quote/` | New | Accessible quotation path, provider embed and downloadable project-brief checklist |
| `/contact/` | New | Published business contacts, provider form and fallback channels |
| `/faqs/` | New | Visible technical/customer questions and local filter; no query analytics |
| `/knowledge/` | New | Three practical buyer guides |
| `/knowledge/street-lighting-quotation-checklist/` | New | Drawings, quantities, scope and interface preparation |
| `/knowledge/lighting-handover-checklist/` | New | Project-specific handover planning; not universal regulatory advice |
| `/knowledge/contractor-qualification-and-project-approvals/` | New | Distinguishes company qualification from project approvals |
| `/privacy/` | Improved | Existing privacy information and accurate activation boundaries |
| `/cookies/` | New | Current services and privacy controls; no claim all third-party connections are blocked |
| `/photography/` | Retained | Photograph sources, credits and representative-image context |

`/404.html` is noindex and provides service, contact, quotation and guide recovery links. It is not included among the 19 indexable routes. Each public route uses an HTTPS apex canonical with a trailing slash; the existing public verification file is preserved.

## Implemented locally

- Retained the corporate colours, Manrope typography, existing logo and photographs. Added clear Services, About, Resources, Contact and quotation navigation, keyboard-accessible disclosures, responsive layouts and consistent company/footer details.
- Replaced the eight unsupported work-topic cards with documented buyer paths. Removed scroll-reveal dependence so content is available in normal document flow. Background video loads only after the visitor chooses playback.
- Replaced authority-logo animation with qualification, company-profile and planning resources. Representative images remain labelled; no invented project/client/testimonial or endorsement is presented.
- Added unique titles/descriptions, canonical and social metadata, semantic headings, crawlable links, breadcrumbs and JSON-LD describing visible facts. AboutPage, ContactPage, CollectionPage, guide Article and visible FAQ content supplement the existing scoped business/service graph. No fabricated ratings or article dates were added.
- Generated the 19-route sitemap; retained public robots access and static HTML content. These establish technical readiness, not indexing, rankings or AI citations.
- Retained the synchronous Zoho embed and fallback contacts. Contact/quotation pages include that provider once per page. Existing tracking/contact-widget baseline files remain preserved; new attribution, consent and lead code is disabled.
- Added a downloadable text project brief. Allowlisted service slugs select explanatory quotation context; arbitrary query values are not reflected and provider-required fields are not rewritten.

## Deliberately deferred content

No Projects page, invented case studies, testimonials, standalone NOC/approval service, generic civil/road-works service expansion or industry-capability claims were manufactured. Publish these only after confirming actual delivery scope, current credentials, client/image permission and useful evidence. The existing electrical-infrastructure page covers supported road-lighting interfaces; it is not a new blanket road/civil capability claim.

Terms and Conditions remain deferred for actual commercial/legal terms approved by the owner. The cookie page is an information page, not proof of an activated consent regime. Current RTA portal standing and renewed ISO material remain owner actions. A qualification record does not grant project approvals or make this an official government website.

## Source locations and checks

Primary implementation is in [shared build](../../website/scripts/build.mjs), [editorial pages](../../website/page-content.mjs), [business identity](../../website/site.config.mjs), [services](../../website/services.mjs), [primary service content](../../website/street-lighting-content.mjs), [primary template](../../website/templates/street-lighting.mjs), and the CSS/JavaScript assets under `website/dist/assets/`. [Website review evidence](../../website/WEBSITE-REVIEW-20261101.txt) records local browser/test scope and screenshot locations.

The local website suite reports 338 assertions, retained browser regressions 251, primary service regressions 353, contact widgets 19, buyer paths 122 and final integration smoke 25. Thirty-eight axe scans reported no serious or critical violations. These isolated local checks use provider stubs and send no enquiry; they do not prove live provider delivery, legal compliance, real-user Core Web Vitals or search indexing. See [deployment validation](deployment-and-validation.md) for release limitations.
