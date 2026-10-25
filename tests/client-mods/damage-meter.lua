-- Run from the repository root: lua tests/client-mods/damage-meter.lua
local dir = "client-mods/ue4ss/Mods/DamageMeter/Scripts/"
local Ledger = dofile(dir .. "DamageLedger.lua")
local state = Ledger.New()
local function hit(id, core, part, stagger, wound, now, session)
    return Ledger.Record(state, session or "hunt-a", now or 10, id, id, {core = core, part = part, stagger = stagger, wound = wound})
end
assert(hit("Void", 100, 400, 200, 50))
assert(hit("Void", 100, 400, 200, 50)) -- Identical hits at the same time are both real hits.
assert(hit("GOLLUM", 300, 100, 0, 0, 12))
Ledger.Advance(state, "hunt-a", 14)
local snapshot = Ledger.Snapshot(state)
assert(snapshot.core == 500 and snapshot.dps == 125)
assert(snapshot.rows[1].id == "GOLLUM" and snapshot.rows[1].share == 0.6)
assert(snapshot.rows[2].part == 800 and snapshot.rows[2].wound == 100)
assert(not hit("Nobody", 0 / 0, math.huge, -100, 0, 14))
assert(not Ledger.Record(state, "hunt-a", math.huge, "Nobody", "Nobody", {core = 1}))
Ledger.Advance(state, "hunt-a", 0) -- Same session/new world clock: retain totals and avoid negative DPS.
assert(Ledger.Snapshot(state).core == 500 and state.elapsed == 4)
Ledger.Advance(state, "hunt-b", 0)
assert(#Ledger.Snapshot(state).rows == 0)
assert(hit("Void", 0, 999, 500, 200, 1, "hunt-b"))
assert(Ledger.Snapshot(state).core == 0 and Ledger.Snapshot(state).rows[1].share == 0)

-- Exercise the shipped hook, roster, world boundaries, live settings and HUD with a tiny engine stand-in.
local noop = function() end
local function object(data)
    data = data or {}
    data.IsValid = function() return true end
    return data
end
local function wrap(value) return {get = function() return value end} end
local function array(values)
    return {ForEach = function(_, fn) for i, v in ipairs(values) do if fn(i, wrap(v)) then break end end end}
end
local now, city, session, worldName, worldAddress = 10, false, "hunt-a", "world-a", 123
local settings, ticks, widgets, callbacks, hookCount = {}, {}, {}, {}, 0
local function player(name)
    return object({GetPlayerName = function() return name end, GetFullName = function() return "PlayerState " .. name end})
end
local a, b = player("Void"), player("GOLLUM")
local game = object({PlayerArray = array({a, b}), GetFullName = function() return worldName end, GetAddress = function() return worldAddress end})
local pc = object({PlayerState = a, IsLocalController = function() return true end})
local gs = object({GetGameState = function(_, ctx) return ctx.foreign and player("wrong-world") or game end})
local archon = object({IsInCity = function() return city end, GetOnlineSessionId = function() return session end})
local function widget(_, _, cls)
    local w = object({removed = false, kind = cls.kind})
    w.SetVisibility = function(self, v) self.visibility = v end
    w.SetRenderOpacity = function(self, v) self.RenderOpacity = v end
    w.SetPositionInViewport = function(self, p) self.x, self.y = p.X, p.Y end
    w.SetDesiredSizeInViewport = function(self, p) self.width, self.height = p.X, p.Y end
    w.SetAnchorsInViewport, w.SetAlignmentInViewport, w.AddToViewport, w.InvalidateLayoutAndVolatility = noop, noop, noop, noop
    w.RemoveFromViewport = function(self) self.removed = true end
    local slot = object({SetAnchors = noop, SetAlignment = noop, SetAutoSize = noop, SetPosition = noop, SetSize = noop})
    w.ProgressBarComponent = object({GetParent = function() return object({SetVisibility = noop}) end})
    w.BoostIconBarImage = object({Slot = slot, SetBrushResourceObject = noop, SetColorAndOpacity = noop, SetBrushSize = noop})
    w.ChatLogLabelTextBlock = object({Font = {OutlineSettings = {}}, SetJustification = noop, SetColorAndOpacity = noop,
        SetText = function(_, text) w.text = text end})
    widgets[#widgets + 1] = w
    return w
end
local lib = object({Create = widget})
StaticFindObject = function(path)
    if path == "/Script/Engine.Default__GameplayStatics" then return gs end
    if path == "/Script/Archon.Default__ArchonGameplayStatics" then return archon end
    if path:find("WidgetBlueprintLibrary", 1, true) then return lib end
    if path:find("HealthValueText", 1, true) then return object({Font = {FontObject = {}, TypefaceFontName = "Regular"}}) end
    return object({kind = path:find("chat_log_label", 1, true) and "label" or "panel"})
end
local tracker = object({RenderOpacity = 0.996, removed = false})
tracker.RemoveFromViewport = function(self) self.removed = true end
FindAllOf = function(cls) return cls == "ArchonPlayerController" and {pc} or {tracker} end
LoadAsset = noop
FText = function(text) return text end
RegisterHook = function(path, callback) callbacks[path], hookCount = callback, hookCount + 1 end
package.loaded.FrameTick = {Every = function(_, name, callback) ticks[name] = callback end, Now = function() return now end, Start = noop}
package.loaded.ModSettings = {Load = noop, Get = function(k, default) if settings[k] == nil then return default end return settings[k] end}
package.loaded.DamageLedger = Ledger
dofile(dir .. "main.lua")
assert(not tracker.removed, "Damage meter cleanup must preserve the Behemoth Tracker")
local owner = object({IsA = function() return true end})
local component = object({GetOwner = function() return owner end})
local callback = callbacks["/Script/Archon.ArchonCombatTextComponent:MulticastSendMultitypeCombatText"]
assert(callback)
local function send(ps, amount)
    callback(wrap(component), wrap(array({{SourceActor = object({PlayerState = ps}), CoreDamage = amount, PartDamage = 20, StaggerDamage = 0, ExposeDamage = 10}})))
end
local function pulse() ticks["damage-panel"](now) end
local function displayed(text)
    for _, w in ipairs(widgets) do if not w.removed and w.text == text then return true end end
    return false
end
ticks["damage-roster"]()
send(a, 1000); send(b, 400); send(a, 100); send(a, 100)
send(player("Not in this hunt"), 999999)
-- An environmental source must not prevent the next valid entry in the same packet.
callback(wrap(component), wrap(array({
    {SourceActor = setmetatable(object(), {__index = function() error("Not a pawn") end})},
    {SourceActor = object({PlayerState = a}), CoreDamage = 50},
})))
now = 11; pulse()
assert(displayed("1,250  core damage") and displayed("Team total  1,650"))
assert(displayed("Void") and displayed("GOLLUM"))
for _, w in ipairs(widgets) do if not w.removed then assert(w.x >= 28 and w.x + w.width <= 366 and w.visibility == 3) end end
ticks["damage-hook"](); assert(hookCount == 1)
settings.dm_visible = false; pulse(); assert(not displayed("HUNT DAMAGE"))
send(a, 500); settings.dm_visible = true; pulse(); assert(displayed("1,750  core damage"))
owner.foreign = true; send(a, 10000); owner.foreign = false; pulse(); assert(displayed("1,750  core damage"))
settings.dm_team = false; pulse(); assert(not displayed("TEAM · CORE DAMAGE"))
city = true; ticks["damage-roster"](); pulse(); assert(not displayed("HUNT DAMAGE"))
city, session, worldAddress, now = false, "hunt-b", 124, 0 -- Repeated map name, new world instance.
ticks["damage-roster"](); pulse(); assert(displayed("0  core damage"))
print("Damage meter: channel separation, single counting hook, world/roster isolation, reset and HUD checks passed")
