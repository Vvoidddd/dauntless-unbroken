-- Shared native HUD surfaces used by the damage and part monitors. Every caller
-- owns its widgets and a distinct opacity tag; no input or game state is changed.
local M = {}
local TEXT = "/Game/UI/Chat/w_chat_log_label_bpw.w_chat_log_label_bpw_C"
local PANEL = "/Game/UI/EndOfHunt/StackableProgressBar.StackableProgressBar_C"
local FONT = "/Game/UI/Globals/Fonts/RobotoCondensed.RobotoCondensed"
local folder = (package.searchpath("HudPanel", package.path) or "ue4ss/Mods/shared/HudPanel/HudPanel.lua"):match("^(.*[/\\])")
local textures = {}
function M.Valid(o)
    local ok, result = pcall(function() return o:IsValid() end)
    return ok and result
end
local function load(path)
    local cls = StaticFindObject(path)
    if not M.Valid(cls) then LoadAsset(path:match("^(.*)%.")) cls = StaticFindObject(path) end
    if not M.Valid(cls) then error("HUD asset not loaded: " .. path) end
    return cls
end
local function place(panel, widget, x, y, width, height)
    widget:SetPositionInViewport({X = panel.x + x, Y = panel.y + y}, false)
    widget:SetDesiredSizeInViewport({X = width, Y = height})
    widget:SetAnchorsInViewport({Minimum = panel.anchor, Maximum = panel.anchor})
    widget:SetAlignmentInViewport({X = 0, Y = 0})
end
local function create(panel, class)
    local widget = panel.lib:Create(panel.pc, class, panel.pc)
    if not M.Valid(widget) then error("Could not create HUD widget") end
    panel.widgets[#panel.widgets + 1] = widget
    widget:SetRenderOpacity(panel.tag)
    return widget
end
local function show(panel, widget, x, y, width, height, layer)
    widget:AddToViewport(layer)
    widget:SetVisibility(3) -- HitTestInvisible: never capture mouse/gamepad input.
    place(panel, widget, x, y, width, height)
end
local function texture(panel, name)
    if not M.Valid(textures[name]) then
        local rendering = StaticFindObject("/Script/Engine.Default__KismetRenderingLibrary")
        textures[name] = rendering:ImportFileAsTexture2D(panel.pc, folder .. name .. ".png")
    end
    if not M.Valid(textures[name]) then error("HUD texture unavailable: " .. name) end
    return textures[name]
end
function M.New(pc, tag, anchor, x, y, width, height)
    local panel = {pc = pc, tag = tag, anchor = anchor, x = x, y = y, widgets = {}, labels = {}, bars = {}}
    local ok, err = pcall(function()
        panel.lib = StaticFindObject("/Script/UMG.Default__WidgetBlueprintLibrary")
        if not M.Valid(panel.lib) then error("UMG widget library unavailable") end
        panel.textClass = load(TEXT)
        local root = create(panel, load(PANEL))
        panel.root = root
        -- This blueprint constructs/resets its boost image on AddToViewport.
        -- Style that image afterwards, as the shipped lock-on marker does.
        show(panel, root, 0, 0, width, height, 75)
        root.ProgressBarComponent:GetParent():SetVisibility(1)
        local image = root.BoostIconBarImage
        image:SetBrushFromTexture(texture(panel, "panel"), false)
        image.Brush.DrawAs = 1 -- Box: nine-slice preserves the small rounded corners.
        image.Brush.Margin = {Left = 0.125, Top = 0.125, Right = 0.125, Bottom = 0.125}
        image:SetBrushResourceObject(texture(panel, "panel"))
        image:SetColorAndOpacity({R = 1, G = 1, B = 1, A = 1})
        -- Nine-slice border thickness follows the source brush size. The canvas
        -- slot below stretches the panel; keep its 64px artwork size unchanged.
        image:SetBrushSize({X = 64, Y = 64})
        local slot = image.Slot
        slot:SetAnchors({Minimum = {X = 0, Y = 0}, Maximum = {X = 0, Y = 0}})
        slot:SetAlignment({X = 0, Y = 0})
        slot:SetAutoSize(false)
        slot:SetPosition({X = 0, Y = 0})
        slot:SetSize({X = width, Y = height})
        panel.font = load(FONT)
    end)
    if not ok then M.Remove(panel) error(err) end
    return panel
end
local function rectangle(panel, x, y, width, height, color, resource, layer)
    local widget = create(panel, load(PANEL))
    show(panel, widget, x, y, width, height, layer)
    widget.ProgressBarComponent:GetParent():SetVisibility(1)
    local image = widget.BoostIconBarImage
    image:SetBrushResourceObject(resource or StaticFindObject("/Engine/EngineResources/WhiteSquareTexture.WhiteSquareTexture"))
    image:SetColorAndOpacity(color)
    image:SetBrushSize({X = width, Y = height})
    local slot = image.Slot
    slot:SetAnchors({Minimum = {X = 0, Y = 0}, Maximum = {X = 0, Y = 0}})
    slot:SetAlignment({X = 0, Y = 0})
    slot:SetAutoSize(false)
    slot:SetPosition({X = 0, Y = 0})
    slot:SetSize({X = width, Y = height})
    return {widget = widget, image = image, slot = slot, x = x, y = y, width = width, height = height}
end
function M.Indicator(panel, id, x, y, size)
    panel.bars[id] = rectangle(panel, x, y, size, size, {R = 0.6, G = 0.62, B = 0.65, A = 1}, texture(panel, "indicator"), 78)
end
function M.Tint(panel, id, color)
    local image = panel and panel.bars[id]
    if image and M.Valid(image.widget) and image.color ~= color then
        image.image:SetColorAndOpacity(color)
        image.color = color
    end
end
function M.Bar(panel, id, x, y, width, height)
    rectangle(panel, x, y, width, height, {R = 0.16, G = 0.17, B = 0.18, A = 0.9}, nil, 76)
    panel.bars[id] = rectangle(panel, x, y, width, height, {R = 0.6, G = 0.62, B = 0.65, A = 1}, nil, 77)
end
function M.Fill(panel, id, percent, color)
    local bar = panel and panel.bars[id]
    if not bar or not M.Valid(bar.widget) then return end
    percent = type(percent) == "number" and percent == percent and math.max(0, math.min(1, percent)) or 0
    if percent ~= bar.percent then
        local width = bar.width * percent
        place(panel, bar.widget, bar.x, bar.y, width, bar.height)
        bar.image:SetBrushSize({X = width, Y = bar.height})
        bar.slot:SetSize({X = width, Y = bar.height})
        bar.widget:SetVisibility(percent > 0 and 3 or 1)
        bar.percent = percent
    end
    if color and color ~= bar.color then bar.image:SetColorAndOpacity(color) bar.color = color end
end
function M.Label(panel, id, text, size, color, x, y, width, bold, rightAligned)
    local widget = create(panel, panel.textClass)
    local block = widget.ChatLogLabelTextBlock
    block.Font.FontObject = panel.font
    block.Font.TypefaceFontName = FName(bold and "Bold" or "Regular")
    block.Font.Size = size
    block.Font.OutlineSettings.OutlineSize = 0
    block.Font.OutlineSettings.OutlineColor = {R = 0, G = 0, B = 0, A = 1}
    block:SetJustification(rightAligned and 2 or 0)
    widget:SetClipping(1) -- ClipToBounds: long anatomy names cannot spill outside the panel.
    show(panel, widget, x, y, width, size * 1.6, 78)
    -- Refresh the constructed Slate widget explicitly instead of relying on
    -- direct Font property writes to update its cached text style.
    block:SetFont(block.Font)
    block:SetShadowOffset({X = 0, Y = 1})
    block:SetShadowColorAndOpacity({R = 0, G = 0, B = 0, A = 0.85})
    panel.labels[id] = {widget = widget, block = block, size = size}
    M.Set(panel, id, text, color)
end
function M.Set(panel, id, text, color, size)
    local label = panel and panel.labels[id]
    if not label or not M.Valid(label.block) then return end
    if size and size ~= label.size then
        label.block.Font.Size = size
        label.block:SetFont(label.block.Font)
        label.size = size
    end
    if label.text ~= text then
        label.block:SetText(FText(text))
        label.widget:InvalidateLayoutAndVolatility()
        label.text = text
    end
    if color and label.color ~= color then
        label.block:SetColorAndOpacity({SpecifiedColor = color, ColorUseRule = 0})
        label.color = color
    end
end
function M.Remove(panel)
    for _, widget in ipairs(panel and panel.widgets or {}) do
        if M.Valid(widget) then pcall(function() widget:RemoveFromViewport() end) end
    end
end
function M.Cleanup(tag)
    for _, cls in ipairs({"w_chat_log_label_bpw_C", "StackableProgressBar_C"}) do
        for _, widget in ipairs(FindAllOf(cls) or {}) do
            pcall(function() if math.abs(widget.RenderOpacity - tag) < 0.0001 then widget:RemoveFromViewport() end end)
        end
    end
end
return M
