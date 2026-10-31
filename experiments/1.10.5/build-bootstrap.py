from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[3]
source = (root / 'repo/DauntlessUnbrokenInternalServer/dllmain.cpp').read_text()
endpoints = dict(re.findall(r'^\s*\{L"(\w+)", L"http://" \+ Globals::MetagameAddress(?: \+ L"([^"]*)")?\}', source, re.M))
assert len(endpoints) == 167
endpoints['PhoenixEventsMessageEndpoint'] = '/offline-events'
endpoints = {key: 'http://127.0.0.1:62000' + value for key, value in endpoints.items()}
target = (root / 'extracted-config/DefaultGame.ini').read_text(encoding='utf-8-sig')
section = re.search(r'^\[OnlineSubsystemPhoenix\]\s*\n(.*?)(?=^\[|\Z)', target, re.M | re.S)
assert section
for key, url in re.findall(r'^([A-Za-z0-9_]+)\s*=\s*"((?:https?|wss?)://[^"]+)"', section[1], re.M):
    parsed = urlsplit(url)
    scheme = 'ws' if parsed.scheme.startswith('ws') else 'http'
    local = f'{scheme}://127.0.0.1:62000{parsed.path}'
    if parsed.query:
        local += '?' + parsed.query
    endpoints.setdefault(key, local)
endpoints['ServiceSessionEndpoint'] = 'ws://127.0.0.1:62000/ws/{accountid}'
assert endpoints['PlayerDataMigrationTriggerEndpoint'] == 'http://127.0.0.1:62000/migration/trigger'
assert endpoints['GetPlayerJourneyEndpointClient'] == 'http://127.0.0.1:62000/pjm'
assert all(urlsplit(value).hostname == '127.0.0.1' for value in endpoints.values())
folder = root / 'repo/experiments/1.10.5'
(folder / 'endpoints.generated.h').write_text('static const std::map<std::wstring,std::wstring> Endpoints = {\n' + ''.join(f'{{L"{k}",L"{v}"}},\n' for k,v in endpoints.items()) + '};\n')
with (root / 'bootstrap-build.log').open('w') as log:
    subprocess.run(['C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/MSBuild/Current/Bin/MSBuild.exe', str(folder/'bootstrap.vcxproj'), '/p:Configuration=Release', '/p:Platform=x64', '/m', '/v:minimal'], stdout=log, stderr=subprocess.STDOUT, check=True)
print('Built isolated 1.10.5 bootstrap')
