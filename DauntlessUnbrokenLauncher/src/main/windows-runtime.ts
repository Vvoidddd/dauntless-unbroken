import { existsSync } from 'node:fs';
import path from 'node:path';
export const DIRECTX_FILES = ['XINPUT1_3.dll','X3DAudio1_7.dll','XAPOFX1_5.dll'];
export function missingDirectX(env: NodeJS.ProcessEnv = process.env, exists: (p:string) => boolean = existsSync, platform: NodeJS.Platform = process.platform): string[] {
  if (platform !== 'win32') return [];
  return DIRECTX_FILES.filter(file => !exists(path.join(env.WINDIR ?? env.SystemRoot ?? 'C:\\Windows','System32',file)));
}
export function gameExitDetail(code: number, platform: NodeJS.Platform = process.platform, runtimeName?: string): string {
  const hex = `0x${(code >>> 0).toString(16).toUpperCase().padStart(8,'0')}`;
  const runtimeSuffix = platform === "linux" && runtimeName ? ` Runtime used: ${runtimeName}.` : "";
  if ((code >>> 0) === 0x3) {
    return platform === "linux"
      ? `${hex}: Proton or Wine could not find the game's launch path.${runtimeSuffix} Check the game folder and selected runtime, then use Repair game files.`
      : `${hex}: The game runtime could not find the game's launch path. Check the game folder in Settings, then use Repair game files.`;
  }
  if ((code >>> 0) === 0xC0000135) {
    return platform === "linux"
      ? `${hex}: Proton or Wine could not load a required game DLL.${runtimeSuffix} Check the selected runtime, then use Repair game files.`
      : `${hex}: A required DLL is missing. Install the Microsoft Visual C++ x64 and DirectX runtimes shown below, then retry.`;
  }
  if ((code >>> 0) === 0xC000007B) {
    return platform === "linux"
      ? `${hex}: Proton or Wine could not load a game dependency.${runtimeSuffix} Check the selected runtime, then use Repair game files.`
      : `${hex}: Windows could not load a game dependency. Repair the Microsoft x64 runtimes and use Repair game files.`;
  }
  return platform === "linux"
    ? `${hex}: The game closed unexpectedly under Proton or Wine.${runtimeSuffix} Check the selected runtime and use Repair game files; if it repeats, export the latest launcher diagnostics to support.`
    : `${hex}: The game closed unexpectedly. Use Repair game files; if it repeats, export the latest launcher diagnostics to support.`;
}
