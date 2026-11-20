# Registration and AITU accounts

The local preview enables real self-registration by default. Sign out, choose
Create an account, and enter a name, email and a password of at least 12 characters.
The account is persisted in the active database; signing in again uses that password.
Self-registration grants student access only. Teacher privileges require administrator
provisioning. Email ownership is not yet verified. For the PostgreSQL server set
`UB_ALLOW_REGISTRATION=1` explicitly; do not expose public registration without
planning email verification, recovery and abuse controls.

University accounts is available to both roles. It saves a separate username/email
for DU, LMS and MyDU, scoped to the signed-in user. Users can edit or remove these
declarations. They survive logout and restart. No university passwords or tokens
are collected, and every account declaration remains pending. Opening the official
website does not connect its session to UniBridgeAI.

For user-controlled imports without university-wide credentials, the desktop
application opens supported sites in a separate embedded Tauri webview. The user
signs in on the official site, presses an in-page UniBridgeAI button, reviews and
edits the page text, then sends a one-use snapshot into their account. The snapshot
is private and pending until the user accepts it. Cloud analysis requires explicit
consent. Passwords and cookies are not read. The browser window gets only one
narrow Tauri command to submit a page snapshot; there is no background page scan.

This flow runs only in the installed Windows/macOS desktop app, not the localhost
web preview. One code lasts ten minutes and imports one page. Capture another
page by opening it through UniBridgeAI again. SSO/MFA redirects and platform page
layouts need testing on real accounts. This is manual page import, not continuous
account synchronization.

An optional Chromium extension is available in `browser-extension/` as a file-based
alternative. It displays the same review-before-capture flow, saves a JSON file
locally, and does not send data over the network. Import that file from the
Browser Imports section in UniBridgeAI; the snapshot is still pending until the
user accepts it.

## Completing the integration

Ask AITU IT for an approved external application registration and documented data
API scopes for the three systems. Needed configuration includes issuer/tenant,
client ID, redirect URIs, allowed scopes and API documentation. The university
must determine which permissions can be granted by individual users and which
require administrator consent. Shared Microsoft login alone does not grant access
to university records.

If AITU later supports user-delegated authorization, implement authorization code
flow with PKCE, state and nonce validation, token validation and a stable
issuer/subject identifier. Store refresh tokens encrypted server-side, support
revocation and reauthentication, and request minimum scopes.

Then add separate API adapters, permission-scoped reads, provenance and sync times,
preview of imported changes, explicit confirmation and deduplication. University
passwords and session cookies must never be sent to the AI provider. Without an
approved connector, use exports uploaded by the user; do not label saved login
hints as authenticated connections or promise persistent access from a password.
