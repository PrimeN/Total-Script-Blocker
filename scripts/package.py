from pathlib import Path
import json,zipfile,hashlib
root=Path(__file__).resolve().parents[1]
out=root/'dist';out.mkdir(exist_ok=True)
files=[p for p in root.iterdir() if p.is_file() and (p.suffix in {'.js','.html','.css'} or p.name in {'manifest.json','Privacy policy.txt'} or p.name.lower().startswith(('license','copying')))]
for folder in ['img','rules','licenses']:
 files.extend(p for p in (root/folder).rglob('*') if p.is_file())
manifest=json.loads((root/'manifest.json').read_text())
assert manifest.get('key'), 'Stable public extension key is required'
archive=out/'total-script-blocker-beta.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(set(files)):z.write(p,p.relative_to(root))
(out/'SHA256SUMS.txt').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
with zipfile.ZipFile(archive) as z:z.extractall(out/'unpacked')
print(archive)
