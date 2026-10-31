# Tracking verification and attribution limits

The existing missing-ad blocker is cleared. The fresh native campaign view is **Enabled, Eligible (Limited)**, with bid-strategy limitation and learning diagnostics. Budget and bidding were not changed by the master work. This does not mean conversion reporting is repaired: the fresh Google Ads form action remains **Misconfigured**, secondary, count One and no value.

## Completed account and browser evidence

The operator accepted and read back the correct RTA **GA4 ↔ Google Ads** link, **Search Console ↔ GA4 and Ads** associations, and **Clarity ↔ Ads and GA4** links; the Clarity GA4 link showed Active. The GA4 `generate_lead` key event was starred, and the event-scoped `interaction_type` custom dimension was created and read back. These are configuration observations, not proof of performance or complete attribution.

One prior explicitly authorised real Zoho enquiry was submitted once. Its exact narrow server acknowledgment was observed, and an independent read-only CRM check found exactly one matching record. Browser network evidence showed **one GA4 `generate_lead` collection request returning 204**, together with the expected native Google Ads form destination/label signals. No contact values, record identifier or test identity are reproduced here. No further real submission was made by the master implementation tests.

| Evidence stage | What was established | What remains unproved |
| --- | --- | --- |
| Application/provider receipt | One exact correlated webform acknowledgment and independent matching CRM record for the approved test | Universal future persistence, spam/approval outcomes, qualification |
| Browser SDK/network | One GA4 lead collection request with 204 and expected Ads destination/label signals | Provider processing, Ads conversion status repair, deduplicated account totals |
| Tag Assistant preview | Four base tags fired once in the earlier connected preview; Microsoft UET was previewed | Live publication of the new UET/event draft, saved Microsoft goal, all future event cases |
| Account configuration | Correct links, GA4 key event and custom dimension read back | Paid-click attribution, report completeness, qualified-lead/revenue joins |
| Campaign serving | Missing-ad issue cleared; currently eligible with limitations | New clicks/leads or improved performance; the inspected prior reporting window excluded the current day |

An SDK acknowledgment is not a processed Ads report. A native destination signal is not proof of a paid, attributed conversion. No GCLID-based paid-click attribution was demonstrated; no conversion/revenue totals are inferred from this test.

## Current container versus prepared draft

Live GTM **version 3 remains unchanged**. A native **version-4 draft** contains 15 tags, 7 triggers and one custom data-layer variable. It was exported and semantically audited; it was **not published**. Its deliberate delta includes pausing the legacy DOM/contact bridge, additional fixed GA4 intent/AI events and Microsoft UET base/accepted-form events. Existing destinations and lead labels were retained. The AI event's only new GA4 parameter is the native `interaction_type` data-layer variable; no form text/transcript is mapped.

The **new master frontend plan retains live version 3**, leaves new source activation flags false and does not bundle version 4 for automatic publication. The earlier draft and paired-release proposal are a separate reviewed change, not permission to publish it. If bridge ownership or consent is changed later, reconcile a fresh native workspace export and source contract; validate one event owner, all purpose gates and rollback together before explicit approval.

The Microsoft conversion-goal creation flow remains **unsaved**, awaiting the user's “No enhanced conversions” selection. UET preview evidence therefore must not be described as a completed Microsoft conversion setup. No new Microsoft paid campaign was launched.

## Event meanings

| Event or outcome | Meaning | Conversion boundary |
| --- | --- | --- |
| `contact_form_success` | Exact configured provider acknowledgment for one correlated current-form attempt | Browser acknowledgment; future CRM acceptance must not be assumed |
| `generate_lead` | GA4 event mapped from that acknowledged form event | Tested browser delivery; Ads attribution/goal status still unresolved |
| `telephone_click`, `email_click`, `whatsapp_click` | Contact-link intent | Not a completed call, sent message or accepted enquiry |
| `ai_engagement` | Bounded assistant state such as open, voice started/ended or error | Not a chatbot/voice lead; no accepted-lead callback contract exists |
| `request_quote`, `service_enquiry`, `company_profile_download` | Prepared purpose-gated CTA click hooks | No proof of submitted quotation, delivered request or completed download |
| Server queued | Durable intake awaiting delivery, `accepted:false` | Never a conversion |
| Server CRM accepted | Verified authenticated record-level receipt | Disabled future path; one owner required before transport activation |
| Qualified / visit / quotation / closed won | Verified authenticated lifecycle facts | Requires actual CRM/HUB fields, replay protection and joins |

No duplicate native Ads plus GA4-import primary goal is introduced here. Goal selection must be reviewed once actual processing is visible, with one intentional bidding outcome per accepted enquiry. No event value, enhanced-conversion contact payload or revenue was fabricated.

## Privacy and remaining checks

The preserved adapter does not read form values or request bodies, send PII, start voice recording or manufacture success from visible splash text. It requires the exact configured form, endpoint, HTTP/JSON acknowledgment and one consumed attempt. The exact profile is narrowly grounded in the approved test, not a universal Zoho API contract. See [source tracking contract](../../website/TRACKING.md).

New consent/attribution/server capture remains disabled. The unchanged live container and third-party services are not claimed newly consent-gated by disabled source. Before any activation: verify all vendor tag purposes, GTM synchronous consent timing, sanitized location/referrer behavior, UET and Clarity behavior, current policy text and one-provider form ownership. Then test real browser behavior separately from provider reports; use an explicitly authorised enquiry only if needed. Existing successful proof is preserved without generating another test lead automatically.

The private dashboard does not receive credentials, customer records or synthetic performance data. It distinguishes configured tags, platform-reported conversions and accepted CRM enquiries; unavailable data stays unavailable. This is the necessary basis for measuring stronger campaigns without counting intents as qualified leads.
