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
function M.State(part)
    -- A stage index is not a break flag: armour can break into healthy flesh,
    -- and regenerative stage transitions can go backwards.
    if part.severed == true or part.kind == 3 or part.kind == 4 or part.brokenArmour then return "broken", "BROKEN" end
    if part.kind == 5 then return "unknown", "DISABLED" end
    if part.kind == 7 or part.breakable == false then return "unknown", "N/A" end
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
