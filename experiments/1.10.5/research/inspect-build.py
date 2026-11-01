import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

sys.path.insert(0, 'C:/dr/native-analysis-libs')
import pefile

root = Path(__file__).resolve().parents[1]
exe = root / 'game/Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe'
data = exe.read_bytes()
pe = pefile.PE(str(exe))
strings = [s.decode('utf-16-le') for s in re.findall(rb'(?:[ -~]\x00){8,}', data)]
identity = {
    'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data),
    'timestamp': pe.FILE_HEADER.TimeDateStamp, 'imageSize': pe.OPTIONAL_HEADER.SizeOfImage,
    'buildStrings': [s for s in strings if '++dauntless+' in s or re.match(r'^4\.\d+\.\d+', s)],
    'imports': [x.dll.decode() for x in pe.DIRECTORY_ENTRY_IMPORT],
}
(root / 'build-identity.json').write_text(json.dumps(identity, indent=2))
print(json.dumps(identity, indent=2))
index = {}
for pak in sorted((root / 'game/Archon/Content/Paks').glob('*.pak')):
    result = subprocess.run(['C:/dr/tools/repak/repak.exe', 'list', str(pak)], capture_output=True, check=True, text=True)
    index[pak.name] = result.stdout.splitlines()
(root / 'pak-index.json').write_text(json.dumps(index))
configs = [(pak, p) for pak, paths in index.items() for p in paths if p.lower().endswith('.ini')]
(root / 'config-index.json').write_text(json.dumps(configs, indent=2))
print('Indexed', len(index), 'paks;', sum(map(len, index.values())), 'assets;', len(configs), 'INI files')
print(json.dumps(configs[:20]))
