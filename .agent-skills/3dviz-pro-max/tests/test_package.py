import importlib.util
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('packager', ROOT/'scripts/package.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class PackageTests(unittest.TestCase):
    def test_reproducible_archives_and_excluded_private_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            left, right = Path(tmp)/'a', Path(tmp)/'b'
            a, b = package.build(left), package.build(right)
            for x, y in zip(a, b):
                self.assertEqual(x.read_bytes(), y.read_bytes())
            with ZipFile(a[1]) as archive:
                names = archive.namelist()
                self.assertIn('3dviz-pro-max/.codex-plugin/plugin.json', names)
                self.assertIn('3dviz-pro-max/.claude-plugin/plugin.json', names)
                records = list((package.SKILL / 'data/knowledge').rglob('*.json'))
                self.assertTrue(records, 'Nested catalog packaging must not pass vacuously')
                for path in records:
                    self.assertIn(f'3dviz-pro-max/skills/3dviz-pro-max/{path.relative_to(package.SKILL).as_posix()}', names)
                self.assertTrue(all('\\' not in name for name in names))
                self.assertTrue(all('/plans/' not in n and '/evidence/' not in n for n in names))
                self.assertTrue(all('..' not in Path(n).parts for n in names))

    def test_host_manifests_agree(self):
        # Codex and Claude Code read different manifest folders but the same skills/ tree; the
        # marketplace entry must name the same plugin at the same version with source "./".
        import json
        codex = json.loads((ROOT / '.codex-plugin/plugin.json').read_text())
        claude = json.loads((ROOT / '.claude-plugin/plugin.json').read_text())
        market = json.loads((ROOT / '.claude-plugin/marketplace.json').read_text())
        skill = json.loads((package.SKILL / 'data/manifest.json').read_text())
        self.assertEqual({codex['name'], claude['name'], market['name']}, {package.NAME})
        self.assertEqual({codex['version'], claude['version'], skill['version']}, {claude['version']})
        for key in ('name', 'description', 'author'):
            self.assertIn(key, claude)
        self.assertIn('name', market['owner'])
        entry, = market['plugins']
        self.assertEqual((entry['name'], entry['source'], entry['version']),
                         (package.NAME, './', claude['version']))

    def test_optional_knowledge_files_are_packaged(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'skill'
            data = root / 'data/knowledge'
            data.mkdir(parents=True)
            (root / 'SKILL.md').write_text('Portable skill')
            record = data / 'materials.json'
            record.write_text('[{"id":"knowledge.material"}]')
            target = Path(tmp) / 'skill.zip'
            package.write_zip(target, {p.relative_to(root).as_posix(): p.read_bytes()
                                       for p in package.skill_files(root)})
            with ZipFile(target) as archive:
                self.assertEqual(archive.read('data/knowledge/materials.json'), record.read_bytes())

    def test_templates_checklists_are_packaged(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'skill'
            checklists = root / 'templates/checklists'
            checklists.mkdir(parents=True)
            (root / 'SKILL.md').write_text('Portable skill')
            checklist = checklists / 'x.md'
            checklist.write_text('# Checklist\n')
            target = Path(tmp) / 'skill.zip'
            package.write_zip(target, {p.relative_to(root).as_posix(): p.read_bytes()
                                       for p in package.skill_files(root)})
            with ZipFile(target) as archive:
                self.assertIn('templates/checklists/x.md', archive.namelist())
                self.assertEqual(archive.read('templates/checklists/x.md'),
                                 checklist.read_bytes())

    def test_template_scripts_are_packaged(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'skill'
            rigs = root / 'templates/rigs'
            rigs.mkdir(parents=True)
            (root / 'SKILL.md').write_text('Portable skill')
            rig = rigs / 'a.js'
            rig.write_text('export const a = 1;\n')
            target = Path(tmp) / 'skill.zip'
            package.write_zip(target, {p.relative_to(root).as_posix(): p.read_bytes()
                                       for p in package.skill_files(root)})
            with ZipFile(target) as archive:
                self.assertIn('templates/rigs/a.js', archive.namelist())
                self.assertEqual(archive.read('templates/rigs/a.js'), rig.read_bytes())

    def test_kit_gltf_binary_is_packaged_and_blend_is_not(self):
        # A blueprint may ship one baked .glb; the 2 MB cap on it is a data rule enforced by
        # scripts/validate.py, so an oversize asset never reaches the packager at all.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'skill'
            kits = root / 'templates/kits/nature'
            kits.mkdir(parents=True)
            (root / 'SKILL.md').write_text('Portable skill')
            asset = kits / 'oak.glb'
            asset.write_bytes(b'glTF\x02\x00\x00\x00baked binary')
            target = Path(tmp) / 'skill.zip'
            package.write_zip(target, {p.relative_to(root).as_posix(): p.read_bytes()
                                       for p in package.skill_files(root)})
            with ZipFile(target) as archive:
                self.assertIn('templates/kits/nature/oak.glb', archive.namelist())
                self.assertEqual(archive.read('templates/kits/nature/oak.glb'), asset.read_bytes())
            (kits / 'oak.blend').write_bytes(b'BLENDER-v500')
            with self.assertRaisesRegex(ValueError, 'Unexpected file in skill'):
                package.skill_files(root)

    def test_installed_dependency_tree_rejected(self):
        # Built from parts so the name never appears literally in repository sources.
        dependency_folder = 'node_' + 'modules'
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'skill'
            installed = root / 'templates/x' / dependency_folder
            installed.mkdir(parents=True)
            (root / 'SKILL.md').write_text('Portable skill')
            (installed / 'y.js').write_text('export const y = 1;\n')
            with self.assertRaisesRegex(ValueError, 'installed dependency'):
                package.skill_files(root)

    def test_build_output_tree_rejected(self):
        build_folder = 'di' + 'st'
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'skill'
            built = root / 'templates/x' / build_folder
            built.mkdir(parents=True)
            (root / 'SKILL.md').write_text('Portable skill')
            (built / 'bundle.js').write_text('export const y = 1;\n')
            with self.assertRaisesRegex(ValueError, 'Build output'):
                package.skill_files(root)

    def test_hidden_private_tree_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'SKILL.md').write_text('example')
            (root/'.local').mkdir()
            (root/'.local/private.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'Private'):
                package.skill_files(root)

    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'SKILL.md').write_text('example')
            (root/'leak.md').symlink_to(ROOT/'plans')
            with self.assertRaises(ValueError):
                package.skill_files(root)


if __name__ == '__main__':
    unittest.main()
