$ErrorActionPreference='Stop'
if($env:SSH_ORIGINAL_COMMAND -match '^export-1105-account ([a-f0-9]{64})$'){$proof=$Matches[1]}
elseif($env:SSH_ORIGINAL_COMMAND -eq 'export-1105-account'){$proof=[Console]::ReadLine()}
else{exit 1}
if($proof -notmatch '^[a-f0-9]{64}$'){exit 1}
$proof | & 'C:/Program Files/nodejs/node.exe' 'C:/DauntlessUnbroken/tools/migration1105/export-live-account.cjs' --gzip
exit $LASTEXITCODE
