# Privacy and permissions

Total Script Blocker needs HTTP/HTTPS site access to enforce domain policies and
explain the domains a page uses. It has no developer-operated server, analytics or
telemetry, and does not upload discovery history to its developer.

## Browser permissions

| Permission | Purpose |
| --- | --- |
| HTTP/HTTPS host access | Apply protection and inspect resource declarations on websites |
| `declarativeNetRequest` | Let the browser enforce request restrictions and append document Content Security Policy |
| `storage` | Save rules and preferences, hold temporary state and support optional Chrome Sync |
| `tabs` | Identify the active website and manage per-tab controls and indicators |
| `webRequest` | Observe resource metadata and browser denials for domain discovery |
| `webNavigation` | Reset discovery state when navigation changes a page |
| `scripting` | Inspect script/frame/object declarations and clear session storage during requested site cleanup |
| `browsingData` | Clear selected per-origin storage and service workers after confirmation |
| `alarms` | Expire timed grants and schedule sync work |
| `offscreen` | Read legacy extension-local settings once during migration |

## What stays in the browser

Saved rules and preferences use extension-local storage. Temporary grants,
pause state, discovered hostnames and cached WOT results use session storage.
Discovery stores hostnames, resource types and evidence labels, not URL paths,
query strings, request bodies or credentials. Lists are bounded and cleared on
navigation changes or tab closure.

WOT credentials remain in trusted extension-local storage and are not exposed to
website content scripts. They are excluded from JSON exports and Chrome Sync.
Remove them using the WOT settings control when no longer needed.

Migration retains a local legacy snapshot for recovery. Uninstalling removes
extension storage and protection.

## Optional external services

**WOT:** clicking a scorecard link opens mywot.com. Inline lookups send the selected
hostname to `scorecard.api.mywot.com` with the credentials you supply. Automatic
lookups are off by default. WOT applies its own privacy policy, account terms and
quotas; an unavailable or low-confidence rating is not proof of safety.

**Chrome Sync:** when enabled, saved rules and protection preferences use Google's
sync service under your browser settings. Temporary grants, pause state,
discovered domains and WOT credentials are excluded. Turning off sync on one
device keeps the remote copy.

## Coverage limits

Enforcement controls HTTP/HTTPS network requests through declarative rules and
appended CSP. Browser enforcement continues while the extension service worker
is asleep. Reload existing pages after policy changes; permissions cannot undo
code that already ran.

Website service-worker or CacheStorage-generated documents can bypass
response-header rules. Non-network documents, file/FTP URLs, browser and extension
pages, and incognito are outside this version's coverage. Site CSP can remain
stricter than extension rules. Script blocking is one browser control, not a
guarantee that a website or file is safe.

[Full privacy policy](<../Privacy policy.txt>) · [Usage guide](usage.md) · [Back to the README](../README.md)
