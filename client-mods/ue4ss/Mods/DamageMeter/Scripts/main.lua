-- Read the combat-text RPC once, before its local-player/distance display filter.
-- No attack, damage, camera, replication or server state is changed.
local FrameTick = require("FrameTick")
local Settings = require("ModSettings")
local Ledger = require("DamageLedger")
local state = Ledger.New()
local HOOK = "/Script/Archon.ArchonCombatTextComponent:MulticastSendMultitypeCombatText"
local HUD = require("HudPanel")
local OPACITY = 0.995 -- Distinct from Tracker (0.996), ModMenu (0.997) and LockOn (0.993).
local panel, roster = nil, {}
local hooked, context, uiWorld, showTeam = false, nil, nil, nil
local logged = {}
local function logOnce(key, message)
    if not logged[key] then logged[key] = true print("[DamageMeter] " .. message) end
end
local function valid(o)
    local ok, result = pcall(function() return o:IsValid() end)
    return ok and result
end
local function unwrap(o)
    local ok, result = pcall(function() return o:get() end)
    return ok and result or o
end
local function key(o)
    if not valid(o) then return nil end
    local ok, name = pcall(function() return o:GetFullName() end)
    return ok and name or nil
end
local function worldKey(o)
    local name = key(o)
    if not name then return nil end
    local ok, address = pcall(function() return o:GetAddress() end)
    return ok and name .. ":" .. tostring(address) or nil
end
local function str(s)
    if type(s) == "string" then return s end
    local ok, result = pcall(function() return s:ToString() end)
    return ok and result or ""
end
local function identity(ps)
    -- Player names are unique on this realm and survive a pawn respawn. The
    -- object key is retained separately so only this world's roster is credited.
    local ok, name = pcall(function() return str(ps:GetPlayerName()) end)
    name = ok and name:gsub("[%z\1-\31\127]", "") or ""
    if name == "" then return nil end
    return name:lower(), name
end
local function refresh()
    context, roster = nil, {}
    local gs = StaticFindObject("/Script/Engine.Default__GameplayStatics")
    local archon = StaticFindObject("/Script/Archon.Default__ArchonGameplayStatics")
    if not valid(gs) or not valid(archon) then return end
    local pc
    for _, controller in ipairs(FindAllOf("ArchonPlayerController") or {}) do
        local ok, localPlayer = pcall(function() return controller:IsLocalController() end)
        if ok and localPlayer and valid(controller) then pc = controller break end
    end
    if not pc then return end
    local ok, city = pcall(function() return archon:IsInCity(pc) end)
    if not ok or city then return end
    local game = gs:GetGameState(pc)
    local world = worldKey(game)
    if not world then return end
    local session = str(archon:GetOnlineSessionId(pc))
    if session == "" or session == "None" then
        session = world
    end
    local now = FrameTick.Now(pc)
    if not now then return end
    local own = key(pc.PlayerState)
    game.PlayerArray:ForEach(function(_, value)
        local ps = unwrap(value)
        local objectKey = key(ps)
        local id, name = identity(ps)
        if objectKey and id then roster[objectKey] = {id = id, name = name, own = objectKey == own} end
    end)
    local me = roster[own]
    if not me then return end
    Ledger.Advance(state, session, now)
    context = {pc = pc, gs = gs, game = game, world = world, uiKey = world .. ":" .. session, session = session, me = me.id, now = now}
end

local function receive(self, entries)
    local ok, err = pcall(function()
        if not context then refresh() end
        if not context then return end
        local component = unwrap(self)
        if not valid(component) then return end
        local owner = component:GetOwner()
        local behemoth = StaticFindObject("/Script/Archon.ArchonBehemoth")
        if not valid(owner) or not valid(behemoth) or not owner:IsA(behemoth) then return end
        if worldKey(context.gs:GetGameState(owner)) ~= context.world then return end
        local now = FrameTick.Now(owner)
        if not now then return end
        unwrap(entries):ForEach(function(_, value)
            local entry = unwrap(value)
            local source = unwrap(entry.SourceActor)
            if not valid(source) then return end
            local hasState, ps = pcall(function() return source.PlayerState end)
            if not hasState then return end
            local player = roster[key(ps)]
            if not player then return end
            Ledger.Record(state, context.session, now, player.id, player.name, {
                core = entry.CoreDamage, part = entry.PartDamage,
                stagger = entry.StaggerDamage, wound = entry.ExposeDamage,
            })
        end)
    end)
    if not ok then logOnce("receive", "Combat event unavailable: " .. tostring(err)) end
    -- Returning nothing preserves the original RPC and all of its parameters.
end
local function tryHook()
    if hooked or not valid(StaticFindObject(HOOK)) then return end
    local ok, err = pcall(function() RegisterHook(HOOK, receive) end)
    hooked = ok
    if ok then print("[DamageMeter] Reading observed combat events")
    else logOnce("hook", "Could not attach damage events: " .. tostring(err)) end
end

local white = {R = 0.96, G = 0.95, B = 1, A = 1}
local muted = {R = 0.66, G = 0.68, B = 0.76, A = 1}
local purple = {R = 0.78, G = 0.58, B = 1, A = 1}
local function removeUI()
    HUD.Remove(panel)
    panel, uiWorld, showTeam = nil, nil, nil
end
local function makeUI(team)
    removeUI()
    panel = HUD.New(context.pc, OPACITY, {X = 0, Y = 0.5}, 24, 32, 310, team and 360 or 205)
    local function label(id, text, size, color, y, x, width)
        HUD.Label(panel, id, text, size, color, x or 12, y, width or 286)
    end
    label("core", "0  core damage", 22, white, 7)
    label("dps", "0  DPS", 21, white, 36)
    label("part", "0  part damage", 21, {R = 1, G = 0.82, B = 0.3, A = 1}, 65)
    label("stagger", "0  stagger damage", 21, {R = 0.45, G = 0.7, B = 1, A = 1}, 94)
    label("wound", "0  wound damage", 21, {R = 1, G = 0.38, B = 0.35, A = 1}, 123)
    label("total", "Team total  0", 16, purple, 156)
    label("scope", "Observed this visit · DPS since first hit", 13, muted, 183)
    if team then
        label("team", "TEAM · CORE DAMAGE", 16, purple, 211)
        for i = 1, 4 do
            label("player" .. i, "—", 17, white, 237 + (i - 1) * 27, 12, 142)
            label("damage" .. i, "", 14, white, 237 + (i - 1) * 27, 166, 132)
        end
    end
    uiWorld, showTeam = context.uiKey, team
end
local function set(id, text, own)
    HUD.Set(panel, id, text, own ~= nil and (own and purple or white) or nil)
end
local function count(n)
    local s = tostring(math.floor(n + 0.5))
    return s:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", "")
end
local function pulse(now)
    if not context or not hooked or not Settings.Get("dm_visible", true) then removeUI() return end
    Ledger.Advance(state, context.session, now)
    local team = Settings.Get("dm_team", false)
    if uiWorld ~= context.uiKey or showTeam ~= team or not panel or not valid(panel.root) then makeUI(team) end
    local snapshot, own = Ledger.Snapshot(state), nil
    for _, row in ipairs(snapshot.rows) do if row.id == context.me then own = row break end end
    own = own or {core = 0, part = 0, stagger = 0, wound = 0, dps = 0}
    set("core", count(own.core) .. "  core damage")
    set("dps", count(own.dps) .. "  DPS")
    for _, channel in ipairs({"part", "stagger", "wound"}) do set(channel, count(own[channel]) .. "  " .. channel .. " damage") end
    set("total", "Team total  " .. count(snapshot.core))
    if team then
        for i = 1, 4 do
            local row = snapshot.rows[i]
            set("player" .. i, row and row.name or "—", row and row.id == context.me)
            set("damage" .. i, row and count(row.core) .. "  " .. string.format("%.0f%%", row.share * 100) or "", row and row.id == context.me)
        end
        set("team", #snapshot.rows > 4 and "TEAM · TOP 4 CORE DAMAGE" or "TEAM · CORE DAMAGE", true)
    end
end

HUD.Cleanup(OPACITY)
FrameTick.Every(1, "damage-settings", Settings.Load)
FrameTick.Every(1, "damage-hook", tryHook)
FrameTick.Every(0.5, "damage-roster", refresh)
FrameTick.Every(0.25, "damage-panel", pulse)
tryHook()
FrameTick.Start(print, "DamageMeter")
