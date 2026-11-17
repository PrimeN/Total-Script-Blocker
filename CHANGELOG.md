# Changelog

## [2.0]

Total Script Blocker moves from **Manifest V2 to Manifest V3**, with a rewritten
background service worker, browser-owned declarative blocking rules and an updated
popup and settings interface.

### Added and improved

- **Protection controls:** Trust required, Same-origin and Blocklist modes, with
  separate controls for external scripts, inline scripts/eval, frames, objects and
  worker creation.
- **Website permissions:** global rules or website-only overrides, with parent and
  subdomain handling and editable saved website policies.
- **Temporary grants:** browser-session access or 5-minute, 30-minute and 1-hour
  grants, including extension, expiry and individual revocation controls.
- **Permission editing:** searchable domain lists, filters, bulk selection,
  pending-change review, Apply/Discard actions and permission undo.
- **Domain discovery:** page declarations, request observations and browser/CSP
  denial evidence, with toolbar counts for distinct restricted domains.
- **Optional Chrome Sync:** saved domain rules and preferences, conflict handling
  and a local pre-sync backup. Temporary grants and WOT credentials stay local.
- **Backups and migration:** JSON import/export and migration of supported legacy
  domain lists and preferences when they are available to the updated extension.
- **Optional WOT ratings:** scorecard links and inline lookups using your own WOT
  user ID and API key. Automatic lookups are off by default; ratings do not grant
  script permissions.
- **Site cleanup:** confirmed per-origin storage and service-worker cleanup while
  retaining cookies.
- **Updated interface:** compact toolbar controls, light/dark styling, a settings
  dashboard, refreshed documentation and an interface gallery.

### Compatibility and installation

Requires **Chrome 120+**, or a compatible Chromium browser with the necessary
Manifest V3 APIs. Protection covers supported HTTP/HTTPS pages; browser pages,
file/FTP URLs, incognito and some service-worker/cache-generated documents have
coverage limits described in the documentation.

Download `total-script-blocker-2.0.zip`, extract it, open `chrome://extensions`,
enable Developer mode and select **Load unpacked**. Choose the folder containing
`manifest.json`. `SHA256SUMS.txt` provides the archive's SHA-256 checksum.

Blocking needs no account or API key. WOT lookups and Chrome Sync are optional.
The original Manifest V2 build remains available as
[version 1.0](https://github.com/PrimeN/Total-Script-Blocker/releases/tag/v1.0).

## [1.0]

The original Total Script Blocker release, using **Manifest V2**.

- Control JavaScript, iframes and embedded objects through domain permissions.
- Manage trusted and blocked domains from the toolbar popup and settings page.
- Retain the original extension interface and background-page implementation.

This is the original Manifest V2 version, not the later Manifest V3 rewrite.
It requires a browser that still supports Manifest V2 extensions; current Chrome
versions no longer support this extension format.

Download `total-script-blocker-1.0.zip` and extract it. In a compatible browser,
open the extensions page, enable Developer mode, select **Load unpacked**, and
choose the extracted folder containing `manifest.json`.

`SHA256SUMS.txt` provides the archive's SHA-256 checksum.
