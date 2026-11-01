# Microsoft enhanced conversions preparation — 1 November 2026

Scope: rtacontractor.ae only. This implements the user's supplied UET PID example
as an optional, explicitly consented, hash-only adapter. Production remains on
frontend commit `dae940bcd87b2763288fa41b07770b7ef6f2ac45` and GTM version 3.
All new UET, matching and consent activation flags remain false. The sample
contact values were not installed or sent anywhere.

## Implementation and evidence

- Exact public Zoho script returned HTTP 200 and exposed form
  `webform5653678000076526082` with `Email` and `Mobile`; `Phone` was absent.
  This was a read-only fetch, not a form submission.
- Submission-time capture requires a real UET instance, configured readiness
  gates, managed/known advertising permission and a separate Microsoft matching
  opt-in. Two-purpose legacy consent never supplies the new permission.
- Email normalization follows Microsoft's published rules. Mobile values require
  an explicit international prefix. Web Crypto hashes valid values with SHA-256;
  examples/placeholders are rejected and missing fields are explicitly empty.
- The existing exact Zoho acknowledgment remains the success boundary. PID and
  the existing lead event are dispatched together; no second conversion event,
  extra SDK loader, CRM request or contact field in dataLayer is introduced.
- Pending identifiers expire, are discarded on failure/supersession/withdrawal,
  and are never stored in browser persistence or logs. A 250-ms hash deadline
  preserves the regular conversion when matching is unavailable. A fallback
  conversion clears any previously assigned PID, including out-of-order receipts.
- Separate opt-in controls, withdrawal and conditional privacy disclosure are
  implemented. Google ad_user_data and personalization remain denied. The default
  two-purpose controller behavior remains unchanged while the new flag is false.

## Validation and limits

Build passed; 2,203 static checks and 59 tracking/consent/build-policy tests passed.
Tests use local synthetic values and mocked providers; no real enquiry or vendor
collection was performed. Coverage includes denial, migration, placeholders,
hashing, rejected responses, cancellation/timeout, duplicate callbacks,
PID-before-event ordering and out-of-order identity separation.

These checks do not establish live UET installation, saved goal configuration,
production consent behavior, processed Microsoft conversions or improved Google
Ads performance. The Microsoft goal was unsaved at the last native review.

## Remaining coordinated activation

Verify/save the Microsoft enhanced-conversion goal for UET `187284886`, freshly
review GTM consent gates and one conversion owner, validate a connected preview,
then prepare a new frozen website/GTM release and paired rollback for approval.
The previous approved frontend deployment plan must not be reused for this new
privacy/vendor scope. No server, GTM, campaign, budget or account setting was
changed by this code preparation.

Reference: [Microsoft enhanced conversions](https://learn.microsoft.com/en-us/advertising/msa-help/hlp_ba_conc_uet_enhancedconversions).
