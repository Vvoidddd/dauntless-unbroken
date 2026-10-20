import { RemoveTestDb } from "./setup";
import "./authenv";
import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import { GetDb } from "../src/db";
import { Call, StartApp, StopApp } from "./appclient";
import { MakePlayer } from "./helpers";

before(StartApp);
after(async () => { await StopApp(); RemoveTestDb(() => GetDb().$client.close()); });

it("bounds creator reads and submissions before authentication with one independent budget", async () => {
    for(let I = 0; I < 120; I++){
        assert.equal((await Call(I % 2 ? "GET" : "POST", "/creator")).status, 401);
    }
    assert.equal((await Call("GET", "/creator")).status, 429);
    const A = await MakePlayer();
    assert.equal((await Call("POST", "/creator", {as: A.UserId, body: {slug: "Void"}})).status, 429);
    assert.equal((await Call("GET", "/dauntless-status")).status, 200);
});
