import { RemoveTestDb } from "./setup";
import "./authenv";
import { WithEnv } from "./appenv";
import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Call, StartApp, StopApp } from "./appclient";
import { GetDb } from "../src/db";
import { MakePlayer } from "./helpers";
import { ComputeEarnedRanks, GetProgressionPath } from "../src/controllers/progressionrank";
import { GetTrackRecord } from "../src/controllers/realprogression";

before(StartApp);
after(async () => { await StopApp(); RemoveTestDb(() => GetDb().$client.close()); });

it("allows completed 1.10.5 weapon reforges only, with a rank and Aetherheart for each reforge", async () => {
    await WithEnv({BIND_HOST: "127.0.0.1", LOCAL_1105_REALM: "1", PROGRESSION_ALLOW_DELETE: undefined,
        PROGRESSION_CONFIG_DIR: path.resolve("../experiments/1.10.5/progression")}, async () => {
        const {UserId} = await MakePlayer();
        for(const Weapon of ["Axe", "ChainBlades", "Hammer", "Repeaters", "Spear", "Strikers", "Sword"]){
            const Track = `ExperienceTrack_Weapon_${Weapon}`;
            const Url = `/progression/${UserId}/${Track}`;
            GetDb().$client.prepare("INSERT OR REPLACE INTO progress_tracks VALUES (?, ?, ?, ?, 0, 'test', 'test')").run(UserId, Track, 27774, 19);
            assert.equal((await Call("DELETE", Url, {gs: true})).status, 409);
            GetDb().$client.prepare("UPDATE progress_tracks SET progress=27775, confirmedFreeRank=20 WHERE accountId=? AND progressionId=?").run(UserId, Track);
            assert.equal((await Call("DELETE", Url, {as: UserId})).status, 403);
            await WithEnv({LOCAL_1105_REALM: undefined, LOCAL_1105_ACCOUNT_ID: undefined}, async () => {
                assert.equal((await Call("DELETE", Url, {gs: true})).status, 403);
            });
            assert.equal((await Call("DELETE", Url, {gs: true})).status, 200);
            assert.equal(GetTrackRecord(UserId, Track)!.progress, 0);
            assert.equal((await Call("DELETE", Url, {gs: true})).status, 409);
            const Prestige = GetProgressionPath(`PrestigeTrack_Weapon_${Weapon}`)!;
            for(const Count of [0, 1, 2, 10, 100]) assert.equal(ComputeEarnedRanks(Prestige, Count, false).EarnedFreeRank, Count);
            assert.equal((Prestige.free_rewards![0] as any).stacked_items[0].catalog_id, "CURRENCY_PJM_PRESTIGE_FILLED");
            assert.equal((Prestige.free_rewards![0] as any).stacked_items[0].quantity, 1);
            assert.equal((Prestige.prestige as any).free_rewards.stacked_items[0].quantity, 1);
        }
        for(const Track of ["PrestigeTrack_Weapon_Strikers", "MasteryTrack_PlayerLevel", "ExperienceTrack_PlayerLevel", "season09b"]){
            assert.equal((await Call("DELETE", `/progression/${UserId}/${Track}`, {gs: true})).status, 403);
        }
    });
});
