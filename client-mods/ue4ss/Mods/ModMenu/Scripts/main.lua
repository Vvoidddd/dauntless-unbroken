print("[MM] ModMenu loading...")
local FrameTick = require("FrameTick")
local ModSettings = require("ModSettings")

-- The library selects a mod; its preferences appear in the detail panel.
-- Mod switches update mods.txt for the next launch. Preferences save and apply live.
--
-- Home opens/closes. Up/Down selects, Left/Right changes panel, End changes a value.
--
-- How it draws (chosen because some HUD text widgets only repaint when their size changes):
--   * the menu is built fresh every time it opens and removed when it closes;
--   * text never changes after a label is created;
--   * the selection is a highlight bar that is MOVED to the selected row (moving always repaints);
--   * a switch that changes is removed and drawn again.
--
-- Widgets (verified in UE4SS_ObjectDump.txt):
--   surfaces  : StackableProgressBar_C's BoostIconBarImage, using the engine's white texture;
--               the progress bar is hidden, avoiding its minimum-height strip artifacts
--   text      : /Game/UI/Chat/w_chat_log_label_bpw.w_chat_log_label_bpw_C (ChatLogLabelTextBlock),
--               Roboto, with the player's HP font as a fallback
-- Every widget is tagged with RenderOpacity 0.997 so a reload removes only the menu's widgets.
-- Gotcha: SetPositionInViewport resets viewport anchors - set anchors AFTER it.

-- ---------------------------------------------------------------- settings

-- Mods that ship with UE4SS, and this menu: not shown (their mods.txt lines are left alone).
local HIDDEN = {
    ModMenu = true, Keybinds = true,
    CheatManagerEnablerMod = true, ConsoleCommandsMod = true, ConsoleEnablerMod = true,
    SplitScreenMod = true, LineTraceMod = true, BPML_GenericFunctions = true, BPModLoaderMod = true,
    jsbLuaProfilerMod = true,
}
-- Friendlier names for known mods (anything else shows its folder name).
local DISPLAY = {BehemothHealthBars = "Behemoth Health Bars", BehemothTracker = "Behemoth Tracker",
                  CraftStar = "Uncrafted Weapons", LockOn = "Lock-on", DamageMeter = "Hunt Damage", PartMonitor = "Behemoth Parts"}

-- The SETTINGS section. Keys and defaults must match the mods that read them.
local SETTINGS = {
    {key = "bhb_shield", label = "Health bars: shield bar", default = true},
    {key = "bhb_text",   label = "Health bars: HP numbers", default = true},
    {key = "bhb_dual",   label = "Health bars: two bars in escalations", default = true},
    {key = "trk_always", label = "Tracker: show at any distance", default = false},
    {key = "dm_visible", label = "Damage meter: show panel", default = true},
    {key = "dm_team", label = "Damage meter: team breakdown", default = false},
    {key = "pm_visible", label = "Part monitor: show panel", default = true},
    -- choice setting: End cycles through the choices; stored as their number (1, 2, 3)
    {key = "cst_color", label = "Uncrafted weapons: name colour", default = 2, choices = {
        {name = "Red", color = {R = 1.00, G = 0.25, B = 0.25, A = 1}},
        {name = "Gold", color = {R = 1.00, G = 0.78, B = 0.20, A = 1}},
        {name = "Purple", color = {R = 0.72, G = 0.42, B = 1.00, A = 1}},
    }},
    {key = "lock_rebind", label = "Lock-on: change key", default = 0, action = "Press End", showsFile = "LockOn/key_label.txt"},
}

local MENU_X, MENU_Y = 48, 100
for _, mod in ipairs({{key="dm",name="Damage meter",direction="right"},{key="pm",name="Part monitor",direction="left"}}) do
    local offsets, backgrounds = {}, {}
    for i=1,5 do
        offsets[i]={name=tostring((i-1)*100).." px"}
        backgrounds[i]={name=i==1 and "Transparent" or tostring((i-1)*25).."%"}
    end
    SETTINGS[#SETTINGS+1]={key=mod.key.."_x",label=mod.name..": move "..mod.direction,default=1,choices=offsets}
    SETTINGS[#SETTINGS+1]={key=mod.key.."_y",label=mod.name..": move up",default=1,choices=offsets}
    SETTINGS[#SETTINGS+1]={key=mod.key.."_background",label=mod.name..": background opacity",default=3,choices=backgrounds}
end
local PANEL_W = 820
local PAD_X = 24
local TITLE_SIZE = 28
local TEXT_SIZE = 17
local HINT_SIZE = 13
local ROW_H = 44
local SLIDE_SECS = 0.24

local FILL_COLOR = {R = 0.009, G = 0.006, B = 0.018, A = 1}
local CARD_COLOR = {R = 0.018, G = 0.012, B = 0.030, A = 1}
local HILITE_COLOR = {R = 0.22, G = 0.12, B = 0.35, A = 1}
local WHITE = {R = 0.98, G = 0.96, B = 1, A = 1}
local GREY = {R = 0.66, G = 0.61, B = 0.74, A = 1}
local ACCENT = {R = 0.72, G = 0.56, B = 1, A = 1}
local PENDING_COLOR = {R = 1, G = 0.80, B = 0.44, A = 1}
local TAG_OPACITY = 0.997


local TEXT_PATH = "/Game/UI/Chat/w_chat_log_label_bpw.w_chat_log_label_bpw_C"
local TEXT_ASSET = "/Game/UI/Chat/w_chat_log_label_bpw"
local PANEL_PATH = "/Game/UI/EndOfHunt/StackableProgressBar.StackableProgressBar_C"
local PANEL_ASSET = "/Game/UI/EndOfHunt/StackableProgressBar"
local FONT_SRC = "/Game/UI/HUD/HealthStamina_bpw.HealthStamina_bpw_C:WidgetTree.HealthValueText"

-- ESlateVisibility: 3 HitTestInvisible, 1 Collapsed
local VIS_SHOWN, VIS_HIDDEN = 3, 1

-- ---------------------------------------------------------------- state

local ui = nil          -- persistent shell and tracked detail-page widgets while the menu is open
local isOpen = false
local cursor = 1
local activeMod = nil
local entries = {}      -- shown mods: {name, on, loadedOn, lineIndex}
local items = {}        -- every selectable row: {kind = "mod", entry} or {kind = "setting", setting}
local lines = {}        -- raw lines of mods.txt
local eol = "\n"
local modsDir = nil
local rects = {}        -- widget -> resting {x, y}, so the slide-in can offset all of them
local slideX = 0
local slide = nil       -- running slide-in: {start, dist}
local GS = nil

local function log(m) print("[MM] " .. tostring(m)) end

local function valid(o)
    return FrameTick.Valid(o)
end

-- ---------------------------------------------------------------- mods.txt

local function FindModsDir()
    local src = debug.getinfo(1, "S").source or ""
    src = src:gsub("^@", ""):gsub("/", "\\")
    -- ...\Mods\ModMenu\Scripts\main.lua  ->  ...\Mods\
    local dir = src:match("^(.*\\)[^\\]+\\[Ss]cripts\\[^\\]+$")
    if dir then return dir end
    return "ue4ss\\Mods\\"
end

local function ReadModsTxt()
    local f = io.open(modsDir .. "mods.txt", "rb")
    if not f then log("cannot open " .. modsDir .. "mods.txt") return false end
    local data = f:read("*a")
    f:close()
    eol = data:find("\r\n", 1, true) and "\r\n" or "\n"
    lines = {}
    for line in (data .. "\n"):gmatch("([^\n]*)\n") do
        lines[#lines + 1] = (line:gsub("\r$", ""))
    end
    if lines[#lines] == "" and data:sub(-1) == "\n" then lines[#lines] = nil end
    return true
end

-- True when the mod's folder has a script. mods.txt can name mods that are gone (it is kept when
-- an update removes a mod), and those are not shown.
local function ModExists(name)
    local f = io.open(modsDir .. name .. "\\Scripts\\main.lua", "rb")
    if f then f:close() return true end
    return false
end

-- keepLoaded: remember which state each mod was LOADED with (to mark unapplied changes)
local function ParseEntries(keepLoaded)
    local old = {}
    for _, e in ipairs(entries) do old[e.name] = e.loadedOn end
    entries = {}
    for i, line in ipairs(lines) do
        if not line:match("^%s*;") then
            local name, val = line:match("^%s*(.-)%s*:%s*([01])%s*$")
            if name and name ~= "" and not HIDDEN[name] and ModExists(name) then
                local on = (val == "1")
                local loadedOn = on
                if keepLoaded and old[name] ~= nil then loadedOn = old[name] end
                entries[#entries + 1] = {name = name, on = on, loadedOn = loadedOn, lineIndex = i}
            end
        end
    end
end

local function WriteModsTxt()
    local f = io.open(modsDir .. "mods.txt", "wb")
    if not f then log("cannot write " .. modsDir .. "mods.txt") return false end
    f:write(table.concat(lines, eol) .. eol)
    f:close()
    return true
end

local SETTING_OWNER = {bhb_shield = "BehemothHealthBars", bhb_text = "BehemothHealthBars",
    bhb_dual = "BehemothHealthBars", trk_always = "BehemothTracker", cst_color = "CraftStar", lock_rebind = "LockOn",
    dm_visible = "DamageMeter", dm_team = "DamageMeter", pm_visible = "PartMonitor",
    dm_x="DamageMeter",dm_y="DamageMeter",dm_background="DamageMeter",
    pm_x="PartMonitor",pm_y="PartMonitor",pm_background="PartMonitor"}

local function BuildItems()
    items = {}
    local found = false
    for _, e in ipairs(entries) do if e.name == activeMod then found = true break end end
    if not found then activeMod = entries[1] and entries[1].name or nil end
    for _, e in ipairs(entries) do items[#items + 1] = {kind = "mod", entry = e} end
    for _, s in ipairs(SETTINGS) do
        if SETTING_OWNER[s.key] == activeMod then items[#items + 1] = {kind = "setting", setting = s} end
    end
end

-- ---------------------------------------------------------------- widget helpers

local function GetPC()
    return FrameTick.PlayerController()
end

local function FindOrLoad(path, asset)
    local o = StaticFindObject(path)
    if valid(o) then return o end
    pcall(function() LoadAsset(asset) end)
    o = StaticFindObject(path)
    if valid(o) then return o end
    log("not found: " .. path)
    return nil
end

-- Places a top-level widget (UI units, from the top-left of the screen) and remembers its
-- resting position for the slide-in.
local function PlaceWidget(w, x, y, sx, sy)
    if not valid(w) then return end
    rects[w] = {x = x, y = y}
    pcall(function()
        w:SetPositionInViewport({X = x + slideX, Y = y}, false)
        w:SetDesiredSizeInViewport({X = sx, Y = sy})
        w:SetAnchorsInViewport({Minimum = {X = 0, Y = 0}, Maximum = {X = 0, Y = 0}})
        w:SetAlignmentInViewport({X = 0, Y = 0})
    end)
end

local function Track(w)
    ui.widgets[#ui.widgets + 1] = w
    if ui.buildPage then
        local page = ui.pages[ui.buildPage]
        page[#page + 1] = w
    end
    pcall(function() w:SetRenderOpacity(TAG_OPACITY) end)
    pcall(function() w:SetVisibility(VIS_SHOWN) end)
end

local function Untrack(w)
    if valid(w) then pcall(function() w:RemoveFromViewport() end) end
    rects[w] = nil
    for i, x in ipairs(ui.widgets) do
        if x == w then table.remove(ui.widgets, i) break end
    end
    for _, page in pairs(ui.pages) do
        for i, x in ipairs(page) do if x == w then table.remove(page, i) break end end
    end
end

-- A solid rectangle: StackableProgressBar at 100% with a flat fill colour.
local function MakeSolid(color, z)
    local c = ui.ctx
    local w = c.Lib:Create(c.PC, c.panelCls, c.PC)
    if not valid(w) then return nil end
    local ok, image = pcall(function() return w.BoostIconBarImage end)
    if not (ok and valid(image)) then return nil end
    local o = {w = w, image = image}
    w:AddToViewport(z)
    pcall(function() w.ProgressBarComponent:GetParent():SetVisibility(VIS_HIDDEN) end)
    pcall(function() image:SetBrushResourceObject(c.whiteTexture) end)
    pcall(function() image:SetColorAndOpacity(color) end)
    pcall(function() image:SetVisibility(VIS_SHOWN) end)
    pcall(function() o.slot = image.Slot end)
    Track(w)
    return o
end

local function LayoutSolid(o, x, y, w, h)
    if not (o and valid(o.w)) then return end
    PlaceWidget(o.w, x, y, w, h)
    pcall(function() o.image:SetBrushSize({X = w, Y = h}) end)
    if valid(o.slot) then
        local s = o.slot
        pcall(function() s:SetAnchors({Minimum = {X = 0, Y = 0}, Maximum = {X = 0, Y = 0}}) end)
        pcall(function() s:SetAlignment({X = 0, Y = 0}) end)
        pcall(function() s:SetAutoSize(false) end)
        pcall(function() s:SetPosition({X = 0, Y = 0}) end)
        pcall(function() s:SetSize({X = w, Y = h}) end)
    end
end

-- Labels are immutable after construction; navigation shows prebuilt pages instead of rebuilding them.


local function MakeLabel(text, size, color, x, y, w, z)
    local c = ui.ctx
    local l = c.Lib:Create(c.PC, c.textCls, c.PC)
    if not valid(l) then log("text Create failed") return nil end
    local okT, tb = pcall(function() return l.ChatLogLabelTextBlock end)
    if not (okT and valid(tb)) then log("ChatLogLabelTextBlock not readable") return nil end
    if valid(c.fontSrc) then
        local src = c.fontSrc
        pcall(function() tb.Font.FontObject = src.Font.FontObject end)
        pcall(function() tb.Font.TypefaceFontName = src.Font.TypefaceFontName end)
    end
    if valid(c.fontObject) then
        pcall(function() tb.Font.FontObject = c.fontObject end)
        pcall(function() tb.Font.TypefaceFontName = FName("Regular") end)
    end
    pcall(function() tb.Font.Size = size end)
    pcall(function()
        tb.Font.OutlineSettings.OutlineSize = 0
        tb.Font.OutlineSettings.OutlineColor = {R = 0, G = 0, B = 0, A = 1}
    end)
    l:AddToViewport(z)
    -- set AFTER AddToViewport: the widget's construct writes its default "Chat Log" text
    pcall(function() tb:SetText(FText(text)) end)
    pcall(function() tb:SetJustification(0) end)
    pcall(function() tb:SetColorAndOpacity({SpecifiedColor = color, ColorUseRule = 0}) end)
    PlaceWidget(l, x, y, w, math.floor(size * 1.6 + 0.5))
    Track(l)
    return l
end

-- A label whose RIGHT edge sits at `right` (the widget ignores text justification, so the
-- text is measured and the widget moved left by its width).
local function MakeLabelRight(text, size, color, right, y, z)
    local l = MakeLabel(text, size, color, right - 200, y, 200, z)
    if not valid(l) then return nil end
    local w = nil
    pcall(function()
        local tb = l.ChatLogLabelTextBlock
        tb:ForceLayoutPrepass()
        local d = tb:GetDesiredSize()
        if d.X and d.X > 0 then w = math.ceil(d.X) end
    end)
    w = w or math.floor(#text * size * 0.55 + 0.5)      -- estimate if it can't be measured
    PlaceWidget(l, right - w, y, w + 2, math.floor(size * 1.6 + 0.5))
    return l
end

-- Sets a named label to `text`; if it differs, the old widget is replaced by a new one.
local function SetLabel(key, text, size, color, x, y, w, z)
    local cur = ui.labels[key]
    if cur and valid(cur.w) and cur.text == text then return end
    if cur then Untrack(cur.w) end
    ui.labels[key] = {w = MakeLabel(text, size, color, x, y, w, z), text = text}
end

-- ---------------------------------------------------------------- menu

local function DestroyUI()
    slide = nil
    if not ui then return end
    for _, w in ipairs(ui.widgets) do
        if valid(w) then pcall(function() w:RemoveFromViewport() end) end
    end
    ui = nil
    rects = {}
end

local function AnyPending()
    for _, e in ipairs(entries) do
        if e.on ~= e.loadedOn then return true end
    end
    return false
end

local function ItemState(it)
    if it.kind == "mod" then return it.entry.on, it.entry.on ~= it.entry.loadedOn end
    return ModSettings.Get(it.setting.key, it.setting.default), false
end

-- The switch at the right end of row i: a track (green on / grey off / amber = mod change not
local function ItemKey(it)
    return it.kind == "mod" and ("mod:" .. it.entry.name) or it.setting.key
end

local function ShownValue(s)
    if not (s.showsFile and modsDir) then return nil end
    local f = io.open(modsDir .. s.showsFile, "r")
    if not f then return nil end
    local v = f:read("*l")
    f:close()
    return v and v:match("^%s*(.-)%s*$")
end

local function DrawSwitch(it)
    local key = ItemKey(it)
    local row = ui and ui.rows[key]
    if not row then return end
    local text, color
    if it.kind == "setting" and it.setting.choices then
        local s = it.setting
        local n = ModSettings.GetNum(s.key, s.default)
        local choice = s.choices[n] or s.choices[s.default]
        text, color = choice.name, choice.color
    elseif it.kind == "setting" and it.setting.action then
        text, color = ShownValue(it.setting) or "Set key", ACCENT
    else
        local on, pending = ItemState(it)
        text, color = on and "On" or "Off", on and ACCENT or GREY
        if pending then text, color = text .. " *", PENDING_COLOR end
    end
    local look = text .. (color == PENDING_COLOR and "*" or "")
    local current = ui.switches[key]
    if current and current.look == look then return end
    if current then Untrack(current.label) end
    ui.buildPage = row.page
    local label = MakeLabelRight(text, 14, color, row.x + row.w - 12, row.y + 2, 1003)
    ui.buildPage = nil
    ui.switches[key] = {label = label, look = look}
end

local function RefreshHint()
    if not ui then return end
    local text, color = "Settings save automatically. Mod switches apply after restarting the game.", GREY
    if AnyPending() then text, color = "Restart required  /  Your mod switches are saved for the next launch.", PENDING_COLOR end
    SetLabel("hint", text, HINT_SIZE, color, MENU_X + PAD_X, ui.hintY, PANEL_W - 2 * PAD_X, 1003)
end

local function ShowPage(name)
    if not ui or ui.currentPage == name then return end
    for page, widgets in pairs(ui.pages) do
        local visibility = page == name and VIS_SHOWN or VIS_HIDDEN
        for _, widget in ipairs(widgets) do
            if valid(widget) then pcall(function() widget:SetVisibility(visibility) end) end
        end
    end
    ui.currentPage = name
end

local function MoveHilite()
    local it = items[cursor]
    local row = ui and it and ui.rows[ItemKey(it)]
    if not (row and ui.hilite) then return end
    LayoutSolid(ui.hilite, row.x, row.y - 6, row.w, row.h)
end

local function BuildUI()
    DestroyUI()
    local PC = GetPC()
    if not PC then log("no player controller yet") return false end
    local Lib = StaticFindObject("/Script/UMG.Default__WidgetBlueprintLibrary")
    if not valid(Lib) then return false end
    local panelCls = FindOrLoad(PANEL_PATH, PANEL_ASSET)
    local textCls = FindOrLoad(TEXT_PATH, TEXT_ASSET)
    local whiteTexture = FindOrLoad("/Engine/EngineResources/WhiteSquareTexture.WhiteSquareTexture",
        "/Engine/EngineResources/WhiteSquareTexture")
    if not (panelCls and textCls and whiteTexture) then return false end
    ui = {
        ctx = {PC = PC, Lib = Lib, panelCls = panelCls, textCls = textCls, whiteTexture = whiteTexture,
            fontSrc = StaticFindObject(FONT_SRC),
            fontObject = FindOrLoad("/Engine/EngineFonts/Roboto.Roboto", "/Engine/EngineFonts/Roboto")},
        widgets = {}, labels = {}, switches = {}, rows = {}, pages = {},
    }
    local x, y = MENU_X, MENU_Y
    local leftX, leftW = x + 16, 252
    local rightX, rightW = leftX + leftW + 28, PANEL_W - leftW - 68
    local bodyY = y + 164
    local bodyH = math.max(#entries * ROW_H, 196)
    ui.hintY = bodyY + bodyH + 16
    LayoutSolid(MakeSolid(FILL_COLOR, 1000), x, y, PANEL_W, ui.hintY - y + 66)
    LayoutSolid(MakeSolid(CARD_COLOR, 1000), leftX, y + 96, leftW, bodyH + 68)
    MakeLabel("DAUNTLESS UNBROKEN", 11, ACCENT, x + PAD_X, y + 20, 400, 1003)
    MakeLabel("Client mods", TITLE_SIZE, WHITE, x + PAD_X, y + 39, 450, 1003)
    MakeLabelRight("HOME  Close", 12, GREY, x + PANEL_W - PAD_X, y + 49, 1003)
    MakeLabel("YOUR MODS", 12, GREY, leftX + 18, y + 112, leftW - 36, 1003)

    local info = {
        BehemothHealthBars = {"Health bars", "Keep health, shields and Escalation targets in view."},
        BehemothTracker = {"Behemoth tracker", "Find your target without cluttering the view."},
        CraftStar = {"Uncrafted weapons", "Spot weapon recipes you have not crafted yet."},
        LockOn = {"Lock-on", "Click the mouse wheel or R3 to lock onto a Behemoth."},
    }
    local names = {bhb_shield = "Shield bar", bhb_text = "Health numbers", bhb_dual = "Two behemoth bars",
        trk_always = "Always show tracker", cst_color = "Weapon name colour", lock_rebind = "Change lock-on key"}
    local descriptions = {bhb_shield = "Show shields beside the main health bar.",
        bhb_text = "Add numeric health values to the display.", bhb_dual = "Show both targets during Escalations.",
        trk_always = "Track nearby targets as well as distant ones.", cst_color = "Highlight recipes you have not made.",
        lock_rebind = "Press End, then press your preferred button."}

    -- Build every page once. Navigation only switches visibility and moves the selection.
    for i, entry in ipairs(entries) do
        local it = {kind = "mod", entry = entry}
        local row = {x = leftX + 6, y = bodyY + (i - 1) * ROW_H, w = leftW - 12, h = ROW_H - 5}
        ui.rows[ItemKey(it)] = row
        local detail = info[entry.name] or {DISPLAY[entry.name] or entry.name, "Preferences for this mod."}
        MakeLabel(detail[1], 16, WHITE, leftX + 16, row.y, leftW - 74, 1003)
        DrawSwitch(it)
        ui.buildPage = entry.name
        ui.pages[entry.name] = {}
        MakeLabel(detail[1], 23, WHITE, rightX, y + 105, rightW, 1003)
        MakeLabel(detail[2], 12, GREY, rightX, y + 138, rightW, 1003)
        local count = 0
        for _, setting in ipairs(SETTINGS) do
            if SETTING_OWNER[setting.key] == entry.name then
                count = count + 1
                local s = {kind = "setting", setting = setting}
                local sr = {x = rightX - 8, y = bodyY + (count - 1) * 58, w = rightW + 16, h = 52, page = entry.name}
                ui.rows[ItemKey(s)] = sr
                ui.buildPage = entry.name
                local valueW = (setting.choices or setting.action) and 118 or 40
                MakeLabel(names[setting.key] or setting.label, 17, WHITE, rightX + 6, sr.y, rightW - valueW - 38, 1003)
                MakeLabel(descriptions[setting.key] or "", 11, GREY, rightX + 6, sr.y + 26, rightW - 12, 1003)
                DrawSwitch(s)
            end
        end
        ui.buildPage = entry.name
        if count == 0 then MakeLabel("This mod has no extra preferences.", 13, GREY, rightX, bodyY, rightW, 1003) end
        ui.buildPage = nil
    end
    if #entries == 0 then MakeLabel("No optional mods installed", 12, GREY, leftX + 16, bodyY, leftW - 32, 1003) end
    if #items > 0 then ui.hilite = MakeSolid(HILITE_COLOR, 1001) end
    MakeLabel("Up / Down  Select     Left / Right  Panel     End  Change", 12, GREY,
        x + PAD_X, ui.hintY + 27, PANEL_W - 2 * PAD_X, 1003)
    ShowPage(activeMod)
    RefreshHint()
    MoveHilite()
    log("menu built once (" .. #entries .. " pages, " .. #ui.widgets .. " widgets)")
    return true
end


-- ---------------------------------------------------------------- slide-in

local function SetSlide(dx)
    slideX = dx
    for w, r in pairs(rects) do
        if valid(w) then
            pcall(function() w:SetPositionInViewport({X = r.x + dx, Y = r.y}, false) end)
        end
    end
end

-- Real time from the engine (os.clock runs fast in-game, so it is not used for timing).
local function Now()
    if not valid(GS) then GS = StaticFindObject("/Script/Engine.Default__GameplayStatics") end
    local ok, t = pcall(function() return GS:GetRealTimeSeconds(GetPC()) end)
    if ok and type(t) == "number" then return t end
    return nil
end

local function SlideStep()
    if not slide then return end
    if not ui then slide = nil return end
    local now = Now()
    if not now then pcall(SetSlide, 0) slide = nil return end
    local t = math.min(1, (now - slide.start) / SLIDE_SECS)
    local eased = 1 - (1 - t) ^ 3                               -- ease-out cubic
    local ok = pcall(SetSlide, -slide.dist * (1 - eased))
    if not ok or t >= 1 then
        pcall(SetSlide, 0)
        slide = nil
    end
end

local function StartSlide()
    local start = Now()
    if not start or not FrameTick.IsRunning() then SetSlide(0) return end
    local dist = MENU_X + PANEL_W + 40
    SetSlide(-dist)
    slide = {start = start, dist = dist}
end

-- ---------------------------------------------------------------- actions

local function Open()
    if ReadModsTxt() then ParseEntries(true) end
    ModSettings.Load()
    BuildItems()
    if cursor > #items then cursor = #items end
    if cursor < 1 then cursor = 1 end
    slideX = -(MENU_X + PANEL_W + 40)          -- build off-screen, then slide in
    local ok, res = pcall(BuildUI)
    if not ok then log("ERROR building menu: " .. tostring(res)) DestroyUI() return end
    if not res then DestroyUI() return end
    isOpen = true
    local okS, eS = pcall(StartSlide)
    if not okS then log("ERROR slide: " .. tostring(eS)) SetSlide(0) end
end

local function Close()
    isOpen = false
    DestroyUI()
    slideX = 0
end

local function Move(d)
    if not (isOpen and ui) or #items == 0 then return end
    cursor = ((cursor - 1 + d) % #items) + 1
    if items[cursor].kind == "mod" and items[cursor].entry.name ~= activeMod then
        activeMod = items[cursor].entry.name
        BuildItems()
        ShowPage(activeMod)
    end
    MoveHilite()
end

local function SwitchMod()
    if not ReadModsTxt() then return end      -- re-read so outside edits aren't overwritten
    local count = #entries
    ParseEntries(true)
    if #entries ~= count then Open() return end   -- list changed outside the game: rebuild
    BuildItems()
    local it = items[cursor]
    local e = it and it.entry
    if not e then return end
    e.on = not e.on
    lines[e.lineIndex] = e.name .. " : " .. (e.on and "1" or "0")
    if WriteModsTxt() then
        log(e.name .. " -> " .. (e.on and "ON" or "OFF") .. " (restart the game to apply)")
    end
end

local function SwitchSetting(s)
    ModSettings.Load()
    if s.action then
        local n = ModSettings.GetNum(s.key, 0) + 1
        if ModSettings.SetNum(s.key, n) then
            log("action " .. s.key .. " (" .. n .. ")")
        else
            log("cannot write " .. ModSettings.FILE)
        end
        return
    end
    if s.choices then
        local n = ModSettings.GetNum(s.key, s.default) % #s.choices + 1
        if ModSettings.SetNum(s.key, n) then
            log("setting " .. s.key .. " -> " .. s.choices[n].name)
        else
            log("cannot write " .. ModSettings.FILE)
        end
        return
    end
    local on = not ModSettings.Get(s.key, s.default)
    if ModSettings.Set(s.key, on) then
        log("setting " .. s.key .. " -> " .. (on and "ON" or "OFF"))
    else
        log("cannot write " .. ModSettings.FILE)
    end
end

local function Switch()
    if not (isOpen and ui) then return end
    local it = items[cursor]
    if not it then return end
    if it.kind == "mod" then SwitchMod() else SwitchSetting(it.setting) end
    -- an action hands the keyboard to its mod (e.g. "press a key"): close the menu
    if it.kind == "setting" and it.setting.action then Close() return end
    if not ui then return end                 -- rebuilt or closed meanwhile
    DrawSwitch(items[cursor])
    RefreshHint()
end

-- ---------------------------------------------------------------- startup

-- Hot reload leaves the old menu on screen; remove every widget tagged as the menu's
-- (including the text widgets older versions of this menu used).
local function RemoveOldMenus()
    local n = 0
    for _, cls in ipairs({"w_chat_log_label_bpw_C", "w_hud_playerID_C", "StackableProgressBar_C"}) do
        local list = FindAllOf(cls)
        if list then
            for _, w in ipairs(list) do
                local okV, inVp = pcall(function() return w:IsInViewport() end)
                local okO, op = pcall(function() return w.RenderOpacity end)
                if okV and inVp and okO and op and math.abs(op - TAG_OPACITY) < 0.0005 then
                    if pcall(function() w:RemoveFromViewport() end) then n = n + 1 end
                end
            end
        end
    end
    if n > 0 then log("removed " .. n .. " old menu widget(s) from a previous load") end
end

-- BehemothHealthBars removes its own widgets when it loads. If it was just switched off it
-- won't load, so its leftovers are removed here (untagged widgets; other mods tag theirs 0.99x).
local function CleanupDisabled()
    if not ReadModsTxt() then return end
    for _, line in ipairs(lines) do
        local name, val = line:match("^%s*(.-)%s*:%s*([01])%s*$")
        if name == "BehemothHealthBars" and val == "0" then
            for _, cls in ipairs({"StackableProgressBar_C", "w_chat_log_label_bpw_C"}) do
                local list = FindAllOf(cls)
                if list then
                    for _, w in ipairs(list) do
                        local okV, inVp = pcall(function() return w:IsInViewport() end)
                        local okO, op = pcall(function() return w.RenderOpacity end)
                        local tagged = okO and type(op) == "number" and op > 0.99 and op < 0.9995
                        if okV and inVp and not tagged then pcall(function() w:RemoveFromViewport() end) end
                    end
                end
            end
            log("BehemothHealthBars is off - removed its leftover widgets")
        end
    end
end

modsDir = FindModsDir()
log("mods folder: " .. modsDir)
if ReadModsTxt() then ParseEntries(false) end
BuildItems()
log(#entries .. " mods shown (built-in UE4SS mods hidden), " .. #SETTINGS .. " settings")

pcall(function()
    ExecuteInGameThread(function()
        pcall(RemoveOldMenus)
        pcall(CleanupDisabled)
    end)
end)

-- Key callbacks arrive on UE4SS's input thread. They only add the action to a plain Lua list;
-- the per-frame FrameTick (game thread) runs it. Actions stay in this mod's own Lua queue.
-- Lua-state hot reload is disabled. Ctrl+R only refreshes this menu/settings through the same
-- game-thread path as Home. Before the HUD is ready, actions wait instead of touching UI off-thread.
local pending = {}

local function RunPending()
    while #pending > 0 do
        local a = table.remove(pending, 1)
        local okF, eF = pcall(a.fn)
        if not okF then log("ERROR " .. a.key .. ": " .. tostring(eF)) end
    end
end

local function Bind(keyName, fn, modifiers)
    local k = Key[keyName]
    if k == nil then log("key name not valid in this UE4SS: " .. keyName) return end
    local ok, err = pcall(function()
        local callback = function()
            if #pending < 8 then pending[#pending + 1] = {key = keyName, fn = fn} end
        end
        if modifiers then RegisterKeyBind(k, modifiers, callback)
        else RegisterKeyBind(k, callback) end
    end)
    if not ok then log("ERROR binding " .. keyName .. ": " .. tostring(err)) end
end

local function Up() Move(-1) end
local function Down() Move(1) end

Bind("HOME", function() if isOpen then Close() else Open() end end)
Bind("UP_ARROW", Up)
Bind("DOWN_ARROW", Down)
Bind("PAGE_UP", Up)
Bind("PAGE_DOWN", Down)
Bind("RIGHT_ARROW", function()
    if isOpen and ui and #items > #entries then cursor = #entries + 1 MoveHilite() end
end)
Bind("LEFT_ARROW", function()
    if not (isOpen and ui) then return end
    for i, e in ipairs(entries) do if e.name == activeMod then cursor = i MoveHilite() return end end
end)
Bind("END", Switch)
Bind("R", Open, {ModifierKey.CONTROL})

FrameTick.Every(0, "menu", function()
    RunPending()
    SlideStep()
end)
FrameTick.Start(log, "ModMenu")

log("ModMenu loaded. Home = open/close")
