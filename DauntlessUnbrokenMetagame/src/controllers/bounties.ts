import { and, asc, eq, ne } from "drizzle-orm";
import { GetDb } from "../db";
import { bounties, bountydraft, challengedrafts } from "../db/schema";
import { logger } from "../logger";
import { Caller, IsPlainObject, ReadField, ReadInteger, RealReply, RecordProgressionEvent } from "./progressionevents";
import { Tx } from "./savehistory";
import { BOUNTY_TOKENS_DAILY } from './inventory';
import { Local1105Enabled } from './local1105';
import NativeBountyIds from './bounty-ids1105.json';

// Extracted from 1.10.5.365075 Gameplay/Bounty/bounty_table.
const NativeBounties = new Set(NativeBountyIds);
export const QuarantinedChallenge = 'Challenge_Season_Break_Armour_Rock';
function CanRestoreBounty(Id: string){
    if (!Local1105Enabled()) return true;
    // Player-reported crash containment; retain the original row for recovery.
    if (Id === QuarantinedChallenge || Id.startsWith(`${QuarantinedChallenge}-`)) return false;
    return !Id.startsWith('Bounty_') || NativeBounties.has(Id);
}

// Shared by the old endpoint and 1.10.5 tuning. Native assets own bounty IDs,
// unlock requirements and rewards; an empty override list preserves them.
export const BountyGameData = {
    max_slots: 4, num_draft_options: 3, num_spicy_options: 1,
    bounty_token_id: 'TOKEN_BOUNTY_DRAFT', premium_bounty_token_id: 'TOKEN_BOUNTY_DRAFT_PREMIUM',
    num_tokens_hp_start: BOUNTY_TOKENS_DAILY, num_tokens_per_day: BOUNTY_TOKENS_DAILY,
    bounty_token_grant_hour: 0, history_length: 10, bronze_count: 9, silver_count: 3, gold_count: 1,
    new_season_reset_bounties: false, bounty_data: [], item_grant_data: [],
    token_rollover_warning_days: 1000, automatic_draft: false, automatic_claim: false,
    delete_claimed_bounties: false
};
export function GetBountyGameData(){
    // 1.10.5's claim path otherwise retains the claimed row in the active slots.
    return {...BountyGameData, delete_claimed_bounties: Local1105Enabled()};
}

// Bounty board of real-mode accounts. POST /bounty/:uid is a PARTIAL upsert: each
// sender puts only the bounty that changed (or none) in "bounties", and draft_data
// only when it changed. Nothing is ever removed for being absent; claim and abandon
// go through POST /bounty/delete/:uid. Elements are stored and returned as sent.

const DEFAULT_DRAFT_DATA = {
    current_draft_choices: [],
    previous_draft_selections: [],
    bronze_count: 0,
    silver_count: 0,
    gold_count: 0
};

function Board(tx: Tx, AccountId: string){
    const Bounties = tx.select().from(bounties).where(eq(bounties.accountId, AccountId)).orderBy(asc(bounties.slotIndex), asc(bounties.bountyId)).all().filter(Row => CanRestoreBounty(Row.bountyId)).flatMap((Row): any[] => {
        let Element: any;
        try {
            Element = JSON.parse(Row.data);
        } catch {
            logger.warn(`Ignoring malformed bounty data for ${AccountId} (${Row.bountyId})`);
            return [];
        }
        if(!IsPlainObject(Element)){
            logger.warn(`Ignoring non-object bounty data for ${AccountId} (${Row.bountyId})`);
            return [];
        }

        // The client zeroes every bounty member except drafted_timestamp
        if(typeof Element.drafted_timestamp !== "string"){
            Element.drafted_timestamp = Row.updatedDate;
        }

        return [Element];
    });

    const Draft = tx.select().from(bountydraft).where(eq(bountydraft.accountId, AccountId)).get();
    let DraftData: Record<string, any> = {...DEFAULT_DRAFT_DATA};
    if(Draft != undefined){
        try {
            const Parsed: unknown = JSON.parse(Draft.data);
            if(IsPlainObject(Parsed)) DraftData = Parsed;
            else logger.warn(`Ignoring non-object bounty draft data for ${AccountId}`);
        } catch {
            logger.warn(`Ignoring malformed bounty draft data for ${AccountId}`);
        }
    }
    if (Local1105Enabled()) {
        for (const Field of ['current_draft_choices', 'previous_draft_selections']) {
            if (Array.isArray(DraftData[Field])) DraftData[Field] = DraftData[Field].filter((Id: unknown) => typeof Id === 'string' && CanRestoreBounty(Id));
        }
    }

    const ChallengeDrafts = Local1105Enabled() ? tx.select().from(challengedrafts).where(eq(challengedrafts.accountId, AccountId)).all() : [];
    const ChallengeDraft = (kind: string) => {
        const row = ChallengeDrafts.find(entry => entry.kind === kind);
        if (row == undefined) return {...DEFAULT_DRAFT_DATA};
        try {
            const Parsed: unknown = JSON.parse(row.data);
            return IsPlainObject(Parsed) ? Parsed : {...DEFAULT_DRAFT_DATA};
        } catch {
            logger.warn(`Ignoring malformed ${kind} bounty draft data for ${AccountId}`);
            return {...DEFAULT_DRAFT_DATA};
        }
    };

    return {
        bounties: Bounties,
        draft_data: DraftData,
        ...(Local1105Enabled() ? {draft_data_daily: ChallengeDraft("daily"), draft_data_weekly: ChallengeDraft("weekly")} : {})
    };
}

// GET /bounty/:uid
export function GetBountyReply(AccountId: string){
    return {code: "OK", message: "OK", payload: GetDb().transaction((tx) => Board(tx, AccountId))};
}

export function SetBounties(AccountId: string, Body: unknown, Who: Caller): RealReply{
    const Route = "POST /bounty/:uid";
    const Notes: string[] = [];

    return GetDb().transaction((tx) => {
        let List = IsPlainObject(Body) ? Body.bounties : undefined;

        if(IsPlainObject(Body) && List === undefined){
            Notes.push("no bounties key");
            List = [];
        }

        if(!Array.isArray(List)){
            RecordProgressionEvent(tx, {AccountId, Caller: Who, Route, Body, Status: 400, Notes: [...Notes, "body is not {bounties: [...]}"]});
            logger.warn(`Refusing bounty update for ${AccountId}: body is not {bounties: [...]}`);
            return {Status: 400};
        }

        const Now = new Date().toISOString();
        const Saved: string[] = [];

        for(const Element of List){
            const BountyId = IsPlainObject(Element) ? Element.bounty_id : undefined;

            if(!IsPlainObject(Element) || typeof BountyId !== "string" || BountyId.length === 0){
                Notes.push(`skipped element without a bounty_id: ${JSON.stringify(Element)}`);
                continue;
            }

            if (!CanRestoreBounty(BountyId)) {
                Notes.push(`quarantined ${BountyId}: not restored in 1.10.5`);
                continue;
            }
            const Version = ReadInteger(Element.update_version, `${BountyId} update_version`, Notes) ?? 0;
            const SlotIndex = ReadInteger(Element.slot_index, `${BountyId} slot_index`, Notes) ?? null;
            const Stored = tx.select().from(bounties).where(and(eq(bounties.accountId, AccountId), eq(bounties.bountyId, BountyId))).get();

            if(Stored != undefined && Stored.updateVersion > Version){
                Notes.push(`kept ${BountyId}: stored update_version ${Stored.updateVersion} is newer than ${Version}`);
                continue;
            }

            if(SlotIndex !== null){
                // Seasonal/daily challenges and ordinary bounties have independent slots.
                const Replaced = tx.select().from(bounties).where(and(eq(bounties.accountId, AccountId), eq(bounties.slotIndex, SlotIndex), ne(bounties.bountyId, BountyId))).all()
                    .filter(row => CanRestoreBounty(row.bountyId) && (!Local1105Enabled() || (BountyId.startsWith('Bounty_') && row.bountyId.startsWith('Bounty_'))));
                for(const row of Replaced) tx.delete(bounties).where(and(eq(bounties.accountId,AccountId),eq(bounties.bountyId,row.bountyId))).run();

                for(const Row of Replaced){
                    Notes.push(`${BountyId} took slot ${SlotIndex} from ${Row.bountyId}`);
                }
            }

            tx.insert(bounties).values({accountId: AccountId, bountyId: BountyId, slotIndex: SlotIndex, updateVersion: Version, data: JSON.stringify(Element), updatedDate: Now})
                .onConflictDoUpdate({target: [bounties.accountId, bounties.bountyId], set: {slotIndex: SlotIndex, updateVersion: Version, data: JSON.stringify(Element), updatedDate: Now}}).run();
            Saved.push(`${BountyId} v${Version}`);
        }

        if(IsPlainObject(Body) && Body.draft_data !== undefined){
            if(IsPlainObject(Body.draft_data)){
                tx.insert(bountydraft).values({accountId: AccountId, data: JSON.stringify(Body.draft_data), updatedDate: Now})
                    .onConflictDoUpdate({target: bountydraft.accountId, set: {data: JSON.stringify(Body.draft_data), updatedDate: Now}}).run();
                Saved.push("draft data");
            }
            else{
                Notes.push("draft_data is not an object, ignored");
            }
        }

        if(Local1105Enabled() && IsPlainObject(Body)){
            for(const kind of ["daily", "weekly"] as const){
                const field = `draft_data_${kind}`;
                if(Body[field] === undefined) continue;
                if(IsPlainObject(Body[field])){
                    const data = JSON.stringify(Body[field]);
                    tx.insert(challengedrafts).values({accountId: AccountId, kind, data, updatedDate: Now})
                        .onConflictDoUpdate({target: [challengedrafts.accountId, challengedrafts.kind], set: {data, updatedDate: Now}}).run();
                    Saved.push(`${kind} draft data`);
                }
                else Notes.push(`${field} is not an object, ignored`);
            }
        }

        const Reply = {code: "OK", message: "OK", payload: Board(tx, AccountId)};

        RecordProgressionEvent(tx, {AccountId, Caller: Who, Route, Body, Status: 200, Notes});

        if(Notes.length > 0){
            logger.warn(`Bounty update for ${AccountId}: ${Notes.join("; ")}`);
        }

        logger.info(`Bounty update for ${AccountId}: ${Saved.length > 0 ? Saved.join(", ") : "nothing stored"}`);

        return {Status: 200, Body: Reply};
    });
}

// POST /bounty/delete/:uid {"bounty_ids": [...]}: claim, abandon and reset. Unknown ids are fine.
export function DeleteBounties(AccountId: string, Body: unknown, Who: Caller): RealReply{
    const Route = "POST /bounty/delete/:uid";
    const Notes: string[] = [];
    const Ids = ReadField(Body, ["bounty_ids", "bountyIds"], "bounty ids", Notes);

    return GetDb().transaction((tx) => {
        if(!Array.isArray(Ids)){
            RecordProgressionEvent(tx, {AccountId, Caller: Who, Route, Body, Status: 400, Notes: [...Notes, "no bounty_ids array"]});
            logger.warn(`Refusing bounty delete for ${AccountId}: no bounty_ids array`);
            return {Status: 400};
        }

        const Removed: string[] = [];

        for(const Id of Ids){
            if(typeof Id !== "string"){
                Notes.push(`skipped id ${JSON.stringify(Id)}`);
                continue;
            }

            if (!CanRestoreBounty(Id)) {
                Notes.push(`retained quarantined ${Id}`);
                continue;
            }
            if(tx.delete(bounties).where(and(eq(bounties.accountId, AccountId), eq(bounties.bountyId, Id))).returning().all().length > 0){
                Removed.push(Id);
            }
        }

        const Reply = {code: "OK", message: "OK", payload: Board(tx, AccountId)};

        RecordProgressionEvent(tx, {AccountId, Caller: Who, Route, Body, Status: 200, Notes});
        logger.info(`Bounty delete for ${AccountId}: asked ${Ids.length}, removed ${Removed.length > 0 ? Removed.join(", ") : "none"}`);

        return {Status: 200, Body: Reply};
    });
}
