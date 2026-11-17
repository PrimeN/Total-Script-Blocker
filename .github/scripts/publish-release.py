"""Publish immutable numbered releases and a separate rolling build."""
from pathlib import Path
import json
import hashlib
import os
import re
import subprocess
import tempfile


def command(*args, **kwargs):
    result = subprocess.run(['gh', *args], text=True, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout


def api(path, method='GET', body=None, missing_ok=False):
    args = ['gh', 'api', '--method', method, path]
    if body is not None:
        args += ['--input', '-']
    result = subprocess.run(args, input=json.dumps(body) if body is not None else None,
                            text=True, capture_output=True)
    if result.returncode:
        if missing_ok and 'HTTP 404' in result.stderr:
            return None
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout) if result.stdout.strip() else None


def release_notes(version, manifest_version, changelog):
    heading = re.search(r'^## \[' + re.escape(version) + r'\][^\n]*\n', changelog, re.MULTILINE)
    if heading:
        return re.split(r'^## ', changelog[heading.end():], maxsplit=1, flags=re.MULTILINE)[0].strip()
    return (f'Total Script Blocker {version}, using Manifest V{manifest_version}.\n\n'
            'Download the extension ZIP, extract it, then open chrome://extensions, enable '
            'Developer mode and use Load unpacked to select the folder containing manifest.json.')


def verify_assets(archive, checksums):
    expected = f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}'
    if checksums.read_text(encoding='utf-8').strip() != expected:
        raise ValueError('The release archive does not match its SHA-256 checksum.')


def publish():
    root = Path(__file__).resolve().parents[2]
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8-sig'))
    version = manifest['version']
    if not re.fullmatch(r'\d+(?:\.\d+){0,3}', version):
        raise ValueError('Invalid release version.')
    repo, sha = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA']
    archive = root / 'dist' / f'total-script-blocker-{version}.zip'
    checksums = root / 'dist' / 'SHA256SUMS.txt'
    if not archive.is_file() or not checksums.is_file():
        raise ValueError('The validated release ZIP and checksum are required.')
    verify_assets(archive, checksums)
    tag = f'v{version}'
    changelog = root / 'CHANGELOG.md'
    notes = release_notes(version, manifest['manifest_version'], changelog.read_text() if changelog.exists() else '')
    prefix = f'repos/{repo}'
    with tempfile.TemporaryDirectory() as temporary:
        notes_file = Path(temporary) / 'release-notes.md'
        notes_file.write_text(notes + '\n', encoding='utf-8')
        existing = api(f'{prefix}/releases/tags/{tag}', missing_ok=True)
        if existing is None:
            ref = api(f'{prefix}/git/ref/tags/{tag}', missing_ok=True)
            if ref is not None and (ref['object']['type'] != 'commit' or ref['object']['sha'] != sha):
                raise RuntimeError(f'{tag} already points to another commit; it will not be moved.')
            command('release', 'create', tag, str(archive), str(checksums), '--repo', repo,
                    '--target', sha, '--title', f'Total Script Blocker {version}',
                    '--notes-file', str(notes_file), '--latest')
            print(f'Published {tag}.')
        else:
            print(f'Preserving published release {tag}; the current package is available in Latest build.')

        notes_file.write_text(f'Latest production build of Total Script Blocker {version}.\n\n'
                              f'Source commit: {sha}\n\n'
                              'This download updates on production pushes. Numbered releases remain unchanged.\n\n'
                              + notes + '\n', encoding='utf-8')
        rolling = api(f'{prefix}/releases/tags/latest-build', missing_ok=True)
        if rolling is None:
            command('release', 'create', 'latest-build', str(archive), str(checksums), '--repo', repo,
                    '--target', sha, '--title', 'Latest build', '--prerelease', '--notes-file', str(notes_file))
        else:
            api(f'{prefix}/git/refs/tags/latest-build', 'PATCH', {'sha': sha, 'force': True})
            command('release', 'upload', 'latest-build', str(archive), str(checksums), '--repo', repo, '--clobber')
            command('release', 'edit', 'latest-build', '--repo', repo, '--title', 'Latest build',
                    '--prerelease', '--notes-file', str(notes_file))
            for asset in rolling.get('assets', []):
                name = asset['name']
                if name.startswith('total-script-blocker-') and name.endswith('.zip') and name != archive.name:
                    api(f'{prefix}/releases/assets/{asset["id"]}', 'DELETE')
        print('Published Latest build.')


if __name__ == '__main__':
    publish()
