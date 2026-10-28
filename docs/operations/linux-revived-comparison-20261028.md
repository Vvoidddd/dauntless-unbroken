# Linux startup comparison

Compared Revived revision `46c5bc4215496ec33e824c01905c48a0aa7680b7`
with Unbroken's launcher and client startup on 2026-10-28.

Both already use native Electron, Steam/Flatpak Proton discovery, an isolated
compatibility prefix, XWayland authorization recovery, and `dxgi=n,b` when the
native Linux launcher prepares Proton/Wine. Both client DLLs already skip console
initialization under Wine and hook EAC client initialization at RVA `0xEF2440`.
Copying those implementations again does not explain a different outcome.

The screenshots report `Failed to create IGameClient instance` followed by Epic
automatic-login failure. The existing EAC hook explicitly targets the former
error. This is consistent with missing or unsuccessful early proxy/hook loading,
but screenshots alone do not establish the cause.

The direct Windows launcher path did not set `WINEDLLOVERRIDES`. Under Wine that
can select builtin DXGI instead of the supplied proxy. `GameProcess.start` now
applies the same native DXGI override for both direct and prepared launches;
native Windows ignores the variable. `gameDllOverrides` preserves other DLL
rules, including grouped rules such as `dxgi,d3d11=b`, while replacing conflicting
DXGI rules. Prefix initialization reuses the same helper.

The runnable `wine-launch.test.ts` verifies the actual spawn environment for both
paths, environment isolation, grouped/wildcard overrides and repeated application.
Linux runtime checks also run under Ubuntu WSL with native Node. These checks do
not execute the game or prove that the reported user's installation is repaired.

The relay's Windows process-owner check is unchanged. Windows Electron under
Wine still reports `win32`; an owner-table failure remains a separate possible
network failure. Do not bypass that check to make the error disappear.

Latest support inbox read at investigation time contained no new report from
the screenshot user. GadisManjahh's older native 1.0.39 report showed successful
network forwarding and a separate wallet-backend mismatch addressed in 1.0.41.
The user's new report and a real game retest are still needed to confirm this
startup diagnosis.
