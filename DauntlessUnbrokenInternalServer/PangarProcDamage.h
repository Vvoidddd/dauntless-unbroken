#pragma once
#include <chrono>
#include <cstdio>
#include "DataTables.h"
#include "NativeDiagnostics.h"
#include "PangarProcDamagePolicy.h"

// Pangar's frostbrand explosions keep their rank/early-break amounts, but use
// the flat TRUE channel instead of re-entering weapon part/wound scaling.
namespace PangarProcDamage {
inline bool Patch(SDK::UDataTable* table) {
    if (!table->RowStruct || table->RowStruct->GetName() != "DamageTableData"
        || table->RowStruct->Size != sizeof(SDK::FDamageTableData)) return false;
    std::array<SDK::FDamageTableData*, Rules.size()> rows{};
    auto& map = table->RowMap;
    for (int i = 0; i < map.NumAllocated(); ++i) {
        if (!map.IsValidIndex(i) || !map[i].Value()) continue;
        const auto name = map[i].Key().ToString();
        for (size_t r = 0; r < Rules.size(); ++r) {
            if (name != Rules[r].Name) continue;
            if (rows[r]) return false;
            rows[r] = reinterpret_cast<SDK::FDamageTableData*>(map[i].Value());
        }
    }
    // Validate the whole pinned set before changing any row. A different game
    // version or another tuning patch must not silently receive a partial edit.
    for (size_t i = 0; i < rows.size(); ++i) {
        const auto* row = rows[i];
        if (!row || !MatchesPinnedRow(Rules[i].Damage, row->BaseDamage, row->FrostDamage, row->DamageTrue)
            || row->ExplicitPartBreak || row->ExplicitStagger || row->ExplicitExpose
            || row->PhysicalDamage || row->FlameDamage || row->ShockDamage || row->RadiantDamage
            || row->UmbralDamage || row->TerraDamage || row->RawElementalDamage) return false;
    }
    int changed = 0;
    for (size_t i = 0; i < rows.size(); ++i) {
        if (rows[i]->DamageTrue == Rules[i].Damage) continue;
        FlattenPinnedRow(Rules[i].Damage, rows[i]->BaseDamage, rows[i]->FrostDamage, rows[i]->DamageTrue);
        ++changed;
    }
    if (changed) {
        char line[96]{};
        const int size = sprintf_s(line, "pangar_proc_flat_damage rows=6 changed=%d\n", changed);
        if (size > 0) DR_WriteDiagnostic(line, static_cast<DWORD>(size));
    }
    return true;
}

inline void Tick() {
    static SDK::UDataTable* table = nullptr;
    static int index = -1;
    static std::chrono::steady_clock::time_point next{};
    const auto now = std::chrono::steady_clock::now();
    if (now < next) return;
    next = now + std::chrono::seconds(table ? 30 : 1);
    if (!table || SDK::UObject::GObjects->GetByIndex(index) != table) {
        table = FindDataTable("DamageTable");
        index = table ? table->Index : -1;
    }
    if (table && !Patch(table)) table = nullptr;
}
}
