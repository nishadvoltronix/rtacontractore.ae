# RTA application tracking adapter

This source asset emits application events into the existing data layer. It does not
load Google, Clarity, Microsoft UET, Meta or LinkedIn scripts, change consent state,
submit or rewrite requests or start voice calls. With the default configuration
it does not inspect form values. The separately gated Microsoft PID helper below
can read only the verified Email and Mobile fields after a specific visitor opt-in.
Google and Clarity remain managed by `GTM-PRV2VCLK`. Destination IDs in
`tracking.config.mjs` are public metadata; optional destinations are disabled.

## Optional Microsoft enhanced conversions

The supplied Microsoft `pid` example is implemented without its sample contact
values. `assets/uet-enhanced-conversions.js` remains disabled by default. It uses
Microsoft's documented `set` command before the existing GTM conversion event;
it emits no second conversion and loads no vendor SDK. The generated tracking
entry pins the helper's content hash for the site's static cache policy.

The public Zoho form script was read without submitting an enquiry on
1 November 2026: the exact form exposes `Email` and `Mobile`, not `Phone`.
Only those two fields are read at the correlated submit, while a managed, known
advertising choice and separate `microsoftEnhancedConversions: true` are present.
Advertising measurement alone and old saved choices never grant matching.

Values are normalized using Microsoft's documented email rules, the phone must
carry an explicit international prefix, and each valid value is SHA-256 hashed
with Web Crypto. No contact value or hash enters dataLayer, local/session storage,
URLs, logs, or a new application request. Missing/invalid fields are empty; known
Microsoft/example placeholders are rejected. Hashes are still personal data.

The private submission payload expires after the configured 10-second submit
window, or sooner on failure, supersession or consent change. The exact Zoho
response validator remains the success boundary. Successful PID assignment
precedes the single existing `contact_form_success` event. A crypto failure or
250-ms confirmation timeout cannot prevent the regular event. Assigned PID is
cleared when a new submission starts or the visitor withdraws matching; the
consent controller reloads an already active document after withdrawal. Microsoft
receives PID for subsequent events on that page under its documented `set`
semantics. Withdrawal cannot erase data previously received by a vendor.

Activation is a coordinated release, not a flag to toggle in isolation:

1. Create/save or verify an enhanced-conversion goal in Microsoft Advertising
   for verified UET `187284886`; the last native review left that flow unsaved.
2. Re-export/review GTM and establish granular purpose gates and safe URLs. The
   old version-4 draft is not sufficient proof of a consent-ready release.
   Retain exactly one UET base and the existing accepted-form event tag.
3. Approve the source/GTM/consent release and paired rollback, then set the
   reviewed marketing readiness gates and `microsoftEnhancedConversionsEnabled`.
   Set the UET destination and enhanced conversion `enabled`, `baseTagVerified`,
   and `goalVerified` only after their evidence is available. No activation flag
   or production setting was changed during this implementation.
4. Verify the loaded UET instance, separate opt-in, rejection/withdrawal, hash-only
   PID before the single event, and Microsoft goal processing using the vendor
   tools. Use mocked data until a separate real enquiry test is authorized.

Rollback restores the matching pre-release website and GTM versions together.
The currently deployed frontend remains commit `dae940bcd87b`; this preparation
does not deploy code or publish GTM. Google `ad_user_data` and personalization
remain denied even if the Microsoft-only matching purpose is later enabled.

Reference: [Microsoft enhanced conversions](https://learn.microsoft.com/en-us/advertising/msa-help/hlp_ba_conc_uet_enhancedconversions).

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
| `contact_form_success` | Verified provider acknowledgment for one correlated attempt |
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
This correlation is temporal: it does not inspect a provider form token or prove
which CRM record a future request creates.
It delegates fetch's original arguments and `this` unchanged, returns the identical
promise, and inspects the response clone in a swallowed sidechain. Application
response/error handling is not replaced or delayed by waiting for measurement.

The observer passes the correlated response to `confirmProviderReceipt` before
later promise handlers consume the original body. The configured
`rta-zoho-splash-ack-v1` acceptance profile is limited to the exact RTA form ID and
endpoint above. It requires HTTP 2xx, an `application/json` response, and a plain
JSON object with exactly these two own keys and configured values:

```json
{"actionvalue":"Thank you for your response.","actionsubmit":"Splash Message"}
```

Member order is immaterial. Extra keys (including success, error, CAPTCHA or
status fields), missing keys, changed message/action, other shapes, changed
endpoint, non-JSON content or unsuccessful HTTP status all fail closed. There is
no fallback to the generic success-flag validator for this configured profile.
Unknown or invalid profiles disable form observation and attempt creation.
The reviewed form binding/profile is snapshotted when installed, and the verified
positive values remain pinned while response JSON is read. Mutating a caller's
configuration after setup cannot downgrade the profile or change its form scope.
The attempt is consumed once, including concurrent callbacks; a retry request
needs a new attempt token.

This exact server receipt was observed in an authorized production enquiry on
31 October 2026 at 20:37:45 UTC (1 November in Dubai): the exact endpoint returned HTTP 200 with
`Content-Type: application/json;charset=UTF-8`. Independent read-only CRM
verification found exactly one matching test record created at 20:37:47 UTC,
with all approved test fields matching. No contact values or record identifiers
are included here. This evidence supports this specific acknowledgment profile;
it is not a published universal Zoho response schema.

An application-owned integration can instead set `form.observeFetch: false` and
call `beginFormAttempt`/`confirmProviderReceipt` directly around its actual request.
Do not run both integration paths for the same request. `getStatus()` exposes
whether automatic observation installed, including `fetch_unavailable`,
`fetch_not_replaceable`, or `unsupported_fetch_result` failures. Its
`formAcceptanceProfile` status gives the active profile, readiness, reason and
`provider_acknowledgment` boundary. Contact intent and assistant engagement remain
independent of form receipt acceptance.

Without `form.acceptanceProfile` (strictly `undefined`), the reusable validator
keeps its generic default: `success === true`, a recognized positive
`actionsubmit`, and no error/CAPTCHA or unsuccessful status flags. A configured
unknown profile never selects that default. The exported validator accepts
`validateZohoWebformResponse(response, endpoint, {formId, acceptanceProfile})`;
its two-argument form uses only the generic strict-boolean default.

Any change to the configured acknowledgment, form or endpoint requires a new
authorized provider-response/CRM verification before accepting a new profile.
Do not loosen the predicate based on DOM splash text, redirects, HTTP 200 alone,
an internal callback or a synthetic test fixture. The updated source integration
still requires reviewed build/test results and explicit deployment authorization.

An accepted webform response is not proof of CRM persistence or a qualified lead:
Zoho approval, spam filtering and double opt-in can affect subsequent processing.
See [Zoho's webform setup guidance](https://help.zoho.com/portal/en/kb/crm/connect-with-customers/webforms/articles/set-up-web-forms).
The generic strict-boolean predicate is a conservative implementation rule
inferred from the public embed handler, not a published guarantee of this
endpoint's schema. The configured RTA profile establishes a server acknowledgment,
not a promise that future submissions will persist, qualify or receive follow-up.

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
