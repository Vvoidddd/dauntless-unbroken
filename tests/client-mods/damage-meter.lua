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
    w.SetClipping = function(self, v) self.clipping = v end
    w.SetRenderOpacity = function(self, v) self.RenderOpacity = v end
    w.SetPositionInViewport = function(self, p) self.x, self.y = p.X, p.Y end
    w.SetDesiredSizeInViewport = function(self, p) self.width, self.height, self.anchor = p.X, p.Y, {X = 0, Y = 0} end
    w.SetAnchorsInViewport = function(self, a) self.anchor = a.Minimum end
    w.SetAlignmentInViewport, w.InvalidateLayoutAndVolatility = noop, noop
    w.AddToViewport = function(self, z)
        self.z = z
        self.fontAtConstruct = self.ChatLogLabelTextBlock.Font.Size
        self.cachedFont = "ChatBold" -- Changing Font properties alone does not refresh native Slate.
        if self.kind == "panel" then self.texture, self.fill, self.brushSize = nil, nil, nil end
    end
    w.RemoveFromViewport = function(self) self.removed = true end
    local slot = object({SetAnchors = noop, SetAlignment = noop, SetAutoSize = noop, SetPosition = noop, SetSize = noop})
    w.ProgressBarComponent = object({GetParent = function() return object({SetVisibility = noop}) end})
    w.BoostIconBarImage = object({Slot = slot, Brush = {},
        SetBrushResourceObject = function(_, resource) w.texture = resource end,
        SetBrushFromTexture = function(_, resource) w.texture = resource end, SetBrush = noop,
        SetColorAndOpacity = function(_, c) w.fill = c end, SetBrushSize = function(_, size) w.brushSize = size end})
    w.ChatLogLabelTextBlock = object({Font = {OutlineSettings = {}},
        SetFont = function(_, font) w.cachedFont, w.fontObject, w.outline = font.TypefaceFontName, font.FontObject, font.OutlineSettings.OutlineSize end,
        SetShadowOffset = noop, SetShadowColorAndOpacity = noop,
        SetJustification = function(_, value) w.justification = value end,
        SetColorAndOpacity = function(_, c) w.color = c.SpecifiedColor end,
        SetText = function(_, text) w.text = text end})
    widgets[#widgets + 1] = w
    return w
end
local lib = object({Create = widget})
local font, scissorsClass = object(), object()
local viewport={X=1920,Y=1080}
local viewportScale=1
local layoutLibrary=object({GetViewportSize=function()return viewport end,GetViewportScale=function()return viewportScale end})
local rendering = object({ImportFileAsTexture2D = function(_, _, file) return object({file = file}) end})
StaticFindObject = function(path)
    if path == "/Script/Engine.Default__GameplayStatics" then return gs end
    if path == "/Script/Archon.Default__ArchonGameplayStatics" then return archon end
    if path:find("WidgetBlueprintLibrary", 1, true) then return lib end
    if path:find("WidgetLayoutLibrary", 1, true) then return layoutLibrary end
    if path:find("KismetRenderingLibrary", 1, true) then return rendering end
    if path:find("RobotoCondensed", 1, true) then return font end
    if path:find("/scissors_archetype_bp.", 1, true) then return scissorsClass end
    return object({kind = path:find("chat_log_label", 1, true) and "label" or "panel"})
end
local tracker = object({RenderOpacity = 0.996, removed = false})
tracker.RemoveFromViewport = function(self) self.removed = true end
FindAllOf = function(cls) return cls == "ArchonPlayerController" and {pc} or {tracker} end
LoadAsset = noop
FText = function(text) return text end
FName = function(text) return text end
RegisterHook = function(path, callback) callbacks[path], hookCount = callback, hookCount + 1 end
package.loaded.FrameTick = {Every = function(_, name, callback) ticks[name] = callback end, Now = function() return now end, Start = noop,
    PlayerController = function() return pc end, Objects = function(cls) return FindAllOf(cls) end}
package.loaded.ModSettings = {Load = noop, Get = function(k, default) if settings[k] == nil then return default end return settings[k] end}
package.loaded.DamageLedger = Ledger
package.loaded.HudPanel = dofile("client-mods/ue4ss/Mods/shared/HudPanel/HudPanel.lua")
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
assert(displayed("1,250") and displayed("core damage") and displayed("DPS"))
assert(not displayed("Team total  1,650") and not displayed("GOLLUM"), "Reference compact view has exactly five damage rows")
local compactLabels = 0
for _, w in ipairs(widgets) do
    if not w.removed and w.kind == "label" then
        compactLabels = compactLabels + 1
        assert(w.fontObject == font and w.outline == 0)
        assert(w.cachedFont == (w.justification == 2 and "Bold" or "Regular"))
        if w.text == "1,250" then assert(w.color.R == 0.96, "Number formatting cannot pass gsub's count as an own-player colour flag") end
    end
end
assert(compactLabels == 10, "Each reference row has a separate number and label")
local panelTextures = 0
for _, w in ipairs(widgets) do
    if not w.removed and w.texture and w.texture.file and w.texture.file:match("panel[.]png$") then
        panelTextures = panelTextures + 1
        assert(w.brushSize.X == 64 and w.brushSize.Y == 64, "Stretch canvas geometry, not the nine-slice artwork margins")
    end
end
assert(panelTextures == 1, "The constructed backdrop must retain its texture, not reset to the white template")
settings.dm_team = true; pulse()
assert(displayed("Void") and displayed("GOLLUM") and displayed("Team total  1,650"))
for _, w in ipairs(widgets) do
    if not w.removed then
        assert(w.x >= 22 and w.x + w.width <= 332 and w.visibility == 3 and w.anchor.Y == 0.54)
        if w.kind == "label" then assert(w.fontAtConstruct ~= nil, "Fonts must be set before constructing Slate widgets") end
    end
end
ticks["damage-hook"](); assert(hookCount == 1)
settings.dm_visible = false; pulse(); assert(not displayed("core damage"))
send(a, 500); settings.dm_visible = true; pulse(); assert(displayed("1,750"))
owner.foreign = true; send(a, 10000); owner.foreign = false; pulse(); assert(displayed("1,750"))
settings.dm_team = false; pulse(); assert(not displayed("Team total  2,150"))
city = true; ticks["damage-roster"](); pulse(); assert(not displayed("core damage"))
city, session, worldAddress, now = false, "hunt-b", 124, 0 -- Repeated map name, new world instance.
ticks["damage-roster"](); pulse(); assert(displayed("0") and displayed("core damage"))
send(a, 1234567); pulse(); assert(displayed("1.2M"), "Large totals stay readable inside the value column")

local Status = dofile("client-mods/ue4ss/Mods/PartMonitor/Scripts/PartStatus.lua")
local function status(hp, max, kind, severed, breakable, actor)
    return Status.State({current = hp, max = max, kind = kind, severed = severed, breakable = breakable, actor = actor})
end
assert(status(51, 100, 0, false, true, true) == "intact")
assert(status(50, 100, 0, false, true, true) == "low")
assert(status(0, 100, 0, false, true, true) == "low", "Zero HP alone is not a replicated break flag")
assert(status(nil, nil, 3, false, false, false) == "broken")
assert(status(100, 100, 4, false, false, true) == "unknown", "Scarred resistance alone can be healthy Body or Unbreakable")
assert(status(nil, nil, 0, true, false, false) == "broken")
assert(status(100, 100, 5, false, false, true) == "unknown")
assert(status(100, 100, 0, false, false, true) == "unknown")
assert(status(0 / 0, 100, 0, false, true, true) == "unknown")
assert(status(100, 0, 0, false, true, true) == "unknown")
assert(status(100, 100, 0, false, true, false) == "unknown")
-- Every unique sequence in the24cooked break presets, plus other break-description rows.
local resist = {[0]=0,1,2,3,4,3,0,5,0,6,4,4}
local canBreak = {[0]=true,[1]=true,[2]=true,[6]=true,[8]=true,[9]=true}
local profiles = {
    {{0,4},{"intact","broken"}}, {{1,7},{"intact","broken"}},
    {{0,7},{"intact","broken"}}, {{2,4},{"intact","broken"}},
    {{2,0,4},{"intact","intact","broken"}}, {{7,8},{"unknown","intact"}},
    {{10},{"unknown"}}, {{11},{"unknown"}},
    {{0,5},{"intact","broken"}}, {{6},{"intact"}}, {{9},{"intact"}},
}
for _, profile in ipairs(profiles) do
    for i, description in ipairs(profile[1]) do
        assert(Status.State({actor=true,current=100,max=100,initial=profile[1][1],description=description,
            previous=profile[1][i-1],kind=resist[description],breakable=canBreak[description] == true}) == profile[2][i],
            "Cooked break stage " .. description)
    end
end
assert(Status.Name("FrontLeftWing", 6) == "Front Left Wing")
assert(Status.Name("BodyBLArmour", 12) == "Body BL Armour")
assert(Status.Name("None", 6) == "Wing")
pc.Pawn = object()
local parts
local function boss(name, distance, foreign)
    local marker=object({title=name=="near" and "Kharabak" or "Shrike"})
    marker.GetBehemothName=function(self)return {ToString=function()return self.title end}end
    return object({GetFullName = function() return name end, GetAddress = function() return distance + 500 end, distance = distance, BehemothMessageMarker=marker,
        GetCurrentHealth = function(self) return self.hp or 1000 end, GetDistanceTo = function(self) return self.distance end, foreign = foreign,
        K2_GetComponentsByClass = function(self)
            local owned = {}
            for _, p in ipairs(parts or {}) do if p:GetOwner() == self then owned[#owned+1] = p end end
            return owned -- Native reflected function returns a plain table, not a property TArray.
        end,
        IsA = function(self, cls) return self.scissors == true and cls == scissorsClass end,
        IsAetherCharged = function(self) if self.aetherReadFails then error("Unreadable aether state") end return self.aetherFallback end})
end
local near, other, foreign = boss("near", 500, false), boss("other", 1000, false), boss("foreign", 1, true)
local function part(name, hp, kind, canBreak, partOwner)
    local actor = object({GetFullName = function() return "Health " .. name end, GetAddress = function() return #name * 10 end})
    local p = object({PartName = name, PartType = kind or 0, PartSevered = false, BodyPartType = 9, current = hp, max = 100,
        MonsterPartActor = actor, CurrentBreakStage = 0, PartBreakData = array({}), breakable = canBreak ~= false})
    p.GetOwner = function() return partOwner or near end
    p.GetFName = function() return name end
    p.GetCurrentHealth = function(self) return self.current end
    p.GetMaxHealth = function(self) return self.max end
    p.CanBeBroken = function(self) return self.breakable end
    p.GetFullName = function() return "Part " .. name end
    p.GetAddress = function() return #name * 100 end
    return p
end
local head, left, tail = part("Head", 100), part("FrontLeftWing", 50), part("Tail", 100, 3)
local disabled, armour = part("DisabledArmour", 100, 5, false), part("Armour", 100, 1)
local missing = part("BackRight", 0); missing.MonsterPartActor = {IsValid = function() return false end}
local fixed = part("Fixed", 100, 0, false)
local duplicate = part("DuplicateHead", 100); duplicate.MonsterPartActor = head.MonsterPartActor
parts = {head, left, tail, disabled, armour, missing, fixed, duplicate}
local currentBosses = {foreign, other, near}
local desc = "PartBreakDescription_81_F02FC7404C14B0C4C604A5B52827B0C9"
local core = part("Body",100,4,false); core.BodyPartType=7; core.PartBreakData=array({{[desc]=10}})
local coreNormal = part("CoreNormal",100,0); coreNormal.BodyPartType=7; coreNormal.PartBreakData=array({{[desc]=0},{[desc]=4}})
local unbreakable = part("UnbreakableCrest",100,4,false); unbreakable.PartBreakData=array({{[desc]=11}})
local bodyArmour = part("BodyFrontLeftArmour",100,1); bodyArmour.BodyPartType=12; bodyArmour.PartBreakData=array({{[desc]=1},{[desc]=7}})
local anyLimb = part("AnyLimb",100,4,false); anyLimb.BodyPartType=0; anyLimb.CurrentBreakStage=1; anyLimb.PartBreakData=array({{[desc]=0},{[desc]=4}})
for _, p in ipairs({core,coreNormal,unbreakable,bodyArmour,anyLimb}) do parts[#parts+1]=p end
local all = FindAllOf
FindAllOf = function(cls)
    if cls == "ArchonBehemoth" then return currentBosses end
    if cls == "monsterpart_bpc_C" then error("Part updates must not scan the global UObject array") end
    if cls == "w_chat_log_label_bpw_C" or cls == "StackableProgressBar_C" then
        local result = {tracker}
        for _, w in ipairs(widgets) do if not w.removed then result[#result + 1] = w end end
        return result
    end
    return all(cls)
end
package.loaded.PartStatus = Status
dofile("client-mods/ue4ss/Mods/PartMonitor/Scripts/main.lua")
local function partsPulse() ticks["parts-scan"]() end
local function right(text, color)
    for _, w in ipairs(widgets) do
        if not w.removed and w.RenderOpacity == 0.994 and w.text == text and (not color or w.color == color) then return w end
    end
end
local function sectionLabel(title, text)
    local heading=assert(right(title), title)
    local bottom=math.huge
    for _, w in ipairs(widgets) do
        if not w.removed and w.RenderOpacity==0.994 and w.cachedFont=="Bold" and w.y>heading.y then bottom=math.min(bottom,w.y) end
    end
    for _, w in ipairs(widgets) do
        if not w.removed and w.RenderOpacity==0.994 and w.text==text and w.y>heading.y and w.y<bottom then return w end
    end
end
local function rightState(name, word, color, title)
    local label = assert(title and sectionLabel(title,name) or right(name), name)
    for _, w in ipairs(widgets) do
        if not w.removed and w.RenderOpacity == 0.994 and w.x == label.x - 28 and w.y == label.y + 3 then
            assert(w.kind == "panel" and w.fill == color and w.texture.file:match("indicator[.]png$"), name .. " image indicator")
            return
        end
    end
    error("No state for " .. name)
end
local function rightBar(name, width, color, title)
    local label = assert(title and sectionLabel(title,name) or right(name))
    local bar, gap
    for _, w in ipairs(widgets) do
        if not w.removed and w.RenderOpacity == 0.994 and w.kind == "panel" and w.x == label.x - 20
            and w.z == 77 and w.y >= label.y and w.y - label.y <= 50 and (not gap or w.y-label.y<gap) then
            bar, gap = w, w.y-label.y
        end
    end
    assert(bar,"No HP bar for " .. name)
    assert(bar.width == width and bar.fill == color, name .. " HP bar")
    assert(bar.anchor.X == 1 and bar.anchor.Y == 0.49, name .. " fill stays on the right after resizing")
end
partsPulse()
assert(right("Head") and right("Front Left Wing"))
assert(not right("PART STATUS") and not right("BROKEN"), "No headings or state badges in the reference layout")
assert(not right("Body") and not right("Core Normal"), "Core Body is not a broken limb, including the999xNormal core preset")
rightState("Unbreakable Crest", "N/A", Status.colors.unknown)
rightState("Body Front Left Armour", "OK", Status.colors.intact)
rightState("Any Limb", "BROKEN", Status.colors.broken)
assert(not right("Duplicate Head"), "Two shapes sharing one health actor are one part")
rightState("Head", "OK", Status.colors.intact); rightBar("Head", 212, Status.colors.intact)
rightState("Front Left Wing", "LOW", Status.colors.low); rightBar("Front Left Wing", 106, Status.colors.low)
rightState("Tail", "BROKEN", Status.colors.broken); rightBar("Tail", 0, Status.colors.broken)
rightState("Back Right", "?", Status.colors.unknown); rightBar("Back Right", 0, Status.colors.unknown)
rightState("Fixed", "N/A", Status.colors.unknown)
assert(displayed("core damage") and not tracker.removed, "Part monitor must preserve the other HUD mods")
head.current = 50; partsPulse(); rightState("Head", "LOW", Status.colors.low); rightBar("Head", 106, Status.colors.low)
head.PartSevered = true; partsPulse(); rightState("Head", "BROKEN", Status.colors.broken); rightBar("Head", 0, Status.colors.broken)
head.PartSevered, head.PartType, head.current = false, 0, 100 -- Regrowth restores green; no permanent cached break flag.
partsPulse(); rightState("Head", "OK", Status.colors.intact); rightBar("Head", 212, Status.colors.intact)
armour.CurrentBreakStage, armour.PartType = 1, 0; partsPulse() -- Armour -> normal flesh is not broken flesh.
rightState("Armour", "OK", Status.colors.intact)
armour.PartType, armour.breakable = 5, false
armour.PartBreakData = array({{[desc] = 1}, {[desc] = 7}})
partsPulse(); rightState("Armour", "BROKEN", Status.colors.broken); rightBar("Armour", 0, Status.colors.broken)
armour.PartBreakData = array({{[desc] = 1}, {}, {[desc] = 7}})
partsPulse(); rightState("Armour", "DISABLED", Status.colors.unknown) -- Unknown stages must not be skipped/compressed.
armour.PartBreakData = array({{[desc] = 0}, {[desc] = 7}})
partsPulse(); rightState("Armour", "BROKEN", Status.colors.broken) -- Vents, fragile wings and antlers use Normal->Disabled too.
disabled.PartBreakData = array({{[desc] = 7}, {[desc] = 8}})
partsPulse(); rightState("Disabled Armour", "DISABLED", Status.colors.unknown)
disabled.CurrentBreakStage,disabled.PartType,disabled.breakable=1,0,true
partsPulse(); rightState("Disabled Armour", "OK", Status.colors.intact); rightBar("Disabled Armour",212,Status.colors.intact)
disabled.CurrentBreakStage,disabled.PartType,disabled.breakable=0,5,false
partsPulse(); rightState("Disabled Armour", "DISABLED", Status.colors.unknown)
-- Kharabak forces and heals its temporary wings through the same Disabled stage.
-- Real owned wing references + class + replicated aether state distinguish that from damage.
local rightWing=part("FrontRightWing",100,5,false)
rightWing.PartBreakData=array({{[desc]=0},{[desc]=7}});rightWing.CurrentBreakStage=1
parts[#parts+1]=rightWing
left.PartBreakData=array({{[desc]=0},{[desc]=7}});left.CurrentBreakStage,left.PartType,left.breakable,left.current=1,5,false,100
near.scissors,near.AetherCharged,near.FrontLeftWing,near.FrontRightWing=true,false,left,rightWing
partsPulse()
rightState("Front Left Wing (inactive)","INACTIVE",Status.colors.unknown)
rightBar("Front Left Wing (inactive)",0,Status.colors.unknown)
rightState("Front Right Wing (inactive)","INACTIVE",Status.colors.unknown)
near.AetherCharged=true
partsPulse();rightState("Front Left Wing","BROKEN",Status.colors.broken);rightBar("Front Left Wing",0,Status.colors.broken)
left.CurrentBreakStage,left.PartType,left.breakable,left.current=0,0,true,75
partsPulse();rightState("Front Left Wing","OK",Status.colors.intact);rightBar("Front Left Wing",159,Status.colors.intact)
left.current=50;partsPulse();rightState("Front Left Wing","LOW",Status.colors.low);rightBar("Front Left Wing",106,Status.colors.low)
near.AetherCharged=nil;near.aetherFallback=false
partsPulse();rightState("Front Right Wing (inactive)","INACTIVE",Status.colors.unknown)
near.aetherReadFails=true
partsPulse();rightState("Front Right Wing","?",Status.colors.unknown)
near.scissors=false;near.aetherReadFails=false;near.AetherCharged=false
partsPulse();rightState("Front Right Wing","BROKEN",Status.colors.broken) -- Other Behemoth wings keep ordinary break semantics.
-- Wounds tint only a live health fill; zero expose HP is not a wound flag.
head.current,head.PartType,head.ExposedPartType,head.CurrentExposeHealth=75,0,7,0
partsPulse();rightBar("Head",159,Status.colors.intact);rightState("Head","OK",Status.colors.intact)
head.ExposedPartType=6
partsPulse();rightBar("Head",159,Status.colors.broken);rightState("Head","OK",Status.colors.intact)
head.ExposedPartType=7
partsPulse();rightBar("Head",159,Status.colors.intact)
head.current,head.ExposedPartType=50,6
partsPulse();rightBar("Head",106,Status.colors.broken);rightState("Head","LOW",Status.colors.low)
head.PartType,head.current=3,100
partsPulse();rightBar("Head",0,Status.colors.broken);rightState("Head","BROKEN",Status.colors.broken)
head.PartType,head.current,head.ExposedPartType=0,100,7
local otherHead=part("Head",25,0,true,other);otherHead.ExposedPartType=6;parts[#parts+1]=otherHead
partsPulse()
assert(right("Kharabak") and right("Shrike"))
rightBar("Head",212,Status.colors.intact,"Kharabak")
rightBar("Head",53,Status.colors.broken,"Shrike");rightState("Head","LOW",Status.colors.low,"Shrike")
local firstHeading,secondHeading=right("Kharabak"),right("Shrike")
assert(firstHeading.y<secondHeading.y)
near.distance,other.distance=3000,100
partsPulse();assert(right("Kharabak")==firstHeading and right("Shrike")==secondHeading,"Movement must not reorder groups or rebuild unchanged widgets")
other.BehemothMessageMarker.title="Kharabak"
partsPulse();assert(right("Kharabak 1") and right("Kharabak 2"))
rightBar("Head",212,Status.colors.intact,"Kharabak 1");rightBar("Head",53,Status.colors.broken,"Kharabak 2")
other.BehemothMessageMarker.title="Shrike";partsPulse()
local oldOtherHead=sectionLabel("Shrike","Head")
other.hp=0;partsPulse();assert(not right("Shrike") and oldOtherHead.removed,"Dead boss widgets must all be removed")
other.hp,other.bHidden=1000,true;partsPulse();assert(not right("Shrike"),"Hidden pooled bosses must not leave stale encounter groups")
other.bHidden=false;partsPulse();assert(right("Shrike"))
-- Full anatomy lists, no16-row cutoff or pages, with non-overlapping row geometry.
local savedParts,savedBosses=parts,currentBosses
parts={};viewport.Y=1440
for i=1,20 do parts[#parts+1]=part("Segment"..i,100,0,true,near);parts[#parts+1]=part("Segment"..i,50,0,true,other) end
partsPulse()
local labels,dividers=0,0
for _, w in ipairs(widgets) do
    if not w.removed and w.RenderOpacity==0.994 then
        if w.kind=="label" and w.text:match("^Segment") then
            labels=labels+1
            local fill
            for _, candidate in ipairs(widgets) do
                if not candidate.removed and candidate.RenderOpacity==0.994 and candidate.z==77 and candidate.x==w.x-20
                    and candidate.y>w.y and (not fill or candidate.y<fill.y) then fill=candidate end
            end
            assert(fill and fill.y-w.y>=w.ChatLogLabelTextBlock.Font.Size*4/3+1,"Text and HP bars cannot overlap")
        end
        if w.kind=="panel" and w.height==1 and w.z==76 then dividers=dividers+1 end
    end
end
assert(labels==40 and dividers==1,"Both full lists and exactly one divider must be visible")
rightBar("Segment20",212,Status.colors.intact,"Kharabak");rightBar("Segment20",106,Status.colors.low,"Shrike")
local widgetCount=#widgets
for i=1,20 do near.distance=500+i;other.distance=1000-i;partsPulse() end
assert(#widgets==widgetCount,"Repeated movement scans must reuse the current groups, not stack widgets")
near.hp,other.hp=0,0;partsPulse()
for _, w in ipairs(widgets) do assert(w.removed or w.RenderOpacity~=0.994,"Empty round must clear every part widget") end
local nextBoss=boss("next-round",500,false);nextBoss.BehemothMessageMarker.title="Embermane"
currentBosses={foreign,near,other,nextBoss};parts={part("Head",90,0,true,nextBoss)}
partsPulse();assert(right("Embermane") and not right("Kharabak") and not right("Shrike"))
rightBar("Head",212*0.9,Status.colors.intact,"Embermane")
parts,currentBosses=savedParts,savedBosses;near.hp,other.hp=1000,1000;near.distance,other.distance=500,1000;viewport.Y=1080
partsPulse()
for _, w in ipairs(widgets) do
    if not w.removed and w.RenderOpacity == 0.994 then
        assert(w.x >= -484 and w.x + w.width <= -24 and w.anchor.X == 1 and w.anchor.Y == 0.49)
        if w.kind == "label" then assert((w.cachedFont == "Regular" or w.text == "Kharabak" or w.text == "Shrike") and w.outline == 0) end
        assert(w.visibility == 3 or (w.kind == "panel" and w.width == 0 and w.visibility == 1))
    end
end
near.distance, other.distance = 8000, 9000; partsPulse(); assert(not right("Head"), "Leave room for the distant tracker")
near.distance, other.distance = 500, 1000; partsPulse(); assert(right("Head"))
settings.pm_visible = false; partsPulse(); assert(not right("Head") and displayed("core damage"))
settings.pm_visible, city = true, true; partsPulse(); assert(not right("Head"))
print("HUD monitors: damage, replicated part states, exact half threshold, regrowth, armour stages, world isolation and both-side layout passed")
dofile("tests/client-mods/frame-tick.lua")
