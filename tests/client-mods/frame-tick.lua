-- Native-call budget, not an FPS benchmark. Run from the repository root.
local nextAddress = 0
local function object(value)
    value = value or {}
    value.IsValid = function(self) return not self.invalid end
    value.GetClass = function(self)
        if self.classless then return nil end
        return {IsValid = function() return true end}
    end
    nextAddress=nextAddress+1
    local address=nextAddress
    value.GetAddress=value.GetAddress or function() return address end
    value.GetFName=value.GetFName or function() return "object" end
    return value
end
local now, address, scans, hooks = 0, 100, {}, {}
local pc = object({IsLocalController = function() return true end})
local compass = object({GetAddress = function() return address end, GetOwningPlayer = function() return pc end})
local boss = object({hp = 100})
local bosses = {boss}
local game = object({GetAddress = function() return address end})
local gs = object({GetRealTimeSeconds = function() return now end, GetGameState = function() return game end})
StaticFindObject = function(path)
    return path == "/Script/Engine.Default__GameplayStatics" and gs or object()
end
FindAllOf = function(class)
    scans[class] = (scans[class] or 0) + 1
    if class == "ArchonPlayerController" then return {pc} end
    return bosses
end
RegisterHook = function(path, callback) hooks[path] = callback end
local tick = dofile("client-mods/ue4ss/Mods/shared/FrameTick/FrameTick.lua")
local namesRead = 0
local damaged = object({classless=true, GetFullName=function() namesRead=namesRead+1;error("Native class-name dereference must never run") end})
assert(not tick.Valid(damaged) and tick.ObjectKey(damaged)==nil and namesRead==0,
    "A non-null object with a missing class must be rejected before native name lookup")
damaged.classless=false
damaged.GetFName=function() return "live" end
local liveKey=tick.ObjectKey(damaged)
assert(liveKey and liveKey:match(":live$") and namesRead==0)
damaged.GetFName=function() return "replacement" end
assert(tick.ObjectKey(damaged)~=liveKey, "Reused addresses with a new object name must not retain old state")
damaged.invalid=true
assert(tick.ObjectKey(damaged)==nil and namesRead==0, "Destroyed objects must not be named")
local owner=object({GetFName=function() return "owner" end})
local child=object({GetOuter=function() return owner end})
local nested=object({GetOuter=function() return child end})
assert(tick.OwnedBy(nested,tick.ObjectKey(owner)), "Nested attribute-set ownership must match without path strings")
owner.classless=true
assert(not tick.OwnedBy(nested,"old-owner"), "Broken outer chains must be rejected")
local cycle=object();cycle.GetOuter=function() return cycle end
assert(not tick.OwnedBy(cycle,"different-owner"), "Outer cycles must terminate")
assert(#tick.Objects("ArchonBehemoth") == 0, "No discovery outside a live compass frame")
assert(tick.PlayerController() == pc and tick.PlayerController() == pc)
assert(scans.ArchonPlayerController == 1, "Startup controller lookup is reused")
local seenHP, pulses = nil, 0
tick.Every(0, "input", function()
    assert(tick.PlayerController() == pc)
    assert(tick.PlayerController() == pc) -- Keys and camera both run each frame.
end)
tick.Every(0.06, "tracker", function()
    local list = tick.Objects("ArchonBehemoth")
    seenHP = list[1] and list[1].hp
    pulses = pulses + 1
end)
tick.Every(0.25, "parts", function() tick.Objects("ArchonBehemoth") end)
tick.Start(function() end)
local frame = assert(hooks["/Game/UI/HUD/Compass/Widgets/bpw_Compass.bpw_Compass_C:Tick"])
local self = {get = function() return compass end}
local secondCompass = object({GetAddress = function() return 999 end, GetOwningPlayer = function() return pc end})
local duplicate = {get = function() return secondCompass end}
for i = 0, 1199 do
    now = i / 120
    frame(self)
    frame(duplicate) -- Distinct compass widgets in one world must share discovery.
end
assert(scans.ArchonPlayerController == 1, "Per-frame input must not search all controllers")
assert(scans.ArchonBehemoth <= 10 and pulses > 140, "Discovery is bounded to once/sec; tracker remains responsive")
local before = scans.ArchonBehemoth
boss.hp = 50
now = 10; frame(self)
assert(seenHP == 50, "Cached objects still expose live health")
address, bosses = 200, {object({hp = 75})}
now = 10.1; frame(self)
assert(seenHP == 75 and scans.ArchonBehemoth == before + 2, "New game-state/world discards old discovery immediately")
bosses = {object({hp = 25})}
now = 0; frame(self)
assert(seenHP == 25, "Clock reset with a retained compass discards old-round objects")
local controllerScans = scans.ArchonPlayerController
pc.invalid = true
assert(tick.PlayerController() == nil and scans.ArchonPlayerController == controllerScans,
    "A missing local owner must not trigger an unbounded fallback scan")
pc = object({IsLocalController = function() return true end})
assert(tick.PlayerController() == pc, "Controller replacement is observed without a global scan")
hooks["/Script/Engine.PlayerController:ClientRestart"]()
assert(tick.PlayerController() == pc and scans.ArchonPlayerController == controllerScans + 1,
    "Restart clears the startup fallback controller")
for _, mod in ipairs({"LockOn", "BehemothTracker", "ModMenu", "BehemothHealthBars", "DamageMeter", "PartMonitor", "CraftStar"}) do
    local file = assert(io.open("client-mods/ue4ss/Mods/" .. mod .. "/Scripts/main.lua", "rb"))
    local code = file:read("*a"); file:close()
    assert(not code:find('FindAllOf("ArchonPlayerController")', 1, true), mod .. " must use the shared local controller")
    assert(not code:find(':GetFullName()', 1, true), mod .. " must use the guarded name helper")
    assert(not code:find(':GetPathName()', 1, true), mod .. " must not traverse a native owner path")
end
print("FrameTick: 1200 input frames, <=10 boss discoveries in 10s, live HP and travel invalidation passed")
