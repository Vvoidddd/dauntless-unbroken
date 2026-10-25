-- Read the combat-text RPC once, before its local-player/distance display filter.
-- No attack, damage, camera, replication or server state is changed.
local FrameTick = require("FrameTick")
local Settings = require("ModSettings")
local Ledger = require("DamageLedger")
local state = Ledger.New()
local HOOK = "/Script/Archon.ArchonCombatTextComponent:MulticastSendMultitypeCombatText"
local TEXT = "/Game/UI/Chat/w_chat_log_label_bpw.w_chat_log_label_bpw_C"
local PANEL = "/Game/UI/EndOfHunt/StackableProgressBar.StackableProgressBar_C"
local OPACITY = 0.995 -- Distinct from Tracker (0.996), ModMenu (0.997) and LockOn (0.993).
local widgets, labels, roster = {}, {}, {}
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

local function removeUI()
    for _, w in ipairs(widgets) do if valid(w) then pcall(function() w:RemoveFromViewport() end) end end
    widgets, labels, uiWorld, showTeam = {}, {}, nil, nil
end
local function place(w, x, y, width, height)
    w:SetPositionInViewport({X = x, Y = y}, false)
    w:SetDesiredSizeInViewport({X = width, Y = height})
    w:SetAnchorsInViewport({Minimum = {X = 0, Y = 0}, Maximum = {X = 0, Y = 0}})
    w:SetAlignmentInViewport({X = 0, Y = 0})
end
local function track(w)
    if not valid(w) then error("Could not create HUD widget") end
    widgets[#widgets + 1] = w
    w:SetRenderOpacity(OPACITY)
    w:SetVisibility(3) -- HitTestInvisible; never intercept mouse/gamepad input.
end
local function load(path)
    local cls = StaticFindObject(path)
    if not valid(cls) then LoadAsset(path:match("^(.*)%.")) cls = StaticFindObject(path) end
    if not valid(cls) then error("HUD asset not loaded: " .. path) end
    return cls
end
local white = {R = 0.96, G = 0.95, B = 1, A = 1}
local muted = {R = 0.66, G = 0.68, B = 0.76, A = 1}
local purple = {R = 0.78, G = 0.58, B = 1, A = 1}
local function makeUI(team)
    removeUI()
    local pc = context.pc
    local lib = StaticFindObject("/Script/UMG.Default__WidgetBlueprintLibrary")
    if not valid(lib) then return end
    local textClass, panelClass = load(TEXT), load(PANEL)
    local x, y, width = 28, 300, 338
    local panel = lib:Create(pc, panelClass, pc)
    track(panel)
    panel.ProgressBarComponent:GetParent():SetVisibility(1)
    local image = panel.BoostIconBarImage
    image:SetBrushResourceObject(StaticFindObject("/Engine/EngineResources/WhiteSquareTexture.WhiteSquareTexture"))
    image:SetColorAndOpacity({R = 0.035, G = 0.025, B = 0.065, A = 0.88})
    panel:AddToViewport(75)
    panel:SetVisibility(3)
    place(panel, x, y, width, team and 410 or 230)
    image:SetBrushSize({X = width, Y = team and 410 or 230})
    local slot = image.Slot
    slot:SetAnchors({Minimum = {X = 0, Y = 0}, Maximum = {X = 0, Y = 0}})
    slot:SetAlignment({X = 0, Y = 0})
    slot:SetAutoSize(false)
    slot:SetPosition({X = 0, Y = 0})
    slot:SetSize({X = width, Y = team and 410 or 230})
    local font = StaticFindObject("/Game/UI/HUD/HealthStamina_bpw.HealthStamina_bpw_C:WidgetTree.HealthValueText")
    local function label(id, text, size, color, top, left, cellWidth)
        local widget = lib:Create(pc, textClass, pc)
        track(widget)
        local block = widget.ChatLogLabelTextBlock
        if valid(font) then
            block.Font.FontObject = font.Font.FontObject
            block.Font.TypefaceFontName = font.Font.TypefaceFontName
        end
        block.Font.Size = size
        block.Font.OutlineSettings.OutlineSize = 1
        block.Font.OutlineSettings.OutlineColor = {R = 0, G = 0, B = 0, A = 1}
        widget:AddToViewport(76)
        widget:SetVisibility(3)
        block:SetText(FText(text))
        block:SetJustification(0)
        block:SetColorAndOpacity({SpecifiedColor = color, ColorUseRule = 0})
        place(widget, x + (left or 14), y + top, cellWidth or (width - 28), size * 1.6)
        labels[id] = {block = block, widget = widget, text = text}
    end
    label("title", "HUNT DAMAGE", 23, purple, 10)
    label("scope", "Observed this visit", 15, muted, 43)
    label("core", "0  core damage", 24, white, 69)
    label("dps", "0  DPS since first hit", 16, muted, 104)
    label("part", "0  part damage", 20, {R = 1, G = 0.82, B = 0.3, A = 1}, 133)
    label("stagger", "0  stagger damage", 20, {R = 0.45, G = 0.7, B = 1, A = 1}, 161)
    label("wound", "0  wound damage", 20, {R = 1, G = 0.38, B = 0.35, A = 1}, 189)
    if team then
        label("team", "TEAM · CORE DAMAGE", 17, purple, 235)
        for i = 1, 4 do
            label("player" .. i, "—", 17, white, 263 + (i - 1) * 27, 14, 154)
            label("damage" .. i, "", 16, white, 263 + (i - 1) * 27, 176, 148)
        end
        label("total", "Team total  0", 19, purple, 375)
    end
    uiWorld, showTeam = context.uiKey, team
end
local function set(id, text, own)
    local l = labels[id]
    if l and valid(l.block) and text ~= l.text then
        l.block:SetText(FText(text))
        if own ~= nil then l.block:SetColorAndOpacity({SpecifiedColor = own and purple or white, ColorUseRule = 0}) end
        l.widget:InvalidateLayoutAndVolatility()
        l.text = text
    end
end
local function count(n)
    local s = tostring(math.floor(n + 0.5))
    return s:reverse():gsub("(%d%d%d)", "%1,"):reverse():gsub("^,", "")
end
local function pulse(now)
    if not context or not hooked or not Settings.Get("dm_visible", true) then removeUI() return end
    Ledger.Advance(state, context.session, now)
    local team = Settings.Get("dm_team", true)
    if uiWorld ~= context.uiKey or showTeam ~= team or not valid(widgets[1]) then makeUI(team) end
    local snapshot, own = Ledger.Snapshot(state), nil
    for _, row in ipairs(snapshot.rows) do if row.id == context.me then own = row break end end
    own = own or {core = 0, part = 0, stagger = 0, wound = 0, dps = 0}
    set("core", count(own.core) .. "  core damage")
    set("dps", count(own.dps) .. "  DPS since first hit")
    for _, channel in ipairs({"part", "stagger", "wound"}) do set(channel, count(own[channel]) .. "  " .. channel .. " damage") end
    if team then
        for i = 1, 4 do
            local row = snapshot.rows[i]
            set("player" .. i, row and row.name or "—", row and row.id == context.me)
            set("damage" .. i, row and count(row.core) .. "  " .. string.format("%.0f%%", row.share * 100) or "", row and row.id == context.me)
        end
        set("team", #snapshot.rows > 4 and "TEAM · TOP 4 CORE DAMAGE" or "TEAM · CORE DAMAGE", true)
        set("total", "Team total  " .. count(snapshot.core))
    end
end

-- Reload cleanup is limited to this mod's tagged widgets.
for _, cls in ipairs({"w_chat_log_label_bpw_C", "StackableProgressBar_C"}) do
    for _, w in ipairs(FindAllOf(cls) or {}) do
        pcall(function() if math.abs(w.RenderOpacity - OPACITY) < 0.0001 then w:RemoveFromViewport() end end)
    end
end
FrameTick.Every(1, "damage-settings", Settings.Load)
FrameTick.Every(1, "damage-hook", tryHook)
FrameTick.Every(0.5, "damage-roster", refresh)
FrameTick.Every(0.25, "damage-panel", pulse)
tryHook()
FrameTick.Start(print, "DamageMeter")
