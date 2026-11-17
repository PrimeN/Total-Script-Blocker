"""Build a reproducible extension archive for Manifest V2 or V3."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import zipfile

ASSET_FOLDERS = ('common', 'css', 'img', 'js', 'rules', 'licenses', '_locales')


def package(root, output):
    root, output = Path(root), Path(output)
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8-sig'))
    version = manifest.get('version', '')
    if not isinstance(version, str) or not re.fullmatch(r'\d+(?:\.\d+){0,3}', version):
        raise ValueError('The manifest needs a numeric extension version.')
    parts = [int(part) for part in version.split('.')]
    if any(part > 65535 for part in parts) or not any(parts):
        raise ValueError('Invalid extension version.')
    if manifest.get('manifest_version') not in (2, 3):
        raise ValueError('Only Manifest V2 and V3 extensions are supported.')

    files = [p for p in root.iterdir() if p.is_file() and not p.name.startswith('.') and (
        p.suffix in ('.js', '.html', '.css') or p.name in ('manifest.json', 'Privacy policy.txt')
        or p.name.lower().startswith(('license', 'copying')))]
    for folder in ASSET_FOLDERS:
        files.extend(p for p in (root / folder).rglob('*') if p.is_file()
                     and not any(part.startswith('.') for part in p.relative_to(root).parts))
    for path in files:
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError('Extension assets must be regular files inside the source tree.')
    names = {p.relative_to(root).as_posix() for p in files}
    references = list(manifest.get('icons', {}).values())
    references += [manifest[key] for key in ('options_page', 'devtools_page') if manifest.get(key)]
    references += list(manifest.get('background', {}).get('scripts', []))
    references += [manifest['background']['page']] if manifest.get('background', {}).get('page') else []
    references += [manifest['background']['service_worker']] if manifest.get('background', {}).get('service_worker') else []
    for action in ('action', 'browser_action', 'page_action'):
        settings = manifest.get(action, {})
        if settings.get('default_popup'):
            references.append(settings['default_popup'])
        icon = settings.get('default_icon', {})
        references += list(icon.values()) if isinstance(icon, dict) else [icon]
    for content in manifest.get('content_scripts', []):
        references += content.get('js', []) + content.get('css', [])
    references += [rule['path'] for rule in manifest.get('declarative_net_request', {}).get('rule_resources', [])]
    for reference in references:
        if reference and reference.lstrip('/') not in names:
            raise ValueError(f'Manifest resource is missing from the package: {reference}')

    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'total-script-blocker-{version}.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
        for path in sorted(set(files)):
            info = zipfile.ZipInfo(path.relative_to(root).as_posix(), (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            target.writestr(info, path.read_bytes(), compresslevel=9)
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / 'SHA256SUMS.txt').write_text(f'{checksum}  {archive.name}\n', encoding='utf-8')
    return version, archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, default=Path('dist'))
    args = parser.parse_args()
    version, archive = package(args.source, args.output)
    print(archive)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as outputs:
            outputs.write(f'version={version}\n')
