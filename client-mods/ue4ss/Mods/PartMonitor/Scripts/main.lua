-- Read-only part status from replicated MonsterPartActors, not floating damage totals.
local FrameTick = require("FrameTick")
local Settings = require("ModSettings")
local HUD = require("HudPanel")
local Status = require("PartStatus")
local TAG = 0.994 -- Unique: damage .995, tracker .996, menu .997, lock-on .993.
local panel, layoutKey, groups, uiPc, uiWorld = nil, nil, {}, nil, nil
local errors = {}
local scissorsClass
local ownerKinds, classificationWorld = {}, nil
local SCISSORS = "/Game/Monsters/moonface/scissors/scissors_archetype_bp.scissors_archetype_bp_C"
local function logOnce(key, message)
    if not errors[key] then errors[key] = true print("[PartMonitor] " .. tostring(message)) end
end
local function objectKey(o)
    return FrameTick.ObjectKey(o)
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
local function stages(part)
    local stage = property(part, "CurrentBreakStage")
    local descriptions = {}
    local ok = pcall(function()
        part.PartBreakData:ForEach(function(_, value)
            local item = value:get()
            local description = item.PartBreakDescription_81_F02FC7404C14B0C4C604A5B52827B0C9
            descriptions[#descriptions + 1] = type(description) == "number" and description or -1
        end)
    end)
    if not ok then return nil, nil, nil end
    local function known(index)
        local value = descriptions[index]
        return value and value >= 0 and value <= 12 and value or nil
    end
    if type(stage) ~= "number" or stage < 0 or stage % 1 ~= 0 then return known(1), nil, nil end
    return known(1), known(stage + 1), known(stage)
end
local function wingPhase(part, owner)
    local ownerKey = objectKey(owner)
    local matches = ownerKinds[ownerKey]
    if matches == nil then
        -- An actor's class cannot change. Cache misses too: Gnasher encounters
        -- need no Kharabak lookup per part. A later boss has its own cache key.
        if not HUD.Valid(scissorsClass) then scissorsClass = StaticFindObject(SCISSORS) end
        local ok, result = pcall(function() return HUD.Valid(scissorsClass) and owner:IsA(scissorsClass) end)
        matches = ok and result == true
        ownerKinds[ownerKey] = matches
    end
    if not matches then return false, nil end
    local key = objectKey(part)
    if not key then return false, nil end
    if key ~= objectKey(property(owner, "FrontLeftWing")) and key ~= objectKey(property(owner, "FrontRightWing")) then return false, nil end
    local charged = property(owner, "AetherCharged")
    if type(charged) ~= "boolean" then
        local read, value = pcall(function() return owner:IsAetherCharged() end)
        if read and type(value) == "boolean" then charged = value else charged = nil end
    end
    return true, charged
end
local function readPart(part, owner)
    local actor = property(part, "MonsterPartActor")
    local ok, hp, max = pcall(function() return part:GetCurrentHealth(), part:GetMaxHealth() end)
    local canRead, breakable = pcall(function() return part:CanBeBroken() end)
    if not canRead then breakable = nil end
    local name = str(property(part, "PartName"))
    if name == "" or name == "None" then
        local instance = str(part:GetFName()):gsub("_GEN_VARIABLE$", "")
        if not instance:lower():find("monsterpart", 1, true) then name = instance end
    end
    local initial, description, previous = stages(part)
    local body = property(part, "BodyPartType")
    -- Kill/core Body is not breakable anatomy. Some core presets intentionally
    -- use Normal/Scarred with a 999x health scale, so resistance alone is unsafe.
    if body == 1 or body == 7 or description == 10 or initial == 10
        or (body == 0 and name:lower() == "body") then return nil end
    local aetherWing, aetherCharged = wingPhase(part, owner)
    local color, word = Status.State({actor = HUD.Valid(actor), current = ok and hp or nil, max = ok and max or nil,
        kind = property(part, "PartType"), severed = property(part, "PartSevered"), breakable = breakable,
        initial = initial, description = description, previous = previous, aetherWing = aetherWing, aetherCharged = aetherCharged})
    if aetherWing then
        logOnce("wing:" .. tostring(objectKey(part)) .. ":" .. tostring(description) .. ":" .. tostring(aetherCharged),
            name .. " aether=" .. tostring(aetherCharged) .. " stage=" .. tostring(description) .. " hp=" .. tostring(hp) .. "/" .. tostring(max) .. " state=" .. word)
    end
    local fraction = color ~= "unknown" and HUD.Valid(actor) and Status.Fraction(hp, max) or nil
    if color == "broken" then fraction = 0 end
    return {id = objectKey(actor) or objectKey(part), name = Status.Name(name, body), color = color, word = word,
        fraction = fraction, wounded = property(part, "ExposedPartType") == 6}
end
local function removeUI()
    HUD.Remove(panel)
    panel, layoutKey = nil, nil
end
local function displayName(behemoth)
    local marker = property(behemoth, "BehemothMessageMarker")
    if not HUD.Valid(marker) then
        local cls = StaticFindObject("/Script/Archon.BehemothMessageMarkerComponent")
        if HUD.Valid(cls) then
            local ok, component = pcall(function() return behemoth:GetComponentByClass(cls) end)
            if ok then marker = component end
        end
    end
    if HUD.Valid(marker) then
        local ok, text = pcall(function() return str(marker:GetBehemothName()) end)
        if ok then return (text:gsub("[%z\1-\31\127]", "")) end
    end
    return ""
end
local function scan()
    local previous = groups
    groups, uiPc, uiWorld = {}, nil, nil
    if not Settings.Get("pm_visible", true) then return end
    local gs = StaticFindObject("/Script/Engine.Default__GameplayStatics")
    local archon = StaticFindObject("/Script/Archon.Default__ArchonGameplayStatics")
    if not HUD.Valid(gs) or not HUD.Valid(archon) then return end
    local pc = FrameTick.PlayerController()
    if not pc or not HUD.Valid(pc.Pawn) or archon:IsInCity(pc) then return end
    local world = objectKey(gs:GetGameState(pc))
    if not world then return end
    if classificationWorld ~= world then ownerKinds, classificationWorld = {}, world end
    uiPc, uiWorld = pc, world
    local tracked = {}
    for _, old in ipairs(previous) do if old.world == world then tracked[old.id] = true end end
    local candidates, byId = {}, {}
    for _, behemoth in ipairs(FrameTick.Objects("ArchonBehemoth")) do
        if HUD.Valid(behemoth) and property(behemoth, "bHidden") ~= true then
            local ok, hp, distance = pcall(function() return behemoth:GetCurrentHealth(), behemoth:GetDistanceTo(pc.Pawn) end)
            local key = objectKey(behemoth)
            if ok and key and type(hp) == "number" and hp > 0 and type(distance) == "number" and distance >= 0
                and distance < (tracked[key] and 7000 or 5000) and objectKey(gs:GetGameState(behemoth)) == world then
                local group = {actor=behemoth,id=key,world=world,distance=distance,name=displayName(behemoth),rows={},seen={}}
                candidates[#candidates+1], byId[key] = group, group
            end
        end
    end
    table.sort(candidates,function(a,b) return a.distance<b.distance or (a.distance==b.distance and a.id<b.id) end)
    local chosen = {}
    -- Preserve encounter order while bosses move; a small exit-range margin prevents edge flicker.
    for _, old in ipairs(previous) do
        if old.world == world and byId[old.id] and #groups < 2 then
            groups[#groups+1]=byId[old.id];chosen[old.id]=true
        end
    end
    -- ponytail: two nearby encounter groups; extend the selector if a mode gains three active bosses.
    for _, group in ipairs(candidates) do
        if #groups < 2 and not chosen[group.id] then groups[#groups+1]=group;chosen[group.id]=true end
    end
    local partClass = StaticFindObject("/Script/Archon.MonsterPartComponent")
    for _, group in ipairs(groups) do
        -- Ask only the selected boss for its components, never scan every part
        -- in the world's UObject array (including pooled/old-round objects).
        -- Reflected return arrays are Lua tables of RemoteUnrealParam entries
        -- in UE4SS 3.0.1; accept raw objects too, as the damage adapter does.
        for _, value in pairs(group.actor:K2_GetComponentsByClass(partClass)) do
            local unwrapped, part = pcall(function() return value:get() end)
            if not unwrapped then part = value end
            if HUD.Valid(part) and objectKey(part:GetOwner()) == group.id then
                local read, row = pcall(readPart, part, group.actor)
                if read and row and row.id and not group.seen[row.id] then
                    group.seen[row.id]=true;group.rows[#group.rows+1]=row
                end
                if not read then logOnce("part", row) end
            end
        end
    end
    local titles = {}
    for i, group in ipairs(groups) do
        if group.name == "" then group.name = "Behemoth " .. i end
        titles[group.name]=(titles[group.name] or 0)+1
        table.sort(group.rows,function(a,b) return a.name<b.name or (a.name==b.name and a.id<b.id) end)
        local names, index = {}, {}
        for _, row in ipairs(group.rows) do names[row.name]=(names[row.name] or 0)+1 end
        for _, row in ipairs(group.rows) do
            local name=row.name
            index[name]=(index[name] or 0)+1
            if names[name]>1 then row.name=name.." "..index[name] end
        end
    end
    for i, group in ipairs(groups) do group.title=group.name .. (titles[group.name]>1 and " "..i or "") end
end
local white = {R = 0.96, G = 0.95, B = 1, A = 1}
local muted = {R = 0.66, G = 0.68, B = 0.76, A = 1}
local function render()
    if #groups == 0 or not uiPc or not Settings.Get("pm_visible", true) then removeUI() return end
    local views, totalRows, keyParts = {}, 0, {uiWorld}
    for _, group in ipairs(groups) do
        local first, count, title = 1, #group.rows, group.title
        views[#views+1]={group=group,first=first,count=count,title=title}
        totalRows=totalRows+math.max(1,count)
        keyParts[#keyParts+1]=group.id..":"..title..":"..count
        for i=first,first+count-1 do keyParts[#keyParts+1]=group.rows[i].id..":"..group.rows[i].name end
    end
    local width = 240
    local overhead = 8 + #views*30 + (#views-1)*14
    local logicalHeight = 1080
    pcall(function()
        local lib = StaticFindObject("/Script/UMG.Default__WidgetLayoutLibrary")
        local viewport, scale = lib:GetViewportSize(uiPc), lib:GetViewportScale(uiPc)
        if type(viewport.Y)=="number" and viewport.Y>0 and type(scale)=="number" and scale>0 then logicalHeight=viewport.Y/scale end
    end)
    local rowHeight = math.min(50, math.max(28, math.floor((496-overhead)/totalRows)))
    local height = overhead + totalRows*rowHeight
    local yOffset = math.min(0, math.max(12,logicalHeight-height-16)-logicalHeight*0.49)
    -- A full tall list moves beside the native danger/Behemoth HUD instead of covering it.
    local xOffset = -24-width-(yOffset<0 and 220 or 0)
    keyParts[#keyParts+1]=tostring(logicalHeight)..":"..xOffset..":"..yOffset
    local key = table.concat(keyParts,"|")
    local size = rowHeight>=40 and 18 or (rowHeight>=30 and 15 or 12)
    local dotSize = rowHeight>=40 and 22 or (rowHeight>=30 and 16 or 14)
    local barY = rowHeight>=40 and rowHeight-13 or rowHeight-7
    local barHeight = rowHeight>=40 and 8 or 3
    if layoutKey~=key or not panel or not HUD.Valid(panel.root) then
        removeUI()
        panel=HUD.New(uiPc,TAG,{X=1,Y=0.49},xOffset,yOffset,width,height)
        local cursor=4
        for g,view in ipairs(views) do
            if g>1 then HUD.Rule(panel,12,cursor+6,width-24);cursor=cursor+14 end
            HUD.Label(panel,"heading"..g,view.title,math.max(11,math.floor(18*math.min(1,20/#view.title))),white,12,cursor,width-24,true)
            cursor=cursor+30
            if view.count==0 then
                HUD.Label(panel,"waiting"..g,"Part data unavailable",14,muted,12,cursor,width-24)
            end
            for i=1,view.count do
                local y=cursor+(i-1)*rowHeight
                local prefix=g..":"..i
                HUD.Indicator(panel,prefix.."dot",8,y+3,dotSize)
                HUD.Label(panel,prefix.."name","",size,white,36,y,width-44)
                HUD.Bar(panel,prefix.."hp",16,y+barY,width-28,barHeight)
            end
            cursor=cursor+math.max(1,view.count)*rowHeight
        end
        layoutKey=key
        print("[PartMonitor] Panel ready: " .. #views .. " Behemoth group(s), " .. totalRows .. " row(s)")
    end
    for g,view in ipairs(views) do
        for i=1,view.count do
            local row=view.group.rows[view.first+i-1]
            local prefix=g..":"..i
            local label=row.name..(row.word=="INACTIVE" and " (inactive)" or "")
            HUD.Tint(panel,prefix.."dot",Status.colors[row.color])
            HUD.Set(panel,prefix.."name",label,nil,math.max(11,math.floor(size*math.min(1,18/#label))))
            HUD.Fill(panel,prefix.."hp",row.fraction,Status.BarColor(row.color,row.fraction,row.wounded))
        end
    end
end

HUD.Cleanup(TAG)
FrameTick.Every(1, "parts-settings", Settings.Load)
FrameTick.Every(0.5, "parts-scan", function()
    local ok, err = pcall(scan)
    if not ok then groups, uiPc, uiWorld = {}, nil, nil logOnce("scan", err) end
    render()
end)
FrameTick.Start(print, "PartMonitor")
