import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


packager = load('release_package', ROOT / 'scripts/package-release.py')
publisher = load('release_publisher', ROOT / '.github/scripts/publish-release.py')


class ReleasePackaging(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name) / 'source'
        self.root.mkdir()
        self.output = Path(self.directory.name) / 'output'

    def write(self, name, data='runtime'):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data, encoding='utf-8')

    def manifest(self, version='1.0', **extra):
        self.write('manifest.json', json.dumps({'manifest_version': 2, 'version': version, **extra}))

    def test_legacy_runtime_and_notices_are_included_without_repository_files(self):
        self.manifest(background={'page': 'background.html'})
        runtime = ['background.html', 'background.js', 'common/common.js', 'common/sjcl.js',
                   'css/theme.css', 'js/library.js', 'img/icon.png', 'LICENSE', 'License.txt',
                   'Privacy policy.txt']
        excluded = ['README.md', 'docs/screenshots/popup.png', 'tests/example.js', '.git/config',
                    '.github/workflows/release.yml', 'signing.pem', 'settings.json', 'img/.private']
        for name in runtime + excluded:
            self.write(name)
        version, archive = packager.package(self.root, self.output)
        self.assertEqual(version, '1.0')
        self.assertEqual(archive.name, 'total-script-blocker-1.0.zip')
        with zipfile.ZipFile(archive) as contents:
            self.assertEqual(set(contents.namelist()), {'manifest.json', *runtime})
            self.assertEqual(contents.read('manifest.json'), (self.root / 'manifest.json').read_bytes())
        checksum, name = (self.output / 'SHA256SUMS.txt').read_text().split()
        self.assertEqual(checksum, hashlib.sha256(archive.read_bytes()).hexdigest())
        self.assertEqual(name, archive.name)

    def test_manifest_v3_background_icons_and_rules_are_packaged(self):
        self.manifest('2.0.0', manifest_version=3, background={'service_worker': 'background.js'},
                      action={'default_popup': 'popup.html', 'default_icon': {'16': 'img/icon.png'}},
                      declarative_net_request={'rule_resources': [{'path': 'rules/base.json'}]})
        for name in ['background.js', 'popup.html', 'img/icon.png', 'rules/base.json']:
            self.write(name)
        _, archive = packager.package(self.root, self.output)
        self.assertEqual(archive.name, 'total-script-blocker-2.0.0.zip')

    def test_missing_manifest_resource_rejects_the_build(self):
        self.manifest(content_scripts=[{'js': ['missing.js']}])
        with self.assertRaisesRegex(ValueError, 'missing.js'):
            packager.package(self.root, self.output)

    def test_unsafe_or_invalid_versions_do_not_create_archives(self):
        for version in ['../bad', '1.0;echo', '70000.0', '0.0', '1.2.3.4.5']:
            self.manifest(version)
            with self.subTest(version=version), self.assertRaises(ValueError):
                packager.package(self.root, self.output)
        self.assertFalse(self.output.exists())

    def test_unsupported_manifest_is_rejected(self):
        self.manifest(manifest_version=4)
        with self.assertRaisesRegex(ValueError, 'Manifest V2 and V3'):
            packager.package(self.root, self.output)

    def test_symlink_cannot_import_a_file_outside_the_source(self):
        self.manifest()
        external = Path(self.directory.name) / 'outside.js'
        external.write_text('outside source')
        (self.root / 'linked.js').symlink_to(external)
        with self.assertRaisesRegex(ValueError, 'regular files'):
            packager.package(self.root, self.output)

    def test_archive_is_reproducible_when_file_timestamps_change(self):
        self.manifest()
        self.write('popup.html')
        _, archive = packager.package(self.root, self.output)
        first = archive.read_bytes()
        os.utime(self.root / 'popup.html', (1700000000, 1700000000))
        _, archive = packager.package(self.root, self.output)
        self.assertEqual(first, archive.read_bytes())


class ReleasePublishing(unittest.TestCase):
    def test_notes_use_only_the_matching_changelog_section(self):
        text = '# Changelog\n\n## [2.0.0]\nNew version.\n\n## [1.0]\nOriginal Manifest V2.\n'
        self.assertEqual(publisher.release_notes('1.0', 2, text), 'Original Manifest V2.')
        self.assertEqual(publisher.release_notes('2.0.0', 3, text), 'New version.')

    def test_missing_changelog_has_useful_version_and_installation_notes(self):
        notes = publisher.release_notes('2.0.0', 3, '')
        self.assertIn('Manifest V3', notes)
        self.assertIn('Load unpacked', notes)

    def test_corrupt_archive_is_rejected_before_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'extension.zip'
            checksums = Path(directory) / 'SHA256SUMS.txt'
            archive.write_bytes(b'changed bytes')
            checksums.write_text('0' * 64 + '  extension.zip\n')
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                publisher.verify_assets(archive, checksums)

    def publish(self, responses):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        (root / 'manifest.json').write_text('{"version":"1.0","manifest_version":2}')
        (root / 'CHANGELOG.md').write_text('## [1.0]\nOriginal Manifest V2 release.\n')
        (root / 'dist').mkdir()
        for name in ['total-script-blocker-1.0.zip', 'SHA256SUMS.txt']:
            (root / 'dist' / name).write_text('validated build')
        archive = root / 'dist' / 'total-script-blocker-1.0.zip'
        (root / 'dist' / 'SHA256SUMS.txt').write_text(
            hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name + '\n')
        file = root / '.github/scripts/publish-release.py'
        api = unittest.mock.Mock(side_effect=responses)
        command = unittest.mock.Mock()
        with patch.object(publisher, '__file__', str(file)), patch.object(publisher, 'api', api), \
                patch.object(publisher, 'command', command), \
                patch.dict(os.environ, {'GITHUB_REPOSITORY': 'example/extension', 'GITHUB_SHA': 'a' * 40}):
            publisher.publish()
        return api, command

    def test_first_publication_creates_numbered_and_latest_releases(self):
        _, command = self.publish([None, None, None])
        calls = [call.args for call in command.call_args_list]
        self.assertEqual([args[:3] for args in calls],
                         [('release', 'create', 'v1.0'), ('release', 'create', 'latest-build')])
        self.assertIn('--latest', calls[0])
        self.assertIn('--prerelease', calls[1])

    def test_existing_numbered_release_is_never_overwritten(self):
        _, command = self.publish([{'id': 1}, None])
        self.assertEqual(len(command.call_args_list), 1)
        self.assertEqual(command.call_args.args[:3], ('release', 'create', 'latest-build'))

    def test_rolling_updates_move_only_the_rolling_tag(self):
        api, command = self.publish([{'id': 1}, {'assets': []}, {}])
        patches = [call for call in api.call_args_list if len(call.args) > 1 and call.args[1] == 'PATCH']
        self.assertEqual(len(patches), 1)
        self.assertTrue(patches[0].args[0].endswith('/git/refs/tags/latest-build'))
        self.assertEqual(command.call_args_list[0].args[:3], ('release', 'upload', 'latest-build'))
        self.assertIn('--clobber', command.call_args_list[0].args)

    def test_existing_numbered_tag_on_another_commit_is_preserved(self):
        with self.assertRaisesRegex(RuntimeError, 'will not be moved'):
            self.publish([None, {'object': {'type': 'commit', 'sha': 'b' * 40}}])


if __name__ == '__main__':
    unittest.main()
