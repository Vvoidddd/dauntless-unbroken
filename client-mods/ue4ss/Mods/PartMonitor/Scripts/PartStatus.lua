local M = {}
local BODY = {[0] = "Part", "Kill", "Antlers", "Horns", "Horn", "Head", "Wing", "Body", "Limbs", "Leg", "Tail",
    "Tailgem", "Armour", "Firesacs", "Quills", "Other", "Gauntlets", "Vine Arm", "Bludgeon Arm", "Trunk", "Mushrooms"}
M.colors = {
    intact = {R = 0.2, G = 1, B = 0.3, A = 1}, low = {R = 1, G = 0.55, B = 0.06, A = 1},
    broken = {R = 1, G = 0.2, B = 0.18, A = 1}, unknown = {R = 0.6, G = 0.62, B = 0.65, A = 1},
}
local function finite(n) return type(n) == "number" and n == n and math.abs(n) < math.huge end
function M.Fraction(current, max)
    if not finite(current) or not finite(max) or max <= 0 or current < 0 then return nil end
    return math.min(1, current / max)
end
function M.BarColor(state, fraction, wounded)
    if wounded and fraction and fraction > 0 and state ~= "broken" and state ~= "unknown" then return M.colors.broken end
    return M.colors[state]
end
function M.State(part)
    local description = part.description
    -- Resist type Scarred(4) is also used by healthy Body/Unbreakable stages.
    -- The break description, not the resistance enum, identifies a real break.
    if description == 10 or description == 11 or (description == nil and (part.initial == 10 or part.initial == 11)) then
        return "unknown", "N/A"
    end
    -- Kharabak also disables its temporary aether wings through boss state
    -- changes, and stage changes heal them. Full raw HP is not proof of activity.
    if part.aetherWing and (description == 7 or part.kind == 5) then
        if part.aetherCharged == false then return "unknown", "INACTIVE" end
        if part.aetherCharged ~= true then return "unknown", "?" end
        return "broken", "BROKEN"
    end
    if part.severed == true or description == 3 or description == 4 or description == 5 then return "broken", "BROKEN" end
    if description == 7 then
        -- Forward damage-break stages: Normal, Armored, Severable, Exposed.
        -- Disabled->Normal_Backward quills and generic DisablePart are ambiguous.
        local previous = part.previous
        if previous == 0 or previous == 1 or previous == 2 or previous == 9 then return "broken", "BROKEN" end
        return "unknown", "DISABLED"
    end
    if description == nil then
        if part.kind == 3 then return "broken", "BROKEN" end
        if part.kind == 4 then return "unknown", "?" end
        if part.kind == 5 then return "unknown", "DISABLED" end
    end
    if description == 12 or part.kind == 7 or part.breakable == false then return "unknown", "N/A" end
    if part.breakable ~= true then return "unknown", "?" end
    if not part.actor or not finite(part.current) or not finite(part.max) or part.max <= 0 or part.current < 0 then
        return "unknown", "?"
    end
    if part.current / part.max <= 0.5 then return "low", "LOW" end
    return "intact", "OK"
end
function M.Name(name, body)
    if type(name) ~= "string" or name == "" or name == "None" then return BODY[body] or "Part" end
    -- Preserve actual names/sides from the cooked part data, not enum guesses.
    return name:gsub("[_%-]+", " "):gsub("(%l)(%u)", "%1 %2"):gsub("(%u)(%u%l)", "%1 %2"):gsub("[%z\1-\31\127]", "")
end
return M
