# Connect Brightwork accounts

The account interface and sync integration are implemented. Live sign-up, email confirmation, password recovery, and database access require your own Supabase project. The checked-in configuration is intentionally empty; the app clearly reports that cloud accounts are not connected and continues working locally.

## 1. Create your project

Create a project in the [Supabase dashboard](https://supabase.com/dashboard). Keep its database password private. Brightwork does not need that password or a server secret in its browser code.

## 2. Set up the private database

Open the project's SQL editor and run these migrations once, in order:

1. [Create private workspaces](../supabase/migrations/202611130001_workspaces.sql).
2. [Guard saves during account switches](../supabase/migrations/202611130002_account_guard.sql).

Together, they create:

- One workspace row per authenticated account, referencing the account ID.
- Row Level Security policies for reading, creating, and updating only the signed-in user's row.
- An atomic save function that checks a revision before changing data, so another device's newer edits cannot be silently overwritten.
- A check that rejects a pending save if the browser switched to another account while it was in flight.
- No anonymous access to workspace data or the save function.

Run [the database isolation checks](../supabase/tests/workspace_access.sql) in the SQL editor afterward. The script creates temporary test users and data inside a transaction and rolls everything back. It should finish without an exception. These checks must be run against the actual project; the JavaScript unit tests do not prove deployed database permissions.

See [Supabase's Row Level Security documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 3. Configure email authentication

Enable the email/password provider in Supabase Auth. Keep email confirmation enabled and set your password policy to require at least 8 characters. The app supports sign-up, sign-in, email confirmation callbacks, reset emails, and choosing a replacement password.

Configure a [custom SMTP sender](https://supabase.com/docs/guides/auth/auth-smtp) before inviting ordinary users. Supabase's default email sender is intended for testing and only sends to authorized project-team addresses. Use a sender/domain you control and verify its delivery.

## 4. Allow the app's redirect URLs

In Auth URL Configuration, set the Site URL to the app's deployed HTTPS URL. Add the exact addresses at which you will use Brightwork to the redirect allowlist, including the trailing slash or `index.html` where applicable.

For local development, allow:

```text
http://127.0.0.1:8000/
http://127.0.0.1:8000/index.html
http://localhost:8000/
http://localhost:8000/index.html
```

Also add the deployed address, such as your GitHub Pages project URL. The app uses its current page address, without a query or fragment, as the return URL. Confirmation and recovery use PKCE: open the email link in the same browser where you requested it.

See [Supabase's redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Connect the public configuration

Find the project URL and **publishable key** in the project's connection/API settings. Set them in [config.js](../config.js):

```javascript
globalThis.BRIGHTWORK_CONFIG = Object.freeze({
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabasePublishableKey: "sb_publishable_YOUR_PUBLIC_KEY"
});
```

These values are intended for browser use and can be committed. Never put a secret key, service_role key, database password, or access token in this file. The app rejects server keys. Older projects can use their public `anon` key.

See [Supabase's API key guide](https://supabase.com/docs/guides/getting-started/api-keys).

## 6. Verify before releasing

1. Run `npm test` and start the app with `npm start`.
2. Sign up, open the confirmation email in the same browser, and sign in.
3. Choose **Bring my local activity** if the existing guest work belongs to you. It is not uploaded automatically. The original guest copy stays on the device.
4. Add/edit/complete/delete tasks and finish a sprint. Wait for **Saved to your account**.
5. Sign in on another browser/device and check tasks, history, theme, focus length, and daily goal.
6. Sign out. The guest view should return without showing private account tasks. A different account must have its own data.
7. Go offline, make changes, refresh, and reconnect. The pending changes should remain and then sync. Use **Sync now** to retry immediately.
8. Request a password reset, open the email in the same browser, and save a new password.
9. Run the database isolation checks and confirm another account and signed-out requests cannot access the first account's row.

Real email delivery, callback URLs, cross-device saving, and deployed access policies remain unverified until the project is connected. The local browser integration checks use the official SDK with a simulated transport; they do not contact a real Supabase project.

## How saving and conflicts work

Signed-in changes save locally immediately and are queued for upload after a short delay. The app also checks for updates on focus, reconnect, and every 30 seconds while visible. Active timers remain specific to each device; completed sprint history syncs.

Every user has separate browser keys and a last-synced baseline. Offline edits are compared with both that baseline and the current cloud revision. Changes to different tasks or different fields merge. Conflicting field edits keep a recovered copy, and a concurrent deletion does not discard another device's edited task. Completed sprint IDs are deduplicated. Preference conflicts use the pending local choice.

Signing out hides the account workspace and restores the guest view. Account caches remain on that device so pending work can recover when the same person signs in again; they are never shown as another account's workspace. Cloud data and offline caches are separate from GitHub source-code syncing.

Continue using Export for independent backups. Cloud saving only confirms a successful server response; it is not a promise of permanent retention or a substitute for provider backups.

## Updating the SDK

The official SDK is pinned in [package.json](../package.json) and copied into [vendor/](../vendor/) so the app shell can open offline without a CDN. After changing its version:

```text
npm ci
npm run vendor
npm test
```

Commit the lockfile, vendor bundle, and license together. The browser bundle is copied without edits, including intentional whitespace inside JavaScript strings.
