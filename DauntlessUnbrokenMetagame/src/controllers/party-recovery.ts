import fs from 'node:fs';
import { IsAccountIdShape } from './login';
import { MEMBER_TIMEOUT_MS, PartyMembershipSnapshot, PartyRecoverySummary, RestorePartyMembership } from './party';
import { logger } from '../logger';

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function RestorePartyFile(File: string, Now = Date.now()): void {
    try {
        if(fs.statSync(File).size > 4 * 1024 * 1024) throw Error('oversized checkpoint');
        const Data = JSON.parse(fs.readFileSync(File, 'utf8'));
        if(!Number.isFinite(Data.at) || Data.at > Now + 5000 || Now - Data.at > MEMBER_TIMEOUT_MS) return;
        if(!Array.isArray(Data.parties) || Data.parties.length > 10000) throw Error('invalid checkpoint');
        const Valid = Data.parties.every((p: any) => p && typeof p.PartyId === 'string' && Uuid.test(p.PartyId)
            && Number.isFinite(p.CreatedAt) && p.CreatedAt <= Now + 5000
            && Array.isArray(p.Members) && p.Members.length >= 2 && p.Members.length <= 4
            && p.Members.every(IsAccountIdShape) && new Set(p.Members).size === p.Members.length
            && p.Members.includes(p.LeaderId) && Array.isArray(p.Seen) && p.Seen.length === p.Members.length
            && p.Seen.every((at: unknown) => typeof at === 'number' && Number.isFinite(at) && at <= Now + 5000));
        if(!Valid) throw Error('invalid checkpoint');
        RestorePartyMembership(Data.parties);
    } catch(Error: any) {
        if(Error.code !== 'ENOENT') logger.warn('party: checkpoint could not be restored');
    }
}

export function SavePartyFile(File: string): void {
    const Raw = JSON.stringify({at: Date.now(), recovery: PartyRecoverySummary(), parties: PartyMembershipSnapshot()});
    if(Buffer.byteLength(Raw) > 4 * 1024 * 1024) throw Error('party checkpoint exceeds limit');
    fs.writeFileSync(File + '.tmp', Raw, {mode: 0o600});
    fs.renameSync(File + '.tmp', File);
}

export function StartPartyRecovery(File: string | undefined): () => void {
    if(!File || File === ':memory:') return () => {};
    File += '.parties.json';
    RestorePartyFile(File);
    const Save = () => { try { SavePartyFile(File!); } catch { logger.warn('party: checkpoint could not be saved'); } };
    const Timer = setInterval(Save, 5000); Timer.unref();
    return () => { clearInterval(Timer); Save(); };
}
