-- FrameTick: run callbacks every N seconds on the GAME THREAD, driven by a per-frame hook,
-- instead of LoopAsync.
--
-- Why: Ctrl+R (hot reload) hung several times while stopping the mods that had fast
-- LoopAsync loops (the health bar pointer every 60 ms). LoopAsync runs on
-- its own thread, which UE4SS must stop on reload; hooks are simply unregistered (the log
-- shows that working cleanly), so hook-driven ticks avoid that.
--
-- Driver: the HUD compass widget's Tick, called every frame while the HUD is up (hunts and
-- town). Verified in UE4SS_ObjectDump.txt:
--   /Game/UI/HUD/Compass/Widgets/bpw_Compass.bpw_Compass_C:Tick (MyGeometry, InDeltaTime)
--   /Script/Engine.PlayerController:ClientRestart  (fires when the player pawn spawns)
--   /Script/Engine.GameplayStatics:GetRealTimeSeconds
-- If the compass class isn't loaded yet when a mod starts, the hook is retried on every
-- ClientRestart. No HUD (loading screens) = no ticks, which is fine: nothing to do then.
--
-- Usage (each mod has its own copy of this module):
--   local FrameTick = require("FrameTick")
--   FrameTick.Every(0.25, "main", function() ... end)
--   FrameTick.Start(log)

local M = {}

local TICK_FN = "/Game/UI/HUD/Compass/Widgets/bpw_Compass.bpw_Compass_C:Tick"
local RESTART_FN = "/Script/Engine.PlayerController:ClientRestart"

local tickers = {}
local hooked = false
local restartHooked = false
local lastT = nil
local GS = nil
local context, objectWorld = nil, nil
local objects = {}
local bootstrapPC, bootstrapAt = nil, -1e9
local logf = print
local errOnce = {}

local function valid(o)
    if not o then return false end
    local ok, v = pcall(function() return o:IsValid() end)
    if not ok or v ~= true then return false end
    -- A non-null wrapper can survive an actor/header transition with no class.
    -- Native GetFullName dereferences that class; pcall cannot catch its AV.
    local hasClass, cls = pcall(function() return o:GetClass() end)
    if not hasClass or not cls then return false end
    local classOK, classLive = pcall(function() return cls:IsValid() end)
    return classOK and classLive == true
end
M.Valid = valid

function M.ObjectKey(o)
    if not valid(o) then return nil end
    local ok, key = pcall(function()
        local name = o:GetFName()
        if type(name) ~= "string" then name = name:ToString() end
        return tostring(o:GetAddress()) .. ":" .. name
    end)
    return ok and key or nil
end

-- Match owned components/attribute sets without GetFullName/GetPathName walking
-- an unchecked owner chain in native code. Bound cycles and reject dead outers.
function M.OwnedBy(o, ownerKey)
    if not ownerKey then return false end
    for _ = 1, 16 do
        local key = M.ObjectKey(o)
        if not key then return false end
        if key == ownerKey then return true end
        local ok, outer = pcall(function() return o:GetOuter() end)
        if not ok then return false end
        o = outer
    end
    return false
end

-- Real time in seconds (same clock for every tick), or nil.
function M.Now(ctx)
    if not valid(GS) then GS = StaticFindObject("/Script/Engine.Default__GameplayStatics") end
    local ok, t = pcall(function() return GS:GetRealTimeSeconds(ctx) end)
    if ok and type(t) == "number" then return t end
    return nil
end

-- The driving compass already belongs to the local player. Do not walk the
-- entire UObject array every frame just to poll two lock-on keys.
function M.PlayerController()
    if valid(context) then
        local ok, pc = pcall(function() return context:GetOwningPlayer() end)
        if ok and valid(pc) then return pc end
        return nil
    end
    if valid(bootstrapPC) then return bootstrapPC end
    local now = os.clock()
    if now - bootstrapAt < 1 then return nil end
    bootstrapAt = now
    -- Startup/reload callbacks can run before the first compass Tick.
    for _, pc in ipairs(FindAllOf("ArchonPlayerController") or {}) do
        local ok, localPlayer = pcall(function() return pc:IsLocalController() end)
        if ok and localPlayer and valid(pc) then bootstrapPC = pc return pc end
    end
end

-- Discovery is slow; health, movement and input still update at caller cadence.
-- Each Lua mod owns this cache. Callers must validate objects before use.
function M.Objects(class)
    if not lastT or not valid(context) then return {} end
    local ok, world = pcall(function() return GS:GetGameState(context) end)
    if not ok or not valid(world) then objects, objectWorld = {}, nil return {} end
    local address = world:GetAddress()
    if address ~= objectWorld then objects, objectWorld = {}, address end
    local entry = objects[class]
    if not entry or lastT < entry.at or lastT - entry.at >= 1 then
        entry = {at = lastT, list = FindAllOf(class) or {}}
        objects[class] = entry
    end
    return entry.list
end

local function OnFrame(self)
    local ctx = nil
    pcall(function() ctx = self:get() end)
    local t = M.Now(ctx)
    if not t then return end
    if t == lastT then return end      -- several compass widgets tick the same frame
    context = ctx
    -- The engine's real-time clock restarts at 0 in every new world (map change, raid start).
    -- Without this, every ticker waited until the new clock passed its old "last run" time, so
    -- the mods stalled after a map change until Ctrl+R. Clock went backwards -> run everything now.
    if lastT and t < lastT - 0.5 then
        objects = {}
        for _, tk in ipairs(tickers) do tk.last = -1e9 end
        logf(string.format("FrameTick: new map (clock %.1f -> %.1f), timers reset", lastT, t))
    end
    lastT = t
    for _, tk in ipairs(tickers) do
        if t - tk.last >= tk.interval then
            tk.last = t
            local ok, err = pcall(tk.fn, t)
            if not ok and not errOnce[tk.name] then
                errOnce[tk.name] = true
                logf("FrameTick '" .. tk.name .. "' error: " .. tostring(err))
            end
        end
    end
end

local function TryHook()
    if hooked then return true end
    if not valid(StaticFindObject(TICK_FN)) then return false end
    local ok, err = pcall(function()
        RegisterHook(TICK_FN, function(self) OnFrame(self) end)
    end)
    if ok then
        hooked = true
        logf("FrameTick: driven by the HUD compass Tick")
    else
        logf("FrameTick: hook failed: " .. tostring(err))
    end
    return hooked
end

-- Run fn about every `interval` seconds (0 = every frame). fn(nowSeconds).
function M.Every(interval, name, fn)
    tickers[#tickers + 1] = {interval = interval, name = name, fn = fn, last = -1e9}
end

-- Start(log[, modName]). modName is accepted and ignored: it named the heartbeat file that the
-- removed Mod Status Indicator read.
function M.Start(logFunction, modName)
    local _ = modName
    if logFunction then logf = logFunction end
    if not TryHook() then
        logf("FrameTick: compass not loaded yet - will hook when the player spawns")
    end
    if not restartHooked then
        local ok, err = pcall(function()
            RegisterHook(RESTART_FN, function()
                context, objectWorld, bootstrapPC, bootstrapAt, objects = nil, nil, nil, -1e9, {}
                pcall(TryHook)
            end)
        end)
        restartHooked = ok
        if not ok then logf("FrameTick: ClientRestart hook failed: " .. tostring(err)) end
    end
end

function M.IsRunning() return hooked end

return M
