import { RemoveTestDb } from "./setup";
import "./authenv";
import { GATEWAY_TEST_SECRET, PERMISSIONS_API_PORT, PERMISSIONS_DEPLOYSERVER_PORT } from "./permissionsenv";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http, { type Server } from "node:http";
import { app } from "../src/app";
import { unbrokenApiRouter } from "../src/routes/unbrokenapi";
import {supportReportsRouter} from '../src/routes/supportreports';
import { GetDb } from "../src/db";
import { gameserverapikeys, userapikeys, users } from "../src/db/schema";
import { HashUserAPIKey, SignMetagameJWTForUid } from "../src/controllers/auth";
import { CreateCharacterForUid } from "../src/controllers/character";
import { CheckMatchmakingInput } from "../src/controllers/matchmaking";
import { CheckGatewayConfig, ClientAddressOf, DescribeOrigin, IsDirectLocalRequest, IsProxiedRequest, IsTrustedGatewayRequest } from "../src/middleware/RequestOrigin";
import { Count, ReadCharacter } from "./helpers";

// Permission audit (C:\dr\data\plans\route-audit.md): every route is listed with its auth,
// a player's token only ever reaches its own account and characters, game-server-only
// writes refuse player tokens, admin routes need the admin key, and (public mode) neither
// the game-server key nor the admin key works through the gateway or any other proxy.
// The app listens on a spare loopback port; the deploy server is a fake on another.

const BASE = `http://127.0.0.1:${PERMISSIONS_API_PORT}`;
const GS_KEY = crypto.randomBytes(24).toString("hex");
const TUTORIAL_ARGS = "/Game/Maps/islands/1705/dia_moss_triforce?MaxPlayers=1?MonsterClass=/Game/Monsters/mcrollin/mcbeaver_tutorial_bp.mcbeaver_tutorial_bp_C?TODClass=/Game/World/atmospheres/blueprints/atmospheres/experimental/atmospheres_stormy_00_bp.atmospheres_stormy_00_bp_C?HuntID=?ZonePreset=-1";

// A (real mode) is the victim, B (real mode) and C (stub mode) are other players
const A = "UID-real-a", B = "UID-real-b", C = "UID-stub-c", ADMIN = "UID-admin";

type Player = { UserId: string, Key: string, Token: string, CharacterId: string };
const Players: Record<string, Player> = {};

it('device reports require an account key, reject supplied identities and limit requests', async () => {
    process.env.DEVICE_SIGNAL_HMAC_KEY='cd'.repeat(32);
    try {
        assert.equal((await Call('POST','/unbroken/api/DeviceSignals',{body:{}})).status,401);
        assert.equal((await Call('POST','/unbroken/api/DeviceSignals',{key:Players[A].Key,body:{accountId:B}})).status,400);
        assert.equal((await Call('POST','/unbroken/api/DeviceSignals',{key:Players[A].Key,body:{smbiosUuid:'12345678-1234-5678-9abc-123456789abc'}})).status,204);
        assert.equal((GetDb().$client.prepare('SELECT count(*) n FROM account_device_signals WHERE account_id=?').get(B) as any).n,0);
        for(let i=0;i<8;i++)assert.equal((await Call('POST','/unbroken/api/DeviceSignals',{key:Players[A].Key,body:{}})).status,204);
        assert.equal((await Call('POST','/unbroken/api/DeviceSignals',{key:Players[A].Key,body:{}})).status,429);
    } finally { delete process.env.DEVICE_SIGNAL_HMAC_KEY; }
});

it('hunt region changes require the account key and cannot target another account', async () => {
    process.env.US_REGION='1';
    try {
        assert.equal((await Call('POST','/unbroken/api/HuntRegion',{body:{region:'us'}})).status,401);
        assert.equal((await Call('POST','/unbroken/api/HuntRegion',{key:Players[A].Key,body:{region:'remote'}})).status,400);
        assert.equal((await Call('POST','/unbroken/api/HuntRegion',{key:Players[A].Key,body:{region:'us',userId:B}})).status,200);
        assert.equal((await Call('GET','/unbroken/api/HuntRegion',{key:Players[A].Key})).json.region,'us');
        assert.equal((await Call('GET','/unbroken/api/HuntRegion',{key:Players[B].Key})).json.region,'main');
        assert.equal((await Call('POST','/unbroken/api/HuntRegion',{key:Players[A].Key,body:{region:'main'}})).status,200);
    } finally { delete process.env.US_REGION; }
    assert.equal((await Call('POST','/unbroken/api/HuntRegion',{key:Players[A].Key,body:{region:'us'}})).status,503);
    assert.equal((await Call('POST','/unbroken/api/HuntRegion',{key:Players[A].Key,body:{region:'aus'}})).status,410);
});

it('dashboard account directory exposes names and short fingerprints, never login keys or full hashes', async () => {
    const reply = await Call('GET', '/unbroken/api/DashboardAccounts?offset=0', {key: Players[ADMIN].Key});
    assert.equal(reply.status, 200);
    const account = reply.json.accounts.find((a: any) => a.id === A);
    assert.equal(account.name, A.replace(/-/g, '_').slice(0, 16));
    assert.equal(account.keyFingerprint, HashUserAPIKey(Players[A].Key).slice(0, 16));
    assert.equal(account.admin, false);
    assert.equal(reply.text.includes(Players[A].Key), false);
    assert.equal(reply.text.includes(HashUserAPIKey(Players[A].Key)), false);
    assert.equal((await Call('GET', '/unbroken/api/DashboardAccounts?offset=-1', {key: Players[ADMIN].Key})).status, 400);
    const raw=GetDb().$client;
    for(let i=0;i<105;i++)raw.prepare('INSERT INTO users(userId,name,notes) VALUES (?,?,0)').run('UID-zz-search-'+String(i).padStart(3,'0'),'DirectorySearch'+i);
    try {
        const beyond=await Call('GET','/unbroken/api/DashboardAccounts?offset=0&q=DirectorySearch104',{key:Players[ADMIN].Key});
        assert.deepEqual(beyond.json.accounts.map((a:any)=>a.name),['DirectorySearch104']);
    } finally { raw.prepare("DELETE FROM users WHERE userId LIKE 'UID-zz-search-%'").run(); }
    const search=await Call('GET','/unbroken/api/DashboardAccounts?offset=0&q='+encodeURIComponent(A),{key:Players[ADMIN].Key});
    assert.deepEqual(search.json.accounts.map((a:any)=>a.id),[A]);
    assert.equal((await Call('GET','/unbroken/api/DashboardAccounts?offset=0&q=%25',{key:Players[ADMIN].Key})).json.accounts.length,0);
    const empty = await Call('GET', '/unbroken/api/DashboardAccounts?offset=99999' , {key: Players[ADMIN].Key});
    assert.deepEqual(empty.json, {accounts: [], nextOffset: null});
});

type Reply = { status: number, text: string, json: any };
type CallOptions = { as?: string, gs?: boolean | string, key?: string, body?: unknown, emptyJson?: boolean, headers?: Record<string, string> };

async function Call(Method: string, Path: string, Options: CallOptions = {}): Promise<Reply> {
    const Headers: Record<string, string> = { ...(Options.headers ?? {}) };

    if(Options.as != undefined) Headers["authorization"] = `bearer ${Players[Options.as].Token}`;
    if(Options.gs) Headers["x-dauntless-unbroken-gameserver-apikey"] = typeof Options.gs === "string" ? Options.gs : GS_KEY;
    if(Options.key != undefined) Headers["x-dauntless-unbroken-user-api-key"] = Options.key;
    if(Options.body !== undefined || Options.emptyJson) Headers["content-type"] = "application/json; charset=utf-8";

    const Response = await fetch(BASE + Path, { method: Method, headers: Headers, body: Options.body === undefined ? (Options.emptyJson ? "" : undefined) : JSON.stringify(Options.body) });
    const Text = await Response.text();
    let Json: any;

    try{ Json = Text.length > 0 ? JSON.parse(Text) : undefined; } catch { Json = undefined; }

    return { status: Response.status, text: Text, json: Json };
}

// What the gateway adds to every request it relays
const VIA_GATEWAY = { "x-forwarded-for": "203.0.113.9", "x-dauntless-gateway": GATEWAY_TEST_SECRET };

// A fake deploy server that records every matchmaking body it gets
let DeployServer: Server | undefined;
const DeployCalls: any[] = [];

function StartFakeDeploy(){
    return new Promise<Server>((Resolve, Reject) => {
        const Server = http.createServer((req, res) => {
            let Body = "";
            req.on("data", (Chunk) => { Body += Chunk; });
            req.on("end", () => {
                if(req.method === "GET" && req.url === "/gameservers"){
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end(JSON.stringify({ servers: [] }));
                    return;
                }

                if(req.method === "POST" && req.url === "/api/matchmaker/handle-matchmaking-for-player"){
                    DeployCalls.push(JSON.parse(Body));
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end(JSON.stringify({ host: "127.0.0.1", port: 8775 }));
                    return;
                }

                res.writeHead(404);
                res.end();
            });
        });

        Server.once("error", Reject);
        Server.listen(PERMISSIONS_DEPLOYSERVER_PORT, "127.0.0.1", () => Resolve(Server));
    });
}

let Listening: Server | undefined;

before(async () => {
    for(const [UserId, IsAdmin] of [[A, false], [B, false], [C, false], [ADMIN, true]] as [string, boolean][]){
        const Key = `UUK_${crypto.randomBytes(24).toString("hex")}`;

        GetDb().insert(users).values({ userId: UserId, name: UserId.replace(/-/g, "_").slice(0, 16), notes: 0, isAdmin: IsAdmin }).run();
        GetDb().insert(userapikeys).values({ userId: UserId, keyHash: HashUserAPIKey(Key) }).run();

        const Character = await CreateCharacterForUid(UserId, UserId);

        Players[UserId] = { UserId, Key, Token: SignMetagameJWTForUid(UserId), CharacterId: Character.id as string };
    }

    GetDb().insert(gameserverapikeys).values({ keyHash: crypto.createHash("sha256").update(GS_KEY, "utf8").digest("hex") }).run();

    DeployServer = await StartFakeDeploy();
    Listening = await new Promise<Server>((Resolve, Reject) => {
        const Started = app.listen(PERMISSIONS_API_PORT, "127.0.0.1", (Error?: Error) => Error ? Reject(Error) : Resolve(Started));
    });
    // Match appclient: synchronous fixture writes can outlast an idle pooled socket on slow CI.
    Listening.keepAliveTimeout = 0;

    // Real data for A, written the way the game server writes it
    assert.equal((await Call("POST", `/progression/${A}`, { gs: true, as: A, body: { progress_tracks: [{ progression_id: "season09b", progress: 150 }], objectives: [{ objective_id: "OBJ_X", value: 3, completed_count: 0 }] } })).status, 200);
    assert.equal((await Call("PUT", `/cooldown/batch/${A}`, { gs: true, as: A, body: { cooldowns: [{ cooldown_id: "bounty_tokens_season09b", cooldown_started_date: "2026-09-21T14:10:39.154Z" }] } })).status, 200);
    assert.equal((await Call("POST", `/bounty/${A}`, { gs: true, as: A, body: { bounties: [{ bounty_id: "Bounty_Bronze_KillRadiant", premium_bounty: false, slot_index: 0, objectives: [{ objective_id: "o", progress: 1 }], drafted_timestamp: "2026-09-21T14:31:05.123Z", update_version: 1 }] } })).status, 200);
});

after(async () => {
    Listening?.closeAllConnections();
    await new Promise<void>((Resolve) => Listening ? Listening.close(() => Resolve()) : Resolve());
    DeployServer?.closeAllConnections();
    await new Promise<void>((Resolve) => DeployServer ? DeployServer.close(() => Resolve()) : Resolve());
    RemoveTestDb(() => GetDb().$client.close());
});

// ---- 1. Every route is accounted for ----

// "METHOD path [middleware...]", in registration order. A route added, removed or with
// different auth middleware fails this test: classify it in route-audit.md, then update this list.
const EXPECTED_ROUTES = [
    "POST /unbroken/api/SupportReport [jsonParser]",
    "GET /unbroken/api/SupportReports [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/SupportReports/:id [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/SupportReports/:id/review [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/SupportReports/:id/delete [HasDauntlessUnbrokenAdminApiKey]",
    "GET /features/platform/win []",
    "GET /account/link/epic/:AccId []",
    "POST /login [HasDauntlessUnbrokenMetagameAuth]",
    "GET /accountinfo [HasDauntlessUnbrokenMetagameAuth]",
    "GET /tags [HasDauntlessUnbrokenMetagameAuth]",
    "PUT /gamesession/epic [HasDauntlessUnbrokenMetagameAuth]",
    "POST /accountinfo/public [HasDauntlessUnbrokenMetagameAuth]",
    // Optional Windows backup root; direct local game-server key only, no proxy callers.
    "POST /internal/key-recovery/:action [KeyRecoveryAuth]",
    "POST /internal/backup [LocalBackupAuth]",
    "POST /account/api/oauth/token []",
    "GET /account/api/oauth/verify [SoftMetagameAuth]",
    "GET /account/api/public/account/:AccId [SoftMetagameAuth]",
    "GET /account/api/public/account/displayName/:displayName [SoftMetagameAuth]",
    "GET /account/api/public/account/:AccId/externalAuths []",
    // Account mapping (friend search, party invites): names only with a player token, like the lookups above.
    "POST /account/mapping [SoftMetagameAuth]",
    "DELETE /account/api/oauth/sessions/kill []",
    "DELETE /account/api/oauth/sessions/kill/:AuthToken []",
    "GET /account/api/public/account [HasDauntlessUnbrokenMetagameAuth]",
    "GET /dauntless-status []",
    "POST /heartbeat [HasDauntlessUnbrokenMetagameAuth]",
    "POST /event []",
    "POST /account/migrate [HasDauntlessUnbrokenMetagameAuth]",
    "POST /profile/update [HasDauntlessUnbrokenMetagameAuth]",
    "GET /vivox/login [HasDauntlessUnbrokenMetagameAuth]",
    "POST /motd/ [HasDauntlessUnbrokenMetagameAuth]",
    "GET /entitlementsv2 [HasDauntlessUnbrokenMetagameAuth]",
    "POST /entitlementv2/:userId [HasDauntlessUnbrokenMetagameAuth]",
    "DELETE /entitlement/:userId/:entitlement [RealProgressionOnly, HasDauntlessUnbrokenMetagameAuth]",
    "GET /playertreatments/:userId [HasDauntlessUnbrokenMetagameAuth]",
    "GET /eventstats/ [HasDauntlessUnbrokenMetagameAuth]",
    "GET /progression/config [HasDauntlessUnbrokenMetagameAuth]",
    "GET /huntpass/:userId [HasDauntlessUnbrokenMetagameAuth]",
    "POST /huntpass/:userId [RealProgressionOnly, HasDauntlessUnbrokenMetagameAuth]",
    "GET /cooldown/:userId [HasDauntlessUnbrokenMetagameAuth]",
    "PUT /cooldown/batch/:userId [HasDauntlessUnbrokenMetagameAuth]",
    "PUT /cooldown/:userId/:cooldownId [RealProgressionOnly, HasDauntlessUnbrokenMetagameAuth]",
    "GET /bounty/game-data [HasDauntlessUnbrokenMetagameAuth]",
    "GET /bounty/:userId [HasDauntlessUnbrokenMetagameAuth]",
    "POST /bounty/delete/:userId [RealProgressionOnly, HasDauntlessUnbrokenMetagameAuth]",
    "POST /bounty/:userId [HasDauntlessUnbrokenMetagameAuth]",
    "GET /all/ [HasDauntlessUnbrokenMetagameAuth]",
    "GET /motd/trigger [MiscRoutesOn]",
    // Escalation (roadmap 2.16): the save is a game server's, and exists only with ESCALATION_MODE=real
    "GET /escalation/:escalationSeason/:userId [HasDauntlessUnbrokenMetagameAuth]",
    "POST /escalation/:escalationSeason/:userId [EscalationSavesOn, RealProgressionOnly, HasDauntlessUnbrokenMetagameAuth]",
    "GET /friends/api/public/friends/:userId [MiscRoutesOn, SoftMetagameAuth]",
    "GET /friends/api/public/blocklist/:userId [MiscRoutesOn, SoftMetagameAuth]",
    "POST /friends/api/public/friends/:userId/:friendId [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "DELETE /friends/api/public/friends/:userId/:friendId [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "POST /friends/api/public/blocklist/:userId/:friendId [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    // The same block as POST: the client's verb for Block is inferred, not traced
    "PUT /friends/api/public/blocklist/:userId/:friendId [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "DELETE /friends/api/public/blocklist/:userId/:friendId [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "GET /friends/api/public/list/:namespace/:userId/recentPlayers [MiscRoutesOn]",
    "GET /friends/api/v1/:userId/settings [MiscRoutesOn]",
    "GET /character [HasDauntlessUnbrokenMetagameAuth]",
    "PUT /character [HasDauntlessUnbrokenMetagameAuth]",
    "POST /character [HasDauntlessUnbrokenMetagameAuth]",
    "POST /inventory/:characterId/:changeList [HasDauntlessUnbrokenMetagameAuth]",
    "GET /inventory/:userId/:characterId [HasDauntlessUnbrokenMetagameAuth]",
    "POST /inventory [HasDauntlessUnbrokenMetagameAuth]",
    "POST /inventory/instanceditem [HasDauntlessUnbrokenMetagameAuth]",
    "POST /reconcile [HasDauntlessUnbrokenMetagameAuth]",
    "GET /creator [CreatorAuth, PlayerTokenOnly]",
    "POST /creator [CreatorAuth, PlayerTokenOnly]",
    "GET /balance [HasDauntlessUnbrokenMetagameAuth]",
    // The store offers' icons: public 1.4.4 item art, fetched by the client's image download without a token
    "GET /store-images/:file []",
    // The free store (roadmap 3.7): only with STORE=free, the token's own account; with STORE=off the storefront
    // falls through to the old 400 below and the other three to the 404
    "GET /product/skus/public [StoreListOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "GET /product/sku/:skuId [StoreSkuOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "GET /token/:currency/:skuId [StoreSkuOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "POST /notification/:currency [StoreAnyOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "GET /product/skus/public [HasDauntlessUnbrokenMetagameAuth]",
    "GET /guild/invite/player [HasDauntlessUnbrokenMetagameAuth]",
    "GET /guild [HasDauntlessUnbrokenMetagameAuth]",
    // Guilds (roadmap 3.11): the token's own account acts; GUILDS=0 turns them off. The create is the
    // game server's, after the client's ServerCreateGuild RPC: its key only, never a player's token.
    "POST /guild/validate [GuildsOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "POST /guild [GuildsOn, GameServerKeyAuth]",
    "DELETE /guild/player [GuildsOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "DELETE /guild/player/:accountId [GuildsOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "PUT /guild/invite/:accountId [GuildsOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "POST /guild/invite/accept/:inviteId [GuildsOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "DELETE /guild/invite/:inviteId [GuildsOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "PUT /guild/rank/:accountId/:rank [GuildsOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "DELETE /guild/:guildId [GuildsOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "GET /game_tuning/seasonal_event_schedule []",
    "GET /game_tuning/huntpass_xp_config []",
    "POST /trials/leaderboards [TrialsOn, HasDauntlessUnbrokenMetagameAuth, AggregateLeaderboard]",
    "POST /trials/leaderboards/all [TrialsOn, HasDauntlessUnbrokenMetagameAuth, AggregateLeaderboard]",
    "POST /trials/leaderboards/solo [TrialsOn, HasDauntlessUnbrokenMetagameAuth]",
    "POST /trials/leaderboards/solo/individual [TrialsOn, HasDauntlessUnbrokenMetagameAuth]",
    "POST /trials/leaderboards/group [TrialsOn, HasDauntlessUnbrokenMetagameAuth]",
    "POST /trials/leaderboards/group/individual [TrialsOn, HasDauntlessUnbrokenMetagameAuth]",
    "DELETE /candidate [CancelOn, HasDauntlessUnbrokenMetagameAuth]",
    "DELETE /candidate/leave [CancelOn, HasDauntlessUnbrokenMetagameAuth]",
    "POST /candidate/player/alive [MiscRoutesOn, HasDauntlessUnbrokenMetagameAuth]",
    "POST /candidate/player/register [HasDauntlessUnbrokenMetagameAuth]",
    "GET /candidate/regions [HasDauntlessUnbrokenMetagameAuth]",
    "POST /key/generate [HasDauntlessUnbrokenMetagameAuth]",
    "GET /candidate/status [HasDauntlessUnbrokenMetagameAuth]",
    "POST /candidate/join [HasDauntlessUnbrokenMetagameAuth]",
    "POST /candidate/join/:candidateId [HasDauntlessUnbrokenMetagameAuth]",
    "GET /QoS []",
    "POST /party [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "GET /party/invites [SoftMetagameAuth]",
    "PUT /party/invite [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "PUT /party/invite/accept/:inviteId [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "DELETE /party/invite [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "DELETE /party/member [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "DELETE /party/member/:memberId [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "PUT /party/member/promote/:memberId [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "DELETE /party/leader/:leaderId [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "POST /party/status [HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    // Slayer Links: the token's own account acts; SLAYER_LINKS=0 puts the 404s back
    "GET /slayerlink/status_good [SlayerLinksOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "GET /slayerlink/invites [SlayerLinksOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "GET /slayerlink/links [SlayerLinksOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "PUT /slayerlink/invite [SlayerLinksOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "POST /slayerlink/invite [SlayerLinksOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "DELETE /slayerlink/invites/:accountId [SlayerLinksOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "DELETE /slayerlink/links [SlayerLinksOn, HasDauntlessUnbrokenMetagameAuth]",

    "DELETE /slayerlink/links [SlayerLinksOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "POST /slayerlink/availability [SlayerLinksOn, HasDauntlessUnbrokenMetagameAuth, PlayerTokenOnly]",
    "PUT /slayerlink/links/rewards [SlayerLinksOn, HasDauntlessUnbrokenMetagameAuth]",
    "GET /slayerlink/links/rewards/:accountId/:slot [SlayerLinksOn, HasDauntlessUnbrokenMetagameAuth]",

    "GET /encountered-content/:characterId/:contentType [HasDauntlessUnbrokenMetagameAuth]",
    "POST /encountered-content/query/:characterId [HasDauntlessUnbrokenMetagameAuth]",
    "POST /encountered-content/:characterId [HasDauntlessUnbrokenMetagameAuth]",
    "GET /progression/objectives/:userId [HasDauntlessUnbrokenMetagameAuth]",
    "GET /progression/objectives/:userId/:objectiveId [HasDauntlessUnbrokenMetagameAuth]",
    "GET /breadcrumbs/:characterId [HasDauntlessUnbrokenMetagameAuth]",
    "POST /breadcrumbs/:characterId [HasDauntlessUnbrokenMetagameAuth]",
    "POST /progression/:userId [HasDauntlessUnbrokenMetagameAuth]",
    "GET /progression/:userId/:progressionId [HasDauntlessUnbrokenMetagameAuth, LinkTrackRoute]",

    "POST /progression/:userId/:progressionId/:rank/confirm/:kind [RealProgressionOnly, ConfirmOn, HasDauntlessUnbrokenMetagameAuth]",
    "POST /progression/:userId/:progressionId/:amount [RealProgressionOnly, HasDauntlessUnbrokenMetagameAuth]",
    "GET /progression/:userId/:progressionId [RealProgressionOnly, HasDauntlessUnbrokenMetagameAuth]",
    "DELETE /progression/:userId/:progressionId [RealProgressionOnly]",
    "GET /progression/:userId [HasDauntlessUnbrokenMetagameAuth]",
    "POST /loadout/:userId/:characterId/unlock/:numSlots [RealProgressionOnly, HasDauntlessUnbrokenMetagameAuth]",
    "GET /loadout/:userId/:characterId/slotcount [RealProgressionOnly, HasDauntlessUnbrokenMetagameAuth]",
    "POST /loadout/:userId/:characterId/active/:index [RealProgressionOnly, HasDauntlessUnbrokenMetagameAuth]",
    "GET /loadout/:userId/:characterId/all [HasDauntlessUnbrokenMetagameAuth]",
    "POST /loadout/:userId/:characterId/:index [HasDauntlessUnbrokenMetagameAuth]",
    "GET /unbroken/api/PurchaseHistory [HasDauntlessUnbrokenUserApiKey]",
    "POST /unbroken/api/Admission [HasDauntlessUnbrokenUserApiKey]",
    "GET /unbroken/api/Admission [HasDauntlessUnbrokenUserApiKey]",
    "DELETE /unbroken/api/Admission [HasDauntlessUnbrokenUserApiKey]",
    "POST /unbroken/api/DeviceSignals [HasDauntlessUnbrokenUserApiKey]",
    "GET /unbroken/api/HuntRegion [HasDauntlessUnbrokenUserApiKey]",
    "POST /unbroken/api/HuntRegion [HasDauntlessUnbrokenUserApiKey]",
    "GET /unbroken/api/RewardCatalog [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/RewardAccount [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/RewardGrant [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/DiscordKeyStats [HasDauntlessUnbrokenAdminApiKey]",

    "POST /unbroken/api/DiscordLink [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/DiscordLink/:discordId [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/DiscordAccess/:discordId [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/DiscordInvite [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/DiscordModeration [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/DiscordModerationPending [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/DiscordModerationAck [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/AccountAccess [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/AccountAccessLog [HasDauntlessUnbrokenAdminApiKey]",

    "GET /unbroken/api/BackendHealth [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/DashboardAccounts [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/PlayingEnded [HasDauntlessUnbrokenUserApiKey]",
    "GET /unbroken/api/Moderation/:accountId [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/ModerationLog [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/Moderation [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/RegistrationStatus []",
    "POST /unbroken/api/RegistrationStatus [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/InviteCodes [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/GenerateJWTForUserId [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/GetAllUsers [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/RegisterInviteCode [HasDauntlessUnbrokenAdminApiKey]",
    "DELETE /unbroken/api/InviteCode/:inviteCodeToDelete [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/Register []",
    "GET /unbroken/api/UsernameAvailable []",
    "POST /unbroken/api/CreateInvite [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/RenameUser [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/ServerStatus [SoftAccountAuth]",
    "GET /unbroken/api/GetUserInfo [HasDauntlessUnbrokenUserApiKey]",
    "GET /unbroken/api/Playtime [HasDauntlessUnbrokenUserApiKey]",
    "GET /unbroken/api/PrivateOnlineStats [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/PublicOnlineStats [HasDauntlessUnbrokenUserApiKey]",
    "GET /unbroken/api/SaveHistory [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/RollbackCharacter [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/RollbackLoadout [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/Progression [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/SeedProgression [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/GrantEntitlement [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/RevokeEntitlement [HasDauntlessUnbrokenAdminApiKey]",
    "POST /unbroken/api/PartyInvite [HasDauntlessUnbrokenUserApiKey]",
    "POST /unbroken/api/Friends [HasDauntlessUnbrokenUserApiKey]",
    // Guild fallbacks on the host (the gateway does not pass /unbroken/api/* except the four public ones)
    "POST /unbroken/api/GuildInvite [HasDauntlessUnbrokenUserApiKey]",
    "POST /unbroken/api/DisbandGuild [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/Guilds [HasDauntlessUnbrokenAdminApiKey]",
    "GET /unbroken/api/AccountRecovery/:userId [HasDauntlessUnbrokenAdminApiKey]"
];

function RegisteredRoutes(){
    const Routes: string[] = [];

    for(const Layer of (app as any).router.stack){
        if(!Layer.handle?.stack){
            continue;
        }

        const Prefix = Layer.handle === unbrokenApiRouter || Layer.handle === supportReportsRouter ? "/unbroken/api" : "";

        for(const RouteLayer of Layer.handle.stack){
            if(!RouteLayer.route){
                continue;
            }

            const Chain = RouteLayer.route.stack.map((Handler: any) => Handler.name).filter((Name: string) => Name !== "<anonymous>" && Name !== "");

            for(const Method of Object.keys(RouteLayer.route.methods)){
                Routes.push(`${Method.toUpperCase()} ${Prefix}${RouteLayer.route.path} [${Chain.join(", ")}]`);
            }
        }
    }

    return Routes;
}

describe("route table", () => {
    it("lists every route with the auth middleware the audit classified", () => {
        assert.deepEqual(RegisteredRoutes(), EXPECTED_ROUTES);
    });
});

// ---- 2. Player tokens reach only their own account ----

const REAL_READS = () => [`/progression/${A}`, `/progression/objectives/${A}`, `/progression/objectives/${A}/OBJ_X`, `/progression/${A}/season09b`, `/huntpass/${A}`, `/cooldown/${A}`, `/bounty/${A}`];

describe("real-mode reads of an account", () => {
    it("answer the account's own client and any game server, and refuse every other player (403, no body)", async () => {
        const Own = await Call("GET", `/progression/${A}`, { as: A });
        assert.equal(Own.json.payload.find((Track: any) => Track.progression_id === "season09b").progress, 150, "the test data is there");

        for(const Path of REAL_READS()){
            const Mine = await Call("GET", Path, { as: A });
            assert.equal(Mine.status, 200, `own client: ${Path}`);

            for(const Other of [B, C]){
                const Foreign = await Call("GET", Path, { as: Other });
                assert.deepEqual([Foreign.status, Foreign.text], [403, ""], `${Other}'s client: ${Path}`);
            }

            const Server = await Call("GET", Path, { gs: true, as: B });
            assert.deepEqual([Server.status, Server.text], [200, Mine.text], `game server carrying another player's bearer: ${Path}`);

            const ServerOnly = await Call("GET", Path, { gs: true });
            assert.deepEqual([ServerOnly.status, ServerOnly.text], [200, Mine.text], `game server without a bearer: ${Path}`);

            assert.equal((await Call("GET", Path)).status, 401, `no auth: ${Path}`);
        }
    });

    it("stub-mode replies are the caller's own stub, never another account's stored data", async () => {
        const Stub = await Call("GET", `/progression/${A}`, { as: C });
        assert.equal(Stub.status, 403, "A is in real mode: C's token is refused");

        const ForC = await Call("GET", `/progression/${C}`, { as: A });
        assert.equal(ForC.status, 200);
        assert.ok(ForC.json.payload.every((Track: any) => Track.phx_account_id === A && Track.progress === (Track.progression_id.startsWith('Linked_Slayer_Slot_')?0:99999999)), "the stub for the token's own account");

        const Entitlements = await Call("GET", "/entitlementsv2", { as: B });
        assert.equal(Entitlements.status, 200);
        assert.ok(!Entitlements.text.includes(A), "entitlements come from the token's account");
    });
});

describe("character-scoped routes", () => {
    it("refuse another player's character, whatever the URL or body names", async () => {
        const CidA = Players[A].CharacterId;
        const Attempts: [string, string, unknown, number][] = [
            ["GET", `/breadcrumbs/${CidA}`, undefined, 403],
            ["POST", `/breadcrumbs/${CidA}`, { breadcrumbs: ["x"], updateVersion: 1 }, 403],
            ["GET", `/encountered-content/${CidA}/1`, undefined, 403],
            ["POST", `/encountered-content/query/${CidA}`, { content_types: [1] }, 403],
            ["POST", `/encountered-content/${CidA}`, { content_type: 1, content_id: "x" }, 403],
            ["GET", `/inventory/${A}/${CidA}`, undefined, 403],
            ["POST", "/inventory", { accountId: A, characterId: CidA, transactionId: "t-foreign", addStackedItems: [{ catalogId: "x", quantity: 1 }] }, 403],
            ["POST", "/inventory/instanceditem", { accountId: A, characterId: CidA, instanceId: "i", catalogId: "c", itemData: "{}", updateVersion: 1 }, 403],
            ["POST", "/character", { characterId: CidA, data: "{\"x\":1}", updateVersion: 99 }, 404],
            ["GET", `/loadout/${A}/${CidA}/all`, undefined, 404],
            ["POST", `/loadout/${A}/${CidA}/0`, { data: "{}" }, 404],
            ["GET", `/loadout/${A}/${CidA}/slotcount`, undefined, 404],
            ["POST", `/loadout/${A}/${CidA}/unlock/1`, undefined, 404],
            ["POST", `/loadout/${A}/${CidA}/active/0`, undefined, 404]
        ];

        for(const [Method, Path, Body, Status] of Attempts){
            const Reply = await Call(Method, Path, { as: B, body: Body, emptyJson: Body === undefined && Method === "POST" });
            assert.equal(Reply.status, Status, `${Method} ${Path} with B's token`);
        }

        const Character = ReadCharacter(CidA);
        assert.deepEqual([Character.updateVersion, Character.data], [0, "{}"], "A's character untouched");
        assert.equal(Count("breadcrumbs", "characterId = ?", CidA), 0, "no breadcrumbs row made for A's character");
        assert.equal(Count("encounteredcontent", "characterId = ?", CidA), 0, "no encountered content for A's character");
        assert.equal(Count("inventories", "characterId = ?", CidA), 0, "no inventory for A's character");
    });
});

describe("game-server-only writes", () => {
    it("refuse player tokens, the account's own included, and change nothing", async () => {
        const Before = (await Call("GET", `/progression/${A}`, { gs: true })).text;
        // [method, path, body, status for another player's token]; the account's own token always gets 403.
        // Loadout slots resolve the character through the token's account first, so another player gets 404.
        const Writes: [string, string, unknown, number][] = [
            ["POST", `/progression/${A}`, { progress_tracks: [{ progression_id: "season09b", progress: 5000 }], objectives: [] }, 403],
            ["POST", `/progression/${A}/season09b/100`, undefined, 403],
            ["POST", `/progression/${A}/season09b/1/confirm/public`, undefined, 403],
            ["POST", `/entitlementv2/${A}`, { entitlement: "season09b_premium", duration: 0 }, 403],
            ["DELETE", `/entitlement/${A}/season09b_premium`, undefined, 403],
            ["PUT", `/cooldown/batch/${A}`, { cooldowns: [] }, 403],
            ["PUT", `/cooldown/${A}/ABC`, undefined, 403],
            ["POST", `/bounty/${A}`, { bounties: [] }, 403],
            ["POST", `/bounty/delete/${A}`, { bounty_ids: ["Bounty_Bronze_KillRadiant"] }, 403],
            ["POST", `/huntpass/${A}`, { progression_id: "season09b" }, 403],
            ["DELETE", `/progression/${A}/season09b`, undefined, 403],
            ["POST", `/loadout/${A}/${Players[A].CharacterId}/unlock/3`, undefined, 404],
            ["POST", `/loadout/${A}/${Players[A].CharacterId}/active/1`, undefined, 404]
        ];

        for(const Caller of [A, B]){
            for(const [Method, Path, Body, OtherStatus] of Writes){
                const Reply = await Call(Method, Path, { as: Caller, body: Body, emptyJson: Body === undefined });
                assert.equal(Reply.status, Caller === A ? 403 : OtherStatus, `${Method} ${Path} with ${Caller}'s token`);
            }
        }

        assert.equal((await Call("GET", `/progression/${A}`, { gs: true })).text, Before, "A's progression unchanged");
    });
});

// ---- 3. Admin routes need the admin key, and never work through a proxy ----

const ADMIN_ROUTES = (): [string, string, unknown][] => [
    ["POST", "/unbroken/api/RegistrationStatus", { RegistrationStatus: "OPEN" }],
    ["GET", "/unbroken/api/InviteCodes", undefined],
    ["POST", "/unbroken/api/GenerateJWTForUserId", { UserId: C }],
    ["GET", "/unbroken/api/GetAllUsers", undefined],
    ["GET", "/unbroken/api/RewardCatalog?q=Rams", undefined],
    ["GET", "/unbroken/api/RewardAccount?accountId=" + A, undefined],
    ["POST", "/unbroken/api/RewardGrant", {}],
    ["GET", "/unbroken/api/DiscordKeyStats", undefined],

    ["POST", "/unbroken/api/DiscordLink", {DiscordId:'12345678901234567',UserId:A}],
    ["GET", "/unbroken/api/DiscordLink/12345678901234567", undefined],

    ["GET", "/unbroken/api/BackendHealth", undefined],
    ["GET", "/unbroken/api/DashboardAccounts", undefined],
    ["GET", "/unbroken/api/AccountRecovery/UID-example", undefined],
    ["GET", `/unbroken/api/Moderation/${C}`, undefined],
    ["GET", "/unbroken/api/ModerationLog?kind=events", undefined],
    ["POST", "/unbroken/api/Moderation", {accountId:C,reason:'test',active:false}],
    ["POST", "/unbroken/api/RegisterInviteCode", { NewInviteCode: "PERM-TEST-CODE", Uses: 1 }],
    ["DELETE", "/unbroken/api/InviteCode/PERM-TEST-CODE", undefined],
    ["POST", "/unbroken/api/CreateInvite", {}],
    ["POST", "/unbroken/api/RenameUser", { UserId: C, NewUsername: "Renamed_c" }],
    ["GET", "/unbroken/api/PrivateOnlineStats", undefined],
    ["GET", `/unbroken/api/SaveHistory?UserId=${C}`, undefined],
    ["POST", "/unbroken/api/RollbackCharacter", { CharacterId: Players[C].CharacterId, Version: 0 }],
    ["POST", "/unbroken/api/RollbackLoadout", { CharacterId: Players[C].CharacterId, Version: 0 }],
    ["GET", `/unbroken/api/Progression?UserId=${C}`, undefined],
    ["POST", "/unbroken/api/SeedProgression", { UserId: C, Mode: "fresh" }],
    ["POST", "/unbroken/api/GrantEntitlement", { UserId: C, Entitlement: "perm_test" }],
    ["POST", "/unbroken/api/RevokeEntitlement", { UserId: C, Entitlement: "perm_test" }],
    ["POST", "/unbroken/api/DisbandGuild", { Guild: "NoSuchGuild" }],
    ["GET", "/unbroken/api/Guilds", undefined],
    ["DELETE", `/progression/${B}/season09b`, undefined]
];

describe("admin routes", () => {
    it("answer 401 without a key and 403 for a player's key", async () => {
        for(const [Method, Path, Body] of ADMIN_ROUTES()){
            assert.equal((await Call(Method, Path, { body: Body })).status, 401, `no key: ${Method} ${Path}`);
            assert.equal((await Call(Method, Path, { body: Body, key: Players[C].Key })).status, 403, `player key: ${Method} ${Path}`);
        }
    });

    it("refuse the admin key through the gateway or any proxy (403), even with odd path spellings", async () => {
        for(const [Method, Path, Body] of ADMIN_ROUTES()){
            for(const Headers of [VIA_GATEWAY, { "x-forwarded-for": "198.51.100.4" }, { "via": "1.1 someproxy" }, { "forwarded": "for=198.51.100.4" }, { "x-real-ip": "198.51.100.4" }] as Record<string, string>[]){
                const Reply = await Call(Method, Path, { body: Body, key: Players[ADMIN].Key, headers: Headers });
                assert.deepEqual([Reply.status, Reply.text], [403, ""], `${Method} ${Path} via ${Object.keys(Headers).join("+")}`);
            }
        }

        // Express matches paths case-insensitively and with a trailing slash, so a front-door
        // filter that compares exact strings would miss these; the metagame still refuses them
        for(const Path of ["/unbroken/api/createinvite", "/UNBROKEN/API/CreateInvite/", "/unbroken/api/CreateInvite?x=1"]){
            assert.equal((await Call("POST", Path, { body: {}, key: Players[ADMIN].Key, headers: VIA_GATEWAY })).status, 403, Path);
        }
    });

    it("work with the admin key on a direct request", async () => {
        for(const [Method, Path, Body] of ADMIN_ROUTES()){
            const Reply = await Call(Method, Path, { body: Body, key: Players[ADMIN].Key });
            assert.ok(Reply.status !== 401 && Reply.status !== 403, `${Method} ${Path}: ${Reply.status}`);
        }

        assert.equal((await Call("POST", "/unbroken/api/createinvite", { body: {}, key: Players[ADMIN].Key })).status, 200, "lower-case path reaches the route");
    });
});

// ---- 4. Public mode: the game-server key only from this machine, never through a proxy ----

describe("game-server key and the gateway", () => {
    it("works on a direct loopback request and is refused (403, key not even checked) with any forwarding header", async () => {
        const Direct = await Call("GET", `/progression/${A}`, { gs: true, as: A });
        assert.equal(Direct.status, 200);

        for(const Headers of [VIA_GATEWAY, { "x-forwarded-for": "127.0.0.1" }, { "x-dauntless-gateway": "wrong" }, { "via": "1.1 relay" }, { "forwarded": "for=127.0.0.1" }, { "x-real-ip": "127.0.0.1" }, { "x-forwarded-host": "example.org" }, { "x-forwarded-proto": "https" }] as Record<string, string>[]){
            const Relayed = await Call("GET", `/progression/${A}`, { gs: true, as: A, headers: Headers });
            assert.deepEqual([Relayed.status, Relayed.text], [403, ""], `valid key via ${JSON.stringify(Object.keys(Headers))}`);

            const Write = await Call("POST", `/progression/${A}`, { gs: true, as: A, headers: Headers, body: { progress_tracks: [{ progression_id: "season09b", progress: 9999 }], objectives: [] } });
            assert.equal(Write.status, 403, `grant via ${JSON.stringify(Object.keys(Headers))}`);
        }

        assert.equal((await Call("GET", `/progression/${A}`, { gs: "not-the-key", headers: VIA_GATEWAY })).status, 403, "a wrong key through the gateway: 403, same as a right one");
        assert.equal((await Call("GET", `/progression/${A}`, { gs: "not-the-key" })).status, 401, "a wrong key directly: 401 as before");
        assert.equal((await Call("GET", `/progression/${A}`, { gs: true })).text, Direct.text, "nothing was granted");
    });

    it("leaves player traffic through the gateway as it was", async () => {
        const Direct = await Call("GET", "/character", { as: A });
        const Relayed = await Call("GET", "/character", { as: A, headers: VIA_GATEWAY });
        assert.deepEqual([Relayed.status, Relayed.text], [200, Direct.text]);

        const Heartbeat = await Call("POST", "/heartbeat", { as: A, headers: VIA_GATEWAY, body: { map: "/Game/Maps/ramsgate/ramsgate_01_persistent" } });
        assert.deepEqual([Heartbeat.status, Heartbeat.text], [200, "20000"]);

        const Info = await Call("GET", "/unbroken/api/GetUserInfo", { key: Players[A].Key, headers: VIA_GATEWAY });
        assert.deepEqual([Info.status, Info.json?.UserId], [200, A]);

        const Registered = await Call("POST", "/unbroken/api/Register", { body: { Username: "Via_Gateway" }, headers: VIA_GATEWAY });
        assert.equal(Registered.status, 200);

        const Login = await Call("POST", "/account/api/oauth/token", { body: { grant_type: "exchange_code", exchange_code: Registered.json.UUK }, headers: VIA_GATEWAY });
        assert.equal(Login.status, 200);
        assert.equal(typeof Login.json.access_token, "string");

        // ServerStatus: the player list only for a registered player's key (an admin's too: it is
        // not an admin route); without one, or with a wrong one, the limited answer, never a 401
        for(const Headers of [VIA_GATEWAY, { ...VIA_GATEWAY, "x-dauntless-unbroken-user-api-key": "UUK_not_a_real_key_00000000" }]){
            const Anonymous = await Call("GET", "/unbroken/api/ServerStatus", { headers: Headers });
            assert.deepEqual([Anonymous.status, Anonymous.json?.limited, Anonymous.json?.playersOnline, Anonymous.json?.players], [200, true, 0, []]);
        }
        for(const Key of [Players[A].Key, Registered.json.UUK, Players[ADMIN].Key]){
            const Full = await Call("GET", "/unbroken/api/ServerStatus", { key: Key, headers: VIA_GATEWAY });
            assert.deepEqual([Full.status, Full.json?.limited], [200, false]);
            assert.ok(Full.json.players.some((Player: any) => Player.name === "UID_real_a"), "A's heartbeat is listed");
        }
        assert.equal((await Call("GET", "/QoS", { headers: VIA_GATEWAY })).status, 200);
        assert.equal((await Call("GET", "/candidate/regions", { as: A, headers: VIA_GATEWAY })).json.payload.regionUrls[0], "http://127.0.0.1:61000/QoS");
    });

    it("AUTH_MODE=NONE (development) never answers a proxied request", async () => {
        const Saved = { AUTH_MODE: process.env.AUTH_MODE, NODE_ENV: process.env.NODE_ENV };

        try{
            process.env.AUTH_MODE = "NONE";
            process.env.NODE_ENV = "development";

            const Relayed = await Call("POST", "/account/api/oauth/token", { body: { exchange_code: ADMIN }, headers: VIA_GATEWAY });
            assert.deepEqual([Relayed.status, Relayed.text], [403, ""]);

            assert.equal((await Call("GET", "/dauntless-status", { headers: { "x-forwarded-for": "198.51.100.4" } })).status, 403);

            const Direct = await Call("POST", "/account/api/oauth/token", { body: { exchange_code: ADMIN } });
            assert.deepEqual([Direct.status, Direct.json?.account_id], [200, ADMIN], "direct development logins as before");
        }
        finally{
            process.env.AUTH_MODE = Saved.AUTH_MODE;
            process.env.NODE_ENV = Saved.NODE_ENV;
        }

        assert.equal((await Call("GET", "/dauntless-status", { headers: VIA_GATEWAY })).status, 200, "APIKEY mode serves proxied requests");
    });
});

function FakeRequest(Remote: string | undefined, Local: string | undefined, Headers: Record<string, string> = {}): any {
    return { socket: { remoteAddress: Remote, localAddress: Local }, headers: Headers, method: "GET", path: "/x" };
}

describe("the game server's guild create (POST /guild)", () => {
    const Body = () => ({ leader_account_id: A, name: "PermGuild", nameplate: "PRM" });

    it("refuses a player's token, the leader's own included (403), and the game-server key through the gateway or any proxy (403)", async () => {
        for(const Caller of [A, B]){
            const Reply = await Call("POST", "/guild", { as: Caller, body: Body() });
            assert.equal(Reply.status, 403, `${Caller}'s token`);
            assert.equal(Reply.json?.code, "", "the envelope, so the client shows its generic failure");
        }

        for(const Headers of [VIA_GATEWAY, { "x-forwarded-for": "127.0.0.1" }, { "via": "1.1 relay" }] as Record<string, string>[]){
            assert.equal((await Call("POST", "/guild", { gs: true, as: A, headers: Headers, body: Body() })).status, 403, JSON.stringify(Object.keys(Headers)));
        }

        assert.equal((await Call("POST", "/guild", { gs: "not-a-registered-key", body: Body() })).status, 401);
        assert.equal((await Call("GET", "/guild", { as: A })).status, 204, "no guild was created");
    });

    it("the client's guild routes refuse the game-server key alone (403) and no auth (401)", async () => {
        for(const [Method, Path] of [["POST", "/guild/validate"], ["PUT", `/guild/invite/${B}`], ["DELETE", "/guild/player"], ["DELETE", `/guild/player/${B}`], ["POST", "/guild/invite/accept/x"], ["DELETE", "/guild/invite/x"], ["PUT", `/guild/rank/${B}/officer`], ["DELETE", "/guild/x"]]){
            assert.equal((await Call(Method, Path, { gs: true, emptyJson: true })).status, 403, `key alone: ${Method} ${Path}`);
            assert.equal((await Call(Method, Path, { emptyJson: true })).status, 401, `no auth: ${Method} ${Path}`);
        }
    });
});

describe("RequestOrigin", () => {
    it("keeps IPv4 and IPv6 addresses out of persisted request traces", () => {
        for(const address of ["203.0.113.7", "2001:db8::7"]){
            assert.equal(DescribeOrigin(FakeRequest("127.0.0.1", "127.0.0.1", {
                "x-dauntless-gateway": GATEWAY_TEST_SECRET, "x-forwarded-for": address
            })), " via=gateway");
            assert.equal(DescribeOrigin(FakeRequest(address, "127.0.0.1", { via: "proxy" })), " via=proxy");
            assert.equal(DescribeOrigin(FakeRequest(address, "127.0.0.1")), "");
        }
    });
    it("takes X-Forwarded-For only from loopback with the right gateway secret", () => {
        const Right = { "x-dauntless-gateway": GATEWAY_TEST_SECRET };

        assert.equal(ClientAddressOf(FakeRequest("127.0.0.1", "127.0.0.1", { ...Right, "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
        assert.equal(ClientAddressOf(FakeRequest("::ffff:127.0.0.1", "::ffff:127.0.0.1", { ...Right, "x-forwarded-for": "::ffff:203.0.113.7" })), "203.0.113.7");
        assert.equal(ClientAddressOf(FakeRequest("127.0.0.1", "127.0.0.1", { ...Right, "x-forwarded-for": "2001:db8::7" })), "2001:db8::7");
        assert.equal(ClientAddressOf(FakeRequest("127.0.0.1", "127.0.0.1", { ...Right, "x-forwarded-for": "1.1.1.1, 203.0.113.7" })), "203.0.113.7", "the right-most entry, written by the gateway");
        assert.equal(ClientAddressOf(FakeRequest("127.0.0.1", "127.0.0.1", { ...Right, "x-forwarded-for": "not-an-ip" })), "127.0.0.1");
        assert.equal(ClientAddressOf(FakeRequest("127.0.0.1", "127.0.0.1", { ...Right })), "127.0.0.1");
        assert.equal(ClientAddressOf(FakeRequest("127.0.0.1", "127.0.0.1", { "x-dauntless-gateway": "wrong", "x-forwarded-for": "203.0.113.7" })), "127.0.0.1");
        assert.equal(ClientAddressOf(FakeRequest("127.0.0.1", "127.0.0.1", { "x-forwarded-for": "203.0.113.7" })), "127.0.0.1");
        assert.equal(ClientAddressOf(FakeRequest("198.51.100.4", "10.0.0.2", { ...Right, "x-forwarded-for": "203.0.113.7" })), "198.51.100.4", "the secret from a remote peer is not trusted");

        assert.equal(IsTrustedGatewayRequest(FakeRequest("127.0.0.1", "127.0.0.1", Right)), true);

        const Saved = process.env.GATEWAY_SECRET;
        try{
            delete process.env.GATEWAY_SECRET;
            assert.equal(IsTrustedGatewayRequest(FakeRequest("127.0.0.1", "127.0.0.1", Right)), false, "GATEWAY_SECRET unset: no gateway");
            assert.equal(ClientAddressOf(FakeRequest("127.0.0.1", "127.0.0.1", { ...Right, "x-forwarded-for": "203.0.113.7" })), "127.0.0.1");
            process.env.GATEWAY_SECRET = "";
            assert.equal(IsTrustedGatewayRequest(FakeRequest("127.0.0.1", "127.0.0.1", { "x-dauntless-gateway": "" })), false, "an empty secret trusts nothing");
        }
        finally{
            process.env.GATEWAY_SECRET = Saved;
        }
    });

    it("counts as direct and local only callers on this machine that no proxy relayed", () => {
        assert.equal(IsDirectLocalRequest(FakeRequest("127.0.0.1", "127.0.0.1")), true);
        assert.equal(IsDirectLocalRequest(FakeRequest("::1", "::1")), true);
        assert.equal(IsDirectLocalRequest(FakeRequest("::ffff:127.0.0.1", "::ffff:127.0.0.1")), true);
        assert.equal(IsDirectLocalRequest(FakeRequest("100.64.1.2", "100.64.1.2")), true, "a game server calling this machine's Tailscale address (private mode)");
        assert.equal(IsDirectLocalRequest(FakeRequest("100.64.1.3", "100.64.1.2")), false, "another tailnet machine");
        assert.equal(IsDirectLocalRequest(FakeRequest("203.0.113.5", "127.0.0.1")), false);
        assert.equal(IsDirectLocalRequest(FakeRequest(undefined, undefined)), false);
        assert.equal(IsDirectLocalRequest(FakeRequest("127.0.0.1", "127.0.0.1", { "x-forwarded-for": "127.0.0.1" })), false);
        assert.equal(IsDirectLocalRequest(FakeRequest("127.0.0.1", "127.0.0.1", { "x-dauntless-gateway": GATEWAY_TEST_SECRET })), false);

        const Saved = process.env.GAMESERVER_ALLOW_FROM;
        try{
            process.env.GAMESERVER_ALLOW_FROM = "172.20.0.5, not-an-ip";
            assert.equal(IsDirectLocalRequest(FakeRequest("172.20.0.5", "172.20.0.1")), true, "listed in GAMESERVER_ALLOW_FROM");
            assert.equal(IsDirectLocalRequest(FakeRequest("172.20.0.6", "172.20.0.1")), false);
            assert.equal(IsDirectLocalRequest(FakeRequest("172.20.0.5", "172.20.0.1", { "via": "1.1 x" })), false, "still never through a proxy");
        }
        finally{
            if(Saved === undefined) delete process.env.GAMESERVER_ALLOW_FROM; else process.env.GAMESERVER_ALLOW_FROM = Saved;
        }

        assert.equal(IsProxiedRequest(FakeRequest("127.0.0.1", "127.0.0.1")), false);
        assert.equal(IsProxiedRequest(FakeRequest("127.0.0.1", "127.0.0.1", { "forwarded": "for=1.2.3.4" })), true);
    });

    it("checks the public-mode configuration at startup", () => {
        const Good = { GATEWAY_SECRET: GATEWAY_TEST_SECRET, AUTH_MODE: "APIKEY", BIND_HOST: "127.0.0.1", NODE_ENV: "production", QOS_TARGET_URL: "http://127.0.0.1:61000/QoS" };

        assert.deepEqual(CheckGatewayConfig({ AUTH_MODE: "APIKEY" }), { Enabled: false, Errors: [], Warnings: [] }, "no secret, no gateway, nothing to say");
        assert.deepEqual(CheckGatewayConfig({ ...Good, GATEWAY_SECRET: "" }), { Enabled: false, Errors: [], Warnings: [] });
        assert.deepEqual(CheckGatewayConfig(Good), { Enabled: true, Errors: [], Warnings: [] });
        assert.deepEqual(CheckGatewayConfig({ ...Good, BIND_HOST: undefined }).Warnings, [], "BIND_HOST defaults to loopback");
        assert.equal(CheckGatewayConfig({ ...Good, AUTH_MODE: "NONE" }).Errors.length, 1);
        assert.equal(CheckGatewayConfig({ ...Good, AUTH_MODE: undefined }).Errors.length, 1);
        assert.equal(CheckGatewayConfig({ ...Good, GATEWAY_SECRET: "short" }).Warnings.length, 1);
        assert.equal(CheckGatewayConfig({ ...Good, BIND_HOST: "0.0.0.0" }).Warnings.length, 1);
        assert.equal(CheckGatewayConfig({ ...Good, NODE_ENV: "development" }).Warnings.length, 1);
        assert.equal(CheckGatewayConfig({ ...Good, QOS_TARGET_URL: "http://203.0.113.1:61000/QoS" }).Warnings.length, 1);
    });
});

// ---- 5. Matchmaking input that reaches a game server's command line ----

describe("matchmaking input", () => {
    it("accepts what the client sends and nothing shaped otherwise", () => {
        assert.equal(CheckMatchmakingInput("ISLAND", TUTORIAL_ARGS, undefined), undefined);
        assert.equal(CheckMatchmakingInput("CITY", "", "ShatteredIsles_ReturnToRamsgate"), undefined);
        assert.equal(CheckMatchmakingInput("SHARED", "", "ShatteredIsles_TrainingDojo"), undefined);
        assert.equal(CheckMatchmakingInput("ISLAND", "", "CR19_PlayerHunt_FTUE_Pursuit_Beta_LeRawr"), undefined);
        assert.equal(CheckMatchmakingInput("ISLAND", "", "CR19_PlayerHunt_Patrol_Heroic+_Gem"), undefined);
        assert.equal(CheckMatchmakingInput("ISLAND", "   ", ""), undefined);
        assert.equal(CheckMatchmakingInput("ISLAND", "/Game/Maps/islands/x?MaxPlayers=1?MonsterClass=", undefined), undefined, "an empty behemoth is an empty argument");
        assert.equal(CheckMatchmakingInput("CITY", "whatever the city ignores", "ShatteredIsles_ReturnToRamsgate"), undefined, "game args are only used for ISLAND");

        for(const [GameArgs, HuntId] of [
            ["/Game/Maps/islands/x -ExecCmds=quit?MaxPlayers=1?MonsterClass=/Game/M/b.b_C", undefined],
            ["/Game/Maps/islands/x?MaxPlayers=1?MonsterClass=/Game/M/b.b_C -log", undefined],
            ["/Game/Maps/islands/x?MaxPlayers=1?MonsterClass=\"/Game/M/b.b_C", undefined],
            ["/Game/Maps/islands/x", undefined],
            ["/Game/Maps/islands/x?MaxPlayers=1", undefined],
            ["C:/Windows/x?MaxPlayers=1?MonsterClass=/Game/M/b.b_C", undefined],
            ["/Game/../x?MaxPlayers=1?MonsterClass=/Game/M/b.b_C", undefined],
            ["/Game/Maps/x?MaxPlayers=1?MonsterClass=-ExecCmds", undefined],
            [{ a: 1 }, undefined],
            ["", "CR19_PlayerHunt_Arena x"],
            ["", "CR19_PlayerHunt_Arena:x,UID-y:z"],
            ["", 5],
            ["", ["CR19"]],
            ["", "x".repeat(129)]
        ] as [unknown, unknown][]){
            assert.notEqual(CheckMatchmakingInput("ISLAND", GameArgs, HuntId), undefined, JSON.stringify([GameArgs, HuntId]));
        }
    });

    it("refuses bad input at /candidate/join (400) before the deploy server hears of it", async () => {
        const Before = DeployCalls.length;

        for(const Body of [
            { gameMode: "ISLAND", gameArgs: "/Game/Maps/islands/x -ExecCmds=quit?MaxPlayers=1?MonsterClass=/Game/M/b.b_C" },
            { gameMode: "ISLAND", gameArgs: "/Game/Maps/islands/x" },
            { gameMode: "ISLAND", gameArgs: "", playerHuntId: "CR19_PlayerHunt_Arena -ExecCmds=quit" },
            { gameMode: "ISLAND", gameArgs: "", playerHuntId: 5 },
            { gameMode: "CITY", gameArgs: "", playerHuntId: "Ramsgate\"" }
        ]){
            assert.equal((await Call("POST", "/candidate/join", { as: A, body: Body })).status, 400, JSON.stringify(Body));
        }

        assert.equal(DeployCalls.length, Before, "nothing reached the deploy server");
    });

    it("passes the client's real requests through unchanged", async () => {
        const Tutorial = await Call("POST", "/candidate/join", { as: A, body: { gameMode: "ISLAND", gameArgs: TUTORIAL_ARGS } });
        assert.equal(Tutorial.status, 200);
        assert.deepEqual(DeployCalls[DeployCalls.length - 1], { GameMode: "ISLAND", GameArgs: TUTORIAL_ARGS });

        const City = await Call("POST", "/candidate/join", { as: A, body: { gameMode: "CITY", gameArgs: "", playerHuntId: "ShatteredIsles_ReturnToRamsgate" } });
        assert.equal(City.status, 200);
        assert.deepEqual(DeployCalls[DeployCalls.length - 1], { GameMode: "CITY", GameArgs: "", HuntId: "ShatteredIsles_ReturnToRamsgate", ExpectedPlayers: [A] });

        const Hunt = await Call("POST", "/candidate/join", { as: B, body: { gameMode: "ISLAND", gameArgs: "", playerHuntId: "CR19_PlayerHunt_Patrol_Heroic+_Gem" } });
        assert.deepEqual([Hunt.status, Hunt.json?.status], [200, "MATCHING"], "queued");
    });
});
