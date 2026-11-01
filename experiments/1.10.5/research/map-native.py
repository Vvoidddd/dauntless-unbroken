"""Read-only candidate mapping. Matches are evidence for disassembly, never patch addresses."""
import json
from pathlib import Path
import re
import sys
sys.path.insert(0, 'C:/dr/native-analysis-libs')
import capstone
import pefile

root = Path(__file__).resolve().parents[1]
old_path = Path('C:/Users/tolik/OneDrive/Desktop/Dauntless Private Server/dauntless-revived/BaseGame144/Dauntless/Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe')
new_path = root / 'game/Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe'
old = pefile.PE(str(old_path), fast_load=True)
new = pefile.PE(str(new_path), fast_load=True)
a, b = old.get_memory_mapped_image(), new.get_memory_mapped_image()
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
md.detail = True
targets = {
 'Realloc':0x1C8EE00, 'ConfigGetString':0x1D09D50, 'DefaultMap':0x25A37C0,
 'CommandLine':0x1D06D40, 'ServerBootCrash':0x2E4D7F0, 'EncounterSetup':0x1658f90,
 'GameEngineTick':0x3307100, 'FixupNetworkNotify':0x820120, 'HttpProcessRequest':0x28A76C0,
 'CombatText':0x1390300, 'PostLogin':0x14B7460, 'HasFinishedLoading':0x1528000,
 'IsNetReady':0x347E110, 'SetReplicationDriver':0x3491720, 'GetNetDriverInternal':0x3078AF0,
 'IsLevelInitialized':0x3458780, 'StartSpot':0x1368660, 'ProcessEvent':0x1F61820,
 'NetMode':0x378BDA0, 'GetEscalationSeason':0x14F2A30, 'ActorPreReplication':0x306B150,
 'CreateNamedNetDriver':0x371A5E0, 'SetWorld':0x3491890,
 'GIsClientAssignment':0x7961a9, 'ListenCheck':0x372E746, 'RamsgateCrash':0x1346A98,
}
out = {}
for name, rva in targets.items():
    pieces, count = [], 0
    matches = []; used_bytes = 0; reverse = []
    for ins in md.disasm(a[rva:rva+256], rva):
        data = ins.bytes
        wildcard = set()
        for operand in ins.operands:
            if operand.type == capstone.x86.X86_OP_MEM and operand.mem.base == capstone.x86.X86_REG_RIP:
                wildcard.update(range(ins.disp_offset, ins.disp_offset + ins.disp_size))
        if ins.group(capstone.CS_GRP_JUMP) or ins.group(capstone.CS_GRP_CALL):
            wildcard.update(range(ins.imm_offset, ins.imm_offset + ins.imm_size))
        pieces.extend(b'.' if i in wildcard else re.escape(bytes([v])) for i, v in enumerate(data))
        count += len(data)
        if count < 24:
            continue
        hits = [m.start() for m in re.finditer(b''.join(pieces), b, flags=re.S)]
        if not hits:
            break
        matches = hits[:30]
        used_bytes = count
        reverse = [m.start() for m in re.finditer(b''.join(pieces), a, flags=re.S)]
        if len(hits) == 1 and count >= 48:
            break
    out[name] = {'oldRva':hex(rva), 'newCandidates':[hex(x) for x in matches], 'bytes':used_bytes, 'oldMatches':[hex(x) for x in reverse[:20]], 'verified':False}
(root / 'native-candidates.json').write_text(json.dumps(out, indent=2))
for k,v in out.items():
    print(k, v['newCandidates'], 'prefix bytes', v['bytes'])
