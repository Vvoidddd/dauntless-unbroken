import { lstatSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { TrialsSchedule } from "../features";

export type IslandEventMode = "default" | "off" | "trials";

function ControlFile(): string | undefined {
    const file = process.env.ISLAND_EVENT_CONTROL_FILE;
    if(file === undefined || file.trim().length === 0) return undefined;
    if(!isAbsolute(file)) throw new Error("Island event control file must be an absolute path");
    return file;
}

function ReadControlFile(File: string): IslandEventMode {
    const Stat = lstatSync(File, {throwIfNoEntry: false});
    if(Stat === undefined) return "default";
    if(!Stat.isFile() || Stat.isSymbolicLink() || Stat.size > 128) throw new Error("Invalid island event control file");
    const Value: unknown = JSON.parse(readFileSync(File, "utf8"));
    if(typeof Value !== "object" || Value === null || Array.isArray(Value) || !Object.hasOwn(Value, "mode") || !["default", "off", "trials"].includes((Value as {mode?: unknown}).mode as string)) throw new Error("Invalid island event control file");
    return (Value as {mode: IslandEventMode}).mode;
}

export function IslandEventModeNow(): IslandEventMode {
    const File = ControlFile();
    return File === undefined ? "default" : ReadControlFile(File);
}

export function IslandEventEnabled(): boolean {
    const Mode = IslandEventModeNow();
    return Mode === "trials" || (Mode === "default" && TrialsSchedule());
}

export function SetIslandEventMode(Mode: IslandEventMode): IslandEventMode {
    if(!["default", "off", "trials"].includes(Mode)) throw new Error("Invalid island event mode");
    const File = ControlFile();
    if(File === undefined) throw new Error("Island event control is not configured");
    const Existing = lstatSync(File, {throwIfNoEntry: false});
    if(Existing !== undefined && (!Existing.isFile() || Existing.isSymbolicLink())) throw new Error("Invalid island event control file");
    writeFileSync(File, JSON.stringify({mode: Mode}) + "\n", {encoding: "utf8", mode: 0o600});
    return Mode;
}
