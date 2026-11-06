import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { rebuild } from "@electron/rebuild";

const require = createRequire(import.meta.url);
const electronVersion = require("electron/package.json").version;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const launcherDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(launcherDir, "..");

const metagameSource = path.join(repoDir, "DauntlessUnbrokenMetagame");
const deploySource = path.join(repoDir, "DauntlessUnbrokenDeployServer");

const outputDir = path.join(launcherDir, "offline-runtime");
const metagameOutput = path.join(outputDir, "metagame");
const deployOutput = path.join(outputDir, "deploy");

if (process.argv.includes("--install-build-dependencies")) {
    runNpm(metagameSource, ["ci"]);
    runNpm(deploySource, ["ci"]);
}

function runNpm(directory, args) {
    // Keep Forge's npm version; a global npm on PATH may be older than the caller.
    if (process.env.npm_execpath) {
        execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
            cwd: directory, stdio: "inherit",
        });
        return;
    }
    if (process.platform === "win32") {
        execFileSync(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", `npm ${args.join(" ")}`],
            {
                cwd: directory,
                stdio: "inherit",
            },
        );

        return;
    }

    execFileSync("npm", args, {
        cwd: directory,
        stdio: "inherit",
    });
}

async function installServiceDependencies(directory) {
    console.log(`Installing production dependencies in ${directory}...`);
    // Native modules are prepared explicitly below for Electron. Host install scripts
    // can pick Forge's node-gyp from PATH and build for the wrong runtime/toolchain.
    runNpm(directory, ["ci", "--omit=dev", "--ignore-scripts"]);

    const sqlitePackage = JSON.parse(await readFile(path.join(directory, "node_modules/better-sqlite3/package.json"), "utf8"));
    // v13 bundles stable Node-API binaries and explicitly disables GYP. Older releases
    // use the host Node ABI and must still be rebuilt for Electron.
    if (sqlitePackage.gypfile !== false) {
        console.log(`Rebuilding better-sqlite3 for Electron ${electronVersion}...`);
        await rebuild({ buildPath: directory, electronVersion, force: true, onlyModules: ["better-sqlite3"] });
    }
    // Validate the actual staged binding under Electron before it can enter an installer.
    execFileSync(require("electron"), ["-e", `
        const { createRequire } = require('node:module');
        const path = require('node:path');
        const load = createRequire(path.join(process.argv[1], 'package.json'));
        const db = load('better-sqlite3')(':memory:');
        if (db.pragma('quick_check', { simple: true }) !== 'ok') throw Error('SQLite native check failed');
        db.close();
    `, directory], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: "inherit" });
}

async function copyServiceBase(source, destination) {
    await mkdir(destination, { recursive: true });

    await cp(
        path.join(source, "dist"),
        path.join(destination, "dist"),
        { recursive: true },
    );

    await cp(
        path.join(source, "package.json"),
        path.join(destination, "package.json"),
    );

    await cp(
        path.join(source, "package-lock.json"),
        path.join(destination, "package-lock.json"),
    );
}

await rm(outputDir, {recursive: true, force: true, maxRetries: 5, retryDelay: 200,});
await mkdir(outputDir, { recursive: true });

console.log("Building Metagame...");
runNpm(metagameSource, ["run", "build"]);

console.log("Building Deploy...");
runNpm(deploySource, ["run", "build"]);

console.log("Staging Metagame...");
await copyServiceBase(metagameSource, metagameOutput);

// Drizzle migrations are loaded from ./src/drizzle at runtime and are not
// emitted by TypeScript, so the packaged service needs them explicitly.
await cp(
    path.join(metagameSource, "src", "drizzle"),
    path.join(metagameOutput, "src", "drizzle"),
    { recursive: true },
);

await installServiceDependencies(metagameOutput);

console.log("Staging Deploy...");
await copyServiceBase(deploySource, deployOutput);
await installServiceDependencies(deployOutput);

for (const file of ["local-service-runner.cjs", "register-gameserver-key.cjs", "offline-save-db.cjs"]) {
    await cp(path.join(launcherDir, "runtime", file), path.join(outputDir, file));
}

// Reuse the server kit's supported, idempotent key registration rather than
// teaching the Launcher about Metagame's database schema.
for (const file of ["dr-db.js", "backup-policy.cjs"]) {
    await cp(path.join(repoDir, "deploy", "windows-server", "lib", file), path.join(outputDir, file));
}

const dllSource = await readFile(path.join(repoDir, "DauntlessUnbrokenInternalServer", "dllmain.cpp"), "utf8");
const endpoints = {};
const entry = /^\s*\{L"([A-Za-z0-9_]+)", L"http:\/\/" \+ Globals::MetagameAddress(?: \+ L"([^"]*)")?\},?/gm;
for (const match of dllSource.matchAll(entry)) {
    if (Object.hasOwn(endpoints, match[1])) throw new Error("Duplicate game-server endpoint");
    // The vendor event path embeds an obsolete webhook credential. Local telemetry
    // needs no vendor secret; never copy it into generated or packaged resources.
    endpoints[match[1]] = match[1] === "PhoenixEventsMessageEndpoint" ? "/offline-events" : (match[2] ?? "");
}
if (Object.keys(endpoints).length !== 167) throw new Error("Unexpected 1.4.4 endpoint table; review before packaging");
await writeFile(path.join(outputDir, "game-endpoints.json"), JSON.stringify(endpoints));

console.log(`Offline runtime staged at ${outputDir}`);
