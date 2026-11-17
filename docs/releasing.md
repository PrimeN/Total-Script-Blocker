# Extension builds and releases

Production pushes to `master` (the current production branch) or `main` run the
**Build and release extension** workflow. The same workflow can be started from
the Actions page on either production branch.

The workflow checks packaging, runs JavaScript unit checks when available, and
builds a ZIP containing the extension's runtime files and license notices.
Documentation, tests and repository metadata are excluded. The ZIP and checksum
are available both as an Actions artifact and in the public **Latest build** release.

## Publish a numbered version

1. Update `version` in `manifest.json` when preparing a new version.
2. Add a matching section such as `## [2.0.0]` to `CHANGELOG.md`.
3. Push the reviewed changes to the production branch.

A new manifest version creates a release named `v<version>`, with its changelog
section as the release notes. Without a matching section, the workflow provides
basic version and installation notes.

Existing numbered releases and their assets are preserved. Pushing again without
changing the manifest version refreshes **Latest build** and the Actions artifact
instead of replacing an older numbered release. Only the `latest-build` tag moves.

The workflow uses GitHub's automatic repository token. No additional release token,
external build service or signing secret is required. It creates a load-unpacked
extension ZIP; it does not publish to a browser extension store.

## Build locally

```sh
python3 -m unittest discover -s tests -p 'test_release_packaging.py' -v
python3 scripts/package-release.py
```

The package supports both Manifest V2 and V3. Output is written to `dist/`.
