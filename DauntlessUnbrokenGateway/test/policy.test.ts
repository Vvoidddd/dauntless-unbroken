import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CanonicalPath, CheckPath, Classify, HasBearer } from "../src/policy";
import { IsPublicRoute, DauntlessUnbrokenApiRoutes } from "./helpers";

describe("the /unbroken/api routes", () => {
    it('allows only support submission while keeping the inbox and review private',()=>{
        assert.equal(Classify('POST','/unbroken/api/SupportReport',{},false).action,'proxy');
        for(const method of ['GET','HEAD','POST','DELETE'])for(const route of ['SupportReports','SupportReports/123','SupportReports/123/review'])assert.equal(Classify(method,'/unbroken/api/'+route,{},false).action,'reject');
        assert.equal(Classify('GET','/unbroken/api/SupportReport',{},false).action,'reject');
    });
    it('passes account playtime and receipts reads without allowing account mutations',()=>{
        for(const route of ['Playtime','PurchaseHistory']){
            for(const method of ['GET','HEAD']) assert.equal(Classify(method,'/unbroken/api/'+route,{},false).action,'proxy');
            for(const method of ['POST','PUT','PATCH','DELETE']) assert.equal(Classify(method,'/unbroken/api/'+route,{},false).action,'reject');
            assert.equal(Classify('GET','/unbroken/api/'+route+'/someone-else',{},false).action,'reject');
        }
    });
    it('passes only launcher admission join, own status and cancellation verbs',()=>{
        for(const method of ['GET','POST','DELETE']) assert.equal(Classify(method,'/unbroken/api/Admission',{},false).action,'proxy');
        for(const method of ['PUT','PATCH','HEAD']) assert.equal(Classify(method,'/unbroken/api/Admission',{},false).action,'reject');
        assert.equal(Classify('POST','/unbroken/api/Admission/other-user',{},false).action,'reject');
    });
    it("allows only POST device checks; upstream still decides authentication and bans", () => {
        assert.equal(Classify("POST", "/unbroken/api/DeviceSignals", {}, false).action,"proxy");
        for(const method of ["GET","HEAD","PUT","DELETE"]){
            const result=Classify(method,"/unbroken/api/DeviceSignals",{},false);
            assert.ok(result.action==="reject" && result.status===403);
        }
    });
    const Routes = DauntlessUnbrokenApiRoutes();

    it("the metagame source still has the routes this gateway knows about", () => {
        assert.ok(Routes.length >= 20, `found only ${Routes.length} routes`);
        for(const Name of ["Register", "GetUserInfo", "ServerStatus", "RegistrationStatus", "CreateInvite", "RenameUser", "GenerateJWTForUserId", "GrantEntitlement", "RollbackCharacter"]){
            assert.ok(Routes.some((Route) => Route.path === `/unbroken/api/${Name}`), Name);
        }
    });

    it("only explicitly allowed player routes pass; every admin route is 403", () => {
        let Passed = 0;
        for(const Route of Routes){
            const Choice = Classify(Route.method, Route.path, {}, false);
            if(IsPublicRoute(Route.method, Route.path)){
                assert.equal(Choice.action, "proxy", `${Route.method} ${Route.path}`);
                Passed++;
            }
            else{
                assert.equal(Choice.action, "reject", `${Route.method} ${Route.path}`);
                assert.equal(Choice.action === "reject" && Choice.status, 403);
                assert.equal(Choice.action === "reject" && Choice.reason, "admin_route");
            }
        }
        assert.equal(Passed, 13);
        // POST RegistrationStatus changes the registration mode: admin only, blocked.
        assert.equal(Classify("POST", "/unbroken/api/RegistrationStatus", {}, false).action, "reject");
        assert.equal(Classify("HEAD", "/unbroken/api/Register", {}, false).action, "reject");
        assert.equal(Classify("GET", "/unbroken/api/UsernameAvailable?Username=x", {}, false).action, "reject");
    });

    it("spelling tricks cannot reach an admin route", () => {
        const Variants = [
            "/UNBROKEN/API/CREATEINVITE", "/unbroken/api/createinvite", "/unbroken/api/CreateInvite/", "/unbroken/api/CreateInvite//",
            "/unbroken//api/CreateInvite", "//unbroken/api/CreateInvite", "/unbroken/api/%43reateInvite", "/%75nbroken/api/CreateInvite",
            "/unbroken/api/CreateInvite?x=/unbroken/api/Register", "/unbroken/api/Register/../CreateInvite", "/unbroken/api/./CreateInvite",
            "/unbroken%2fapi/CreateInvite", "/unbroken/api%2FCreateInvite", "/unbroken/api/CreateInvite%00", "/unbroken/api\\CreateInvite",
            "/unbroken/api/%2e%2e/api/CreateInvite", "/unbroken/api/Register;/CreateInvite", "/unbroken/api/Register/", "/unbroken",
            "/unbroken/api", "/unbroken/api/", "/unbroken/api/Register/x", "/unbroken/api/%zz",
        ];
        for(const Variant of Variants){
            const Choice = Classify("POST", Variant, {}, false);
            if(Variant === "/unbroken/api/Register/"){
                // Express treats the trailing slash as the same route: this is Register itself.
                assert.equal(Choice.action, "proxy", Variant);
                continue;
            }
            assert.equal(Choice.action, "reject", Variant);
            assert.ok(Choice.action === "reject" && (Choice.status === 403 || Choice.status === 400), Variant);
        }
    });
});

describe("Classify", () => {
    it("routes /content to the content server, upgrades to the websocket upstream, the rest to the metagame", () => {
        assert.deepEqual(Classify("GET", "/content/v1/manifest", {}, false), { action: "proxy", upstream: "content", limitClass: "content" });
        assert.deepEqual(Classify("GET", "/Content/v1/files/Archon/x.pak", {}, false), { action: "proxy", upstream: "content", limitClass: "content" });
        assert.deepEqual(Classify("GET", "/party/invites", {}, false), { action: "proxy", upstream: "metagame", limitClass: "general" });
        assert.deepEqual(Classify("GET", "/contentx", {}, false), { action: "proxy", upstream: "metagame", limitClass: "general" });
        assert.deepEqual(Classify("GET", "/xmpp", { upgrade: "websocket" }, true), { action: "proxy", upstream: "ws", limitClass: "ws" });
        assert.deepEqual(Classify("GET", "/", { upgrade: "WebSocket" }, true), { action: "proxy", upstream: "ws", limitClass: "ws" });
        // The client's own odd path from the logs goes through untouched.
        assert.deepEqual(Classify("GET", "/account127.0.0.1:61000", {}, false), { action: "proxy", upstream: "metagame", limitClass: "general" });
        assert.deepEqual(Classify("POST", "/inventory/7d1c9d8e-2b43-4c55-9d0e-6f3a0c1e2b44/dauntlessrel-1.4.4:239827", {}, false).action, "proxy");
    });

    it("marks heartbeats and token requests for the allowlist feed", () => {
        assert.deepEqual(Classify("POST", "/heartbeat", {}, false), { action: "proxy", upstream: "metagame", limitClass: "general", feed: "heartbeat" });
        assert.deepEqual(Classify("POST", "/HEARTBEAT/", {}, false), { action: "proxy", upstream: "metagame", limitClass: "general", feed: "heartbeat" });
        assert.deepEqual(Classify("POST", "/account/api/oauth/token", {}, false), { action: "proxy", upstream: "metagame", limitClass: "token", feed: "token" });
        assert.equal((Classify("GET", "/heartbeat", {}, false) as any).feed, undefined);
        assert.equal((Classify("POST", "/heartbeatx", {}, false) as any).feed, undefined);
        assert.equal((Classify("POST", "/account/api/oauth/verify", {}, false) as any).feed, undefined);
    });

    it("only POST game login receives the bearer-required allowlist feed", () => {
        for(const route of ["/game/login", "/GAME/LOGIN/", "/game/login?x=1"]){
            assert.equal((Classify("POST", route, {}, false) as any).feed, "heartbeat");
        }
        for(const [method, route] of [["GET", "/game/login"], ["POST", "/game/loginx"], ["POST", "/game/login/extra"]]){
            assert.equal((Classify(method, route, {}, false) as any).feed, undefined);
        }
    });

    it("puts Register and the token route in their own rate-limit classes", () => {
        assert.equal(Classify("POST", "/unbroken/api/Register", {}, false).limitClass, "register");
        assert.equal(Classify("POST", "/unbroken/api/register/", {}, false).limitClass, "register");
        assert.equal(Classify("POST", "/account/api/oauth/token?x=1", {}, false).limitClass, "token");
        assert.equal(Classify("GET", "/unbroken/api/ServerStatus", {}, false).limitClass, "general");
    });

    it("refuses any request with the game-server key header, whatever its value or route", () => {
        for(const Path of ["/heartbeat", "/character", "/content/v1/manifest", "/unbroken/api/Register", "/progression/UID-1"]){
            for(const Value of ["", "x", "a".repeat(48)]){
                const Choice = Classify("POST", Path, { "x-dauntless-unbroken-gameserver-apikey": Value }, false);
                assert.equal(Choice.action, "reject");
                assert.equal(Choice.action === "reject" && Choice.status, 403);
                assert.equal(Choice.action === "reject" && Choice.reason, "gameserver_key_header");
            }
        }
        const Upgrade = Classify("GET", "/xmpp", { "x-dauntless-unbroken-gameserver-apikey": "k", upgrade: "websocket" }, true);
        assert.equal(Upgrade.action === "reject" && Upgrade.status, 403);
    });

    it("refuses targets that are not a plain path, odd methods and non-websocket upgrades", () => {
        assert.equal((Classify("GET", "http://evil.example/unbroken/api/CreateInvite", {}, false) as any).status, 400);
        assert.equal((Classify("OPTIONS", "*", {}, false) as any).status, 400);
        assert.equal((Classify("GET", "", {}, false) as any).status, 400);
        assert.equal((Classify("TRACE", "/heartbeat", {}, false) as any).status, 405);
        assert.equal((Classify("CONNECT", "/heartbeat", {}, false) as any).status, 405);
        assert.equal((Classify("GET", "/xmpp", { upgrade: "h2c" }, true) as any).status, 400);
        assert.equal((Classify("POST", "/xmpp", { upgrade: "websocket" }, true) as any).status, 400);
        assert.equal((Classify("GET", "/unbroken/api/ServerStatus", { upgrade: "websocket" }, true) as any).status, 403);
    });

    it("the 1.4.4 client's chat connection: libwebsockets asks for //, which goes to the websocket upstream in its own bucket", () => {
        // The request target of the game's XMPP WebSocket (exe 0x1441f761f, docs/findings/chat.md)
        assert.deepEqual(Classify("GET", "//", { upgrade: "websocket", "sec-websocket-protocol": "xmpp", origin: "http://127.0.0.1" }, true), { action: "proxy", upstream: "ws", limitClass: "ws" });
        assert.equal((Classify("GET", "//unbroken/api/x", { upgrade: "websocket" }, true) as any).status, 403);
        assert.equal((Classify("GET", "//unbroken/api/x", {}, false) as any).status, 403);
    });
});

describe("path helpers", () => {
    it("CheckPath refuses dot segments, backslashes, controls and encoded separators", () => {
        for(const Good of ["/", "/heartbeat", "/progression/UID-00000000-0000-4000-8000-00000000f609", "/inventory/x/dauntlessrel-1.4.4:239827", "/motd/", "/a.b/c..d/.e"]){
            assert.equal(CheckPath(Good), "ok", Good);
        }
        for(const Bad of ["/a/../b", "/a/./b", "/..", "/a/..", "/a\\b", "/a\u0000b", "/a\tb", "/a%2Fb", "/a%5cb", "/a%00", "/a/%2e%2e/b", "/a/%2E/b"]){
            assert.equal(CheckPath(Bad), "bad_path", Bad);
        }
    });

    it("CanonicalPath matches the way Express matches routes, and then some", () => {
        assert.equal(CanonicalPath("/unbroken/api/Register/"), "/unbroken/api/register");
        assert.equal(CanonicalPath("//a///b//"), "/a/b");
        assert.equal(CanonicalPath("/"), "/");
        assert.equal(CanonicalPath("/%41"), "/a");
        assert.equal(CanonicalPath("/%zz"), undefined);
    });

    it("HasBearer wants a bearer token", () => {
        assert.equal(HasBearer({ authorization: "Bearer abc" }), true);
        assert.equal(HasBearer({ authorization: "bearer abc" }), true);
        assert.equal(HasBearer({ authorization: "Bearer " }), false);
        assert.equal(HasBearer({ authorization: "Basic abc" }), false);
        assert.equal(HasBearer({}), false);
    });
});
