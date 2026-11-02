"""Derive the public launcher's file pins from the verified Epic manifest and local files."""
import hashlib, json, pathlib, shutil
root = pathlib.Path(__file__).resolve().parents[3]
repo = root / 'repo'
index = json.loads((root / 'downloads/install-index.json').read_text())
files = []
for entry in index['files']:
    file = root / 'game' / entry['path']
    sha1, sha256 = hashlib.sha1(), hashlib.sha256()
    with file.open('rb') as stream:
        while data := stream.read(4 * 1024 * 1024):
            sha1.update(data); sha256.update(data)
    assert file.stat().st_size == entry['size'] and sha1.hexdigest() == entry['sha'], entry['path']
    files.append(dict(path=entry['path'], size=entry['size'], sha256=sha256.hexdigest()))
manifest = dict(build='dauntless_rel-1.10.5_365075', totalBytes=sum(f['size'] for f in files), files=files)
(repo / 'DauntlessUnbrokenContent/data/dauntless-1.10.5.json').write_text(json.dumps(manifest, indent=2)+'\n')
assets = repo / 'DauntlessUnbrokenLauncher/assets/realm1105'
assets.mkdir(exist_ok=True)
shutil.copyfile(root / 'downloads/install-index.json', assets / 'install-index.json')
shutil.copyfile(pathlib.Path(__file__).parent / 'launcher/install.cjs', assets / 'install.cjs')
print(f'Verified {len(files)} files against the archived manifest; public SHA-256 pins generated.')
