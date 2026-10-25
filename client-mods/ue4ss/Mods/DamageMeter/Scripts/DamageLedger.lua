-- Client observations, not an authoritative server scoreboard. Channels overlap:
-- contribution and DPS use core damage alone, never core + part + stagger + wound.
local M = {}
local function number(v)
    return type(v) == "number" and v == v and v > 0 and v < math.huge and v or 0
end

function M.New()
    return {session = nil, players = {}, elapsed = 0, last = nil, started = false}
end

function M.Advance(state, session, now)
    if not session or session == "" or type(now) ~= "number" or now ~= now or math.abs(now) == math.huge then return false end
    if state.session ~= session then
        state.session, state.players, state.elapsed, state.started, state.last = session, {}, 0, false, nil
    end
    if state.started and state.last then state.elapsed = state.elapsed + math.max(0, now - state.last) end
    state.last = now -- A new world clock may start at zero between map loads.
    return true
end

function M.Record(state, session, now, id, name, hit)
    if not M.Advance(state, session, now) or not id or id == "" then return false end
    local core, part, stagger, wound = number(hit.core), number(hit.part), number(hit.stagger), number(hit.wound)
    if core + part + stagger + wound == 0 then return false end
    local row = state.players[id]
    if not row then
        local count = 0
        for _ in pairs(state.players) do count = count + 1 end
        if count >= 64 then return false end -- Bound reconnect churn within one visit.
        row = {id = id, name = name, core = 0, part = 0, stagger = 0, wound = 0}
        state.players[id] = row
    end
    row.name = name
    row.core, row.part, row.stagger, row.wound = row.core + core, row.part + part, row.stagger + stagger, row.wound + wound
    state.started = true
    return true
end

function M.Snapshot(state)
    local rows, total = {}, 0
    for _, row in pairs(state.players) do total = total + row.core end
    for _, row in pairs(state.players) do
        rows[#rows + 1] = {id = row.id, name = row.name, core = row.core, part = row.part,
            stagger = row.stagger, wound = row.wound, share = total > 0 and row.core / total or 0,
            dps = row.core / math.max(1, state.elapsed)}
    end
    table.sort(rows, function(a, b) return a.core > b.core or (a.core == b.core and a.id < b.id) end)
    return {rows = rows, core = total, dps = total / math.max(1, state.elapsed)}
end

return M
