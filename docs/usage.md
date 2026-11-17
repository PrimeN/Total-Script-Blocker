# Using Total Script Blocker

## Read the toolbar popup

The current website appears above the discovered domains. Each domain has a
permission selector, status label and expandable details. Search or filter the
list to find restricted, trusted or temporary entries.

Counters summarize domain permissions, not individual blocked requests. Details
distinguish page declarations, observed requests, completed responses and
browser/CSP denials. These observations do not prove that a script executed;
denials can also come from a website policy or another extension.

## Apply permission changes

Choose a permission beside a domain, or select several rows and use the bulk
buttons. Changes stay pending until **Apply changes**. **Discard** clears pending
edits. The reload preference controls whether the active tab reloads afterwards.

Use **Permission scope & duration → Undo last permission change** to restore the
previous saved policy. Reload affected pages: restoring a policy cannot undo code
that already ran.

| Permission | Behaviour |
| --- | --- |
| **Trust** | Permanently allow a domain and its subdomains within the chosen scope |
| **Session** | Temporarily allow a domain across websites until the session ends or its selected duration expires |
| **Block** | Add an explicit denial; a matching temporary grant can still override it |
| **Inherit** | Remove an exact rule so a parent rule or default policy applies again |

Blocking a child domain can preserve permanent trust for its parent and siblings.
Granting a domain can replace overlapping rules. Review parent grants when
changing subdomains, particularly temporary permissions.

## Choose scope and duration

Expand **Permission scope & duration**:

- **All websites:** update global domain permissions.
- **Only this website:** allow or block domains for the current website context.
  These rules apply to its hostname and subdomains in the tab; embedded documents
  on other hosts retain global rules.
- **Temporary grant duration:** Browser session, 5 minutes, 30 minutes or 1 hour.
  Temporary grants apply globally, regardless of the website scope selector.

Settings also includes an editor for saved website policies. Edit or delete them,
then save the changes.

## Select a protection mode

| Mode | Behaviour |
| --- | --- |
| **Trust required** | The default: untrusted documents and resource domains need permission |
| **Same-origin** | Permit each document's inline code and own-origin resources; unrelated origins still need permission |
| **Blocklist** | Permit unlisted domains and restrict explicitly denied domains |

Separate Settings controls cover external scripts, inline scripts/eval, frames,
objects/embeds and worker creation. Turning off a control reduces that restriction.
Website CSP can remain stricter than your extension settings.

**Pause** suspends extension protection across tabs. Resume from the same button.
Temporary grants and pause state end when the browser session ends or the extension
is reloaded. Background Chrome processes can keep a session alive after windows close.

## Back up and sync

**Export saved settings** creates a JSON file of saved rules and protection
preferences. Use **Import JSON** to load it. WOT credentials and temporary
permissions are excluded.

Chrome Sync is optional and enabled separately on each device. Use the same
extension identity and enable extension syncing in Chrome. Choose **This device's
saved settings** or **The synced settings** when starting sync or resolving a
conflict. Choosing a copy replaces the other settings.

Before applying incoming settings, the extension keeps a local backup.
**Restore pre-sync backup** restores that copy and turns off sync on this device.
Turning sync off does not delete the remote copy. Capacity errors leave local
protection in place; reduce the lists or export a manual backup.

## Use WOT optionally

Expand a domain's details to open its scorecard or select **Check WOT**.
Scorecard links need no API credentials. Inline ratings need your own user ID
and API key from [WOT developer access](https://www.mywot.com/developers).

Enter credentials in **Settings → WOT reputation**. Automatic checks are off by
default; enabling them checks the first 20 matching domains while the popup is
open. Results are cached locally for 30 minutes within the browser session.
Provider quotas and terms apply. Ratings never change permissions automatically.

## Clear site data or recover

**More actions & coverage → Clear site storage** asks for confirmation before
clearing local/session storage, IndexedDB, CacheStorage and service workers for
the current origin. Cookies and saved extension permissions are retained.

If controls appear stale, rescan or reload the page. Settings offers **Reload
extension** and **Reset blocking settings** under Coverage & recovery. Reset
clears blocking preferences and rules; WOT credentials have a separate removal control.

[Privacy and permissions](privacy-and-permissions.md) · [Back to the README](../README.md)
