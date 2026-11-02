"""Package only the original manifest's files, never profiles, logs, or credentials."""
import hashlib, json, pathlib, zipfile
lab = pathlib.Path(__file__).resolve().parents[3]
game = lab / 'game'
dest = lab / 'share'
dest.mkdir(exist_ok=True)
manifest = json.loads((game / 'Manifest.bin.json').read_text())
target = dest / 'Unbroken-1.10.5-Game.zip'
with zipfile.ZipFile(target.with_suffix('.partial'), 'w', zipfile.ZIP_STORED, allowZip64=True) as archive:
    for index, entry in enumerate(manifest['TargetFiles']):
        file = (game / entry['RelativePath']).resolve()
        assert file.is_relative_to(game.resolve()) and file.is_file()
        assert file.stat().st_size == entry['FileSize'], str(file)
        archive.write(file, file.relative_to(game).as_posix())
        if index % 50 == 0: print(f"Packaged {index}/{len(manifest['TargetFiles'])}", flush=True)
target.with_suffix('.partial').replace(target)
with target.open('rb') as file: digest = hashlib.file_digest(file, 'sha256').hexdigest()
(dest / 'game-package.json').write_text(json.dumps({'size':target.stat().st_size,'sha256':digest,'version':'1.10.5'}))
print('Game archive verified and ready', flush=True)
