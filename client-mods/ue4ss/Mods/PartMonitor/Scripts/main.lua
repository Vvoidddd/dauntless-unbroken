-- Read-only part status from replicated MonsterPartActors, not floating damage totals.
local FrameTick = require("FrameTick")
local Settings = require("ModSettings")
local HUD = require("HudPanel")
local Status = require("PartStatus")
local TAG = 0.994 -- Unique: damage .995, tracker .996, menu .997, lock-on .993.
local panel, layoutKey, selected, rows = nil, nil, nil, {}
local targetDistance = 0
local errors = {}
local function logOnce(key, message)
    if not errors[key] then errors[key] = true print("[PartMonitor] " .. tostring(message)) end
end
local function objectKey(o)
    if not HUD.Valid(o) then return nil end
    local ok, name = pcall(function() return o:GetFullName() .. ":" .. tostring(o:GetAddress()) end)
    return ok and name or nil
end
local function str(value)
    if type(value) == "string" then return value end
    local ok, text = pcall(function() return value:ToString() end)
    return ok and text or ""
end
local function property(part, name)
    local ok, value = pcall(function() return part[name] end)
    if ok then return value end
end
local function brokenArmour(part)
    if property(part, "PartType") ~= 5 then return false end
    local stage = property(part, "CurrentBreakStage")
    if type(stage) ~= "number" or stage < 1 or stage % 1 ~= 0 then return false end
    local descriptions = {}
    local ok = pcall(function()
        part.PartBreakData:ForEach(function(_, value)
            local item = value:get()
            local description = item.PartBreakDescription_81_F02FC7404C14B0C4C604A5B52827B0C9
            descriptions[#descriptions + 1] = type(description) == "number" and description or -1
        end)
    end)
    -- Cooked standard armour: Armored(1) -> Disabled(7). An arbitrary disabled
    -- part is not evidence of a break; require this known stage lineage.
    return ok and descriptions[stage] == 1 and descriptions[stage + 1] == 7
end
local function readPart(part)
    local actor = property(part, "MonsterPartActor")
    local ok, hp, max = pcall(function() return part:GetCurrentHealth(), part:GetMaxHealth() end)
    local canRead, breakable = pcall(function() return part:CanBeBroken() end)
    if not canRead then breakable = nil end
    local name = str(property(part, "PartName"))
    if name == "" or name == "None" then
        local instance = str(part:GetFName()):gsub("_GEN_VARIABLE$", "")
        if not instance:lower():find("monsterpart", 1, true) then name = instance end
    end
    local color, word = Status.State({actor = HUD.Valid(actor), current = ok and hp or nil, max = ok and max or nil,
        kind = property(part, "PartType"), severed = property(part, "PartSevered"), breakable = breakable,
        brokenArmour = brokenArmour(part)})
    local body = property(part, "BodyPartType")
    if (body == 0 or body == 1 or body == 7) and breakable == false and color ~= "broken" then return nil end
    local fraction = color ~= "unknown" and HUD.Valid(actor) and Status.Fraction(hp, max) or nil
    if color == "broken" then fraction = 0 end
    return {id = objectKey(actor) or objectKey(part), name = Status.Name(name, body), color = color, word = word, fraction = fraction}
end
local function removeUI()
    HUD.Remove(panel)
    panel, layoutKey = nil, nil
end
local function scan()
    rows = {}
    if not Settings.Get("pm_visible", true) then selected = nil return end
    local gs = StaticFindObject("/Script/Engine.Default__GameplayStatics")
    local archon = StaticFindObject("/Script/Archon.Default__ArchonGameplayStatics")
    if not HUD.Valid(gs) or not HUD.Valid(archon) then selected = nil return end
    local pc
    for _, candidate in ipairs(FindAllOf("ArchonPlayerController") or {}) do
        local ok, isLocal = pcall(function() return candidate:IsLocalController() end)
        if ok and isLocal and HUD.Valid(candidate) then pc = candidate break end
    end
    if not pc or not HUD.Valid(pc.Pawn) or archon:IsInCity(pc) then selected = nil return end
    local world = objectKey(gs:GetGameState(pc))
    if not world then selected = nil return end
    local nearest, best, previous = nil, math.huge, nil
    for _, behemoth in ipairs(FindAllOf("ArchonBehemoth") or {}) do
        if HUD.Valid(behemoth) then
            local ok, hp, distance = pcall(function() return behemoth:GetCurrentHealth(), behemoth:GetDistanceTo(pc.Pawn) end)
            if ok and type(hp) == "number" and hp > 0 and type(distance) == "number" and distance >= 0 and distance < math.huge
                and objectKey(gs:GetGameState(behemoth)) == world then
                if selected and objectKey(behemoth) == selected.id then previous = {actor = behemoth, distance = distance} end
                if distance < best then nearest, best = behemoth, distance end
            end
        end
    end
    -- Small distance changes between two nearby Behemoths must not flicker the list.
    if previous and previous.distance < 5000 and previous.distance <= best * 1.1 then nearest, best = previous.actor, previous.distance end
    -- The distant tracker uses this screen region outside combat range.
    if not nearest or best >= 5000 then selected = nil return end
    selected = {actor = nearest, id = objectKey(nearest), pc = pc, world = world}
    targetDistance = best / 100
    local seen = {}
    for _, part in ipairs(FindAllOf("monsterpart_bpc_C") or {}) do
        if HUD.Valid(part) then
            local ok, owner = pcall(function() return part:GetOwner() end)
            if ok and objectKey(owner) == selected.id then
                local read, row = pcall(readPart, part)
                if read and row and row.id and not seen[row.id] then seen[row.id] = true rows[#rows + 1] = row end
                if not read then logOnce("part", row) end
            end
        end
    end
    table.sort(rows, function(a, b) return a.name < b.name or (a.name == b.name and a.id < b.id) end)
    local names = {}
    for _, row in ipairs(rows) do names[row.name] = (names[row.name] or 0) + 1 end
    local index = {}
    for _, row in ipairs(rows) do
        local name = row.name
        index[name] = (index[name] or 0) + 1
        if names[name] > 1 then row.name = name .. " " .. index[name] end
    end
end
local white = {R = 0.96, G = 0.95, B = 1, A = 1}
local muted = {R = 0.66, G = 0.68, B = 0.76, A = 1}
local function render()
    if not selected or #rows == 0 or not Settings.Get("pm_visible", true) then removeUI() return end
    -- ponytail: at most 16 rows; show an explicit overflow count, add paging if a new boss needs it.
    local count = math.min(16, #rows)
    -- Keep the reference's narrow, single-column silhouette. Dense anatomies
    -- tighten vertically instead of expanding across the hunt view.
    local rowHeight = math.min(50, math.floor(416 / count))
    local width, height = 192, 8 + count * rowHeight + (#rows > count and 20 or 0)
    local key = selected.id .. ":" .. selected.world .. ":" .. tostring(count)
    if layoutKey ~= key or not panel or not HUD.Valid(panel.root) then
        removeUI()
        panel = HUD.New(selected.pc, TAG, {X = 1, Y = 0.49}, -24 - width, 0, width, height)
        for i = 1, count do
            local y = 4 + (i - 1) * rowHeight
            local size = rowHeight >= 40 and 22 or 17
            HUD.Indicator(panel, "dot" .. i, 8, y + 3, 22)
            HUD.Label(panel, "name" .. i, "", size, white, 36, y, 148)
            HUD.Bar(panel, "hp" .. i, 16, y + rowHeight - 13, 164, rowHeight >= 40 and 8 or 4)
        end
        if #rows > count then HUD.Label(panel, "overflow", "+" .. (#rows - count) .. " parts", 14, muted, 16, 6 + count * rowHeight, 164) end
        layoutKey = key
    end
    for i = 1, count do
        local row = rows[i]
        HUD.Tint(panel, "dot" .. i, Status.colors[row.color])
        HUD.Set(panel, "name" .. i, row.name)
        HUD.Fill(panel, "hp" .. i, row.fraction, Status.colors[row.color])
    end
end
HUD.Cleanup(TAG)
FrameTick.Every(1, "parts-settings", Settings.Load)
FrameTick.Every(0.25, "parts-scan", function()
    local ok, err = pcall(scan)
    if not ok then rows, selected = {}, nil logOnce("scan", err) end
    render()
end)
FrameTick.Start(print, "PartMonitor")
