import hashlib
import json
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
exe = root / 'game/Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe'
assert hashlib.sha256(exe.read_bytes()).hexdigest() == '41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd'
config = root / 'extracted-config'
config.mkdir(exist_ok=True)
for pak, entry in json.loads((root / 'config-index.json').read_text()):
    if entry in ['Archon/Config/DefaultGame.ini', 'Archon/Config/DefaultEngine.ini']:
        data = subprocess.check_output(['C:/dr/tools/repak/repak.exe', 'get', str(root / 'game/Archon/Content/Paks' / pak), entry])
        (config / Path(entry).name).write_bytes(data)
source = (root / 'repo/DauntlessUnbrokenInternalServer/dllmain.cpp').read_text()
endpoints = dict(re.findall(r'^\s*\{L"(\w+)", L"http://" \+ Globals::MetagameAddress(?: \+ L"([^"]*)")?\}', source, re.M))
assert len(endpoints) == 167
endpoints['PhoenixEventsMessageEndpoint'] = '/offline-events'
ini = '[OnlineSubsystemPhoenix]\n' + '\n'.join(f'{k}="http://127.0.0.1:62000{v}"' for k, v in endpoints.items()) + '\n'
# Override every packaged Phoenix URL too; the target may add keys absent in 1.4.4.
target = (config / 'DefaultGame.ini').read_bytes().decode('utf-8-sig', errors='replace')
section = re.search(r'^\[OnlineSubsystemPhoenix\]\s*\n(.*?)(?=^\[|\Z)', target, re.M | re.S)
if section:
    for key in re.findall(r'^([A-Za-z0-9_]+)\s*=\s*"?https?://', section[1], re.M):
        if key not in endpoints:
            ini += f'{key}="http://127.0.0.1:62000/unsupported/{key}"\n'
for relative in ['profile/Archon/Saved/Config/WindowsClient', 'profile/Saved/Config/WindowsClient']:
    folder = root / relative
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'Game.ini').write_text(ini)
    (folder / 'Engine.ini').write_text('[OnlineSubsystemMcp.XMPP]\nServerAddr="ws://127.0.0.1"\nServerPort=62099\nbUseSSL=false\n[SystemSettings]\nt.MaxFPS=30\n')
(exe.parent / 'Dumper-7.ini').write_text(f'[Settings]\nSDKGenerationPath={root.as_posix()}/sdk\nLogFilePath={root.as_posix()}/sdk-dump.log\nSleepTimeout=5\nShouldAutoUnload=1\nExecuteSDKTestScript=0\n')
print('Prepared isolated dump configuration; no installed-game files changed')
