# RTA application tracking adapter

This source asset emits application events into the existing data layer. It does not
load Google, Clarity, Microsoft UET, Meta or LinkedIn scripts, change consent state,
submit or rewrite requests, inspect form values or start voice calls.
Google and Clarity remain managed by `GTM-PRV2VCLK`. Destination IDs in
`tracking.config.mjs` are public metadata; optional destinations are disabled.

## Layout integration

The shared build imports `trackingConfig` from `website/tracking.config.mjs` and
serializes it into a script of type `application/json` with ID
`rta-tracking-config`, escaping `<` as `\u003c`. It loads `/assets/tracking.js` as
a module in the document head after that configuration node, with a content-hash
query like other retained assets. The verified GTM head and body snippets appear
exactly once.

A non-async module/deferred script executes before DOM Ready. This adapter claims
the existing `window.__rtaGtmEventsInstalled` guard; the existing GTM DOM Ready
bridge then exits. If the legacy bridge already owns the guard, installation fails
with `existing_bridge_owns_tracking` and attaches no second owner. Do not clear the
guard to force installation. On the next build, `enabled: false` removes both GTM
snippets and the adapter's configuration/module from the generated pages. It is
not an adapter-only rollback. To preserve the existing Google/Clarity loading
during rollback, restore the prechange build/served-dist backup, including its
existing GTM snippets, rather than toggling `enabled`.

The installer exposes `window.RTATracking`. Its public methods are:

- `trackIntent('telephone_click' | 'email_click' | 'whatsapp_click')`.
- `trackAIEngagement('open' | 'voice_started' | 'voice_ended' | 'error', {state, duration})`.
- `beginFormAttempt('webform5653678000076526082')`, returning an opaque in-memory attempt token.
- `confirmProviderReceipt({provider: 'zoho_webform', attemptId, response})`, returning
  a promise with `{accepted, emitted, reason}`. `response` is the original Fetch
  Response; validation reads its clone without consuming it.
- `getStatus()`.

The module also exports `installTracking`, `bootTrackingFromDocument`, `EVENTS`
and `validateZohoWebformResponse` for direct integration and local testing.

## Existing event contract

| Event | Meaning |
| --- | --- |
| `telephone_click` | Telephone-link intent, not a completed call |
| `email_click` | Email-link intent, not a sent enquiry |
| `whatsapp_click` | WhatsApp-link intent, not a conversation |
| `contact_form_success` | Explicit accepted provider response for one correlated attempt |
| `ai_engagement` | Assistant interaction, never a confirmed lead |

Core contact events retain the exact existing payload `{event: eventName}`.
Attempt tokens, provider responses and receipt/record IDs are not sent to analytics.
Assistant metadata is restricted to enumerated interaction/state names and bounded
duration. Raw transcripts, contact details, form text and arbitrary URL parameters
are never added by this adapter.

## Automatic form response observation and acceptance boundary

The remote Zoho embed owns the form's submission handler. Its public code posts to
`https://crm.zoho.com/crm/WebToLeadForm` and can display `#wf_splash` or invoke the
internal `wfa_post_submit` hook without checking `response.ok` or `data.success`.
Neither splash text, that hook, a redirect nor HTTP 200 alone is used here.

With `form.observeFetch: true`, a capture-phase submit on the exact configured
FORM ID arms one attempt for `form.submitTtlMs` (10 seconds in the public config).
Only the next exact `https://crm.zoho.com/crm/WebToLeadForm` POST within that window
claims it. Other requests, validation failures that make no POST, expired attempts
and unsupported request shapes cannot emit a lead. The observer reads URL/method
metadata only; it does not read the request body, form values, headers or tokens.
It delegates fetch's original arguments and `this` unchanged, returns the identical
promise, and inspects the response clone in a swallowed sidechain. Application
response/error handling is not replaced or delayed by waiting for measurement.

The observer passes the correlated response to `confirmProviderReceipt` before
later promise handlers consume the original body. The acceptance predicate
requires the configured response origin/path, HTTP 2xx, JSON object,
`success === true`, a recognized positive `actionsubmit`, and no error/CAPTCHA flags.
Missing or changed response contracts fail closed. The attempt is consumed once,
including concurrent callbacks; a retry request needs a new attempt token.

An application-owned integration can instead set `form.observeFetch: false` and
call `beginFormAttempt`/`confirmProviderReceipt` directly around its actual request.
Do not run both integration paths for the same request. `getStatus()` exposes
whether automatic observation installed, including `fetch_unavailable`,
`fetch_not_replaceable`, or `unsupported_fetch_result` failures.

**Deployment remains gated on an authorized real enquiry.** Splash-based lead
tracking is deliberately removed. If the actual Zoho response omits strict
`success: true`, it fails closed and no form conversion fires. Contact intent and
assistant engagement continue. Do not loosen the predicate based only on splash
text, redirects, HTTP 200 or a synthetic test fixture.

An accepted webform response is not proof of CRM persistence or a qualified lead:
Zoho approval, spam filtering and double opt-in can affect subsequent processing.
See [Zoho's webform setup guidance](https://help.zoho.com/portal/en/kb/crm/connect-with-customers/webforms/articles/set-up-web-forms).
The strict boolean predicate is a conservative implementation rule inferred from
the public embed handler, not a published guarantee of this endpoint's schema.

## Assistant boundary

The current Talk2Maries v1.0.1 widget emits `talk2maries:open`, `state`, `close`
and `closed` with state/duration. This adapter listens without opening the widget
or accessing microphone, messages or transcripts. It emits at most one observed
voice-start and one voice-end per open cycle. The widget exposes no accepted-lead
receipt callback; all these interactions remain engagement only.

## Local verification

Run `node --test website/scripts/tracking.test.mjs` and
`node --check website/dist/assets/tracking.js`. These tests make no network calls
and send no enquiries. Run the existing build/static and local browser suites,
with provider requests stubbed as the repository requires.
Separately verify real provider acceptance only through an authorized enquiry.
