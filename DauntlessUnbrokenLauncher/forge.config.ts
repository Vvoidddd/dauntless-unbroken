import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerAppImage } from "@reforged/maker-appimage";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Windows uses Squirrel plus a portable ZIP. Linux builds AppImage, deb, rpm and a portable ZIP.
// CI builds both platforms on every push and launcher-release.yml publishes them together.
const skipRpm = process.env.DAUNTLESS_UNBROKEN_SKIP_RPM === "1";
const launcherResources = ["assets/dxgi.dll", "assets/DauntlessUnbroken.dll", "assets/icon.png", "THIRD-PARTY-NOTICES.txt", "../client-mods"];

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "Dauntless Unbroken Launcher",
    executableName: "DauntlessUnbrokenLauncher",
    appBundleId: "io.github.vvoidddd.dauntlessunbroken",
    appCopyright: "Dauntless Unbroken contributors. Free software under the GNU AGPL-3.0.",
    // assets/icon.ico (the exe, and below the installer) and assets/icon.png (the window) are copies of
    // the brand icons in ../brand/launcher/, made by npm run icon.
    icon: "assets/icon",
    // The two pinned DLLs the game needs, the window icon, and the license texts of the third-party
    // software the launcher and the DLLs include, plus ../client-mods (UE4SS and the client mods, installed
    // by src/main/client-mods.ts). Windows also ships the offline runtime outside the asar.
    extraResource: launcherResources,
    win32metadata: {
      CompanyName: "Dauntless Unbroken",
      FileDescription: "Dauntless Unbroken Launcher",
      ProductName: "Dauntless Unbroken Launcher",
      InternalName: "DauntlessUnbrokenLauncher",
      OriginalFilename: "DauntlessUnbrokenLauncher.exe",
    },
  },
  rebuildConfig: {
    onlyModules: [],
  },
  hooks: {
    generateAssets: async (forgeConfig, platform, arch) => {
      const resources = [...launcherResources];
      if (platform === "win32") {
        if (process.platform !== "win32" || arch !== process.arch) {
          throw new Error("Windows offline runtime must be staged on Windows for the packaging architecture");
        }
        // Both package and make (including direct Forge/CI invocation) rebuild from
        // locked source dependencies. A missing or stale generated runtime cannot ship.
        execFileSync(process.execPath, [path.resolve("scripts/stage-offline-runtime.mjs"), "--install-build-dependencies"], {
          cwd: process.cwd(), stdio: "inherit",
        });
        resources.push("offline-runtime");
      }
      forgeConfig.packagerConfig.extraResource = resources;
    },
  },
  makers: [
    new MakerSquirrel({
      name: "DauntlessUnbrokenLauncher",
      authors: "Vvoidddd and upstream contributors",
      description: "Dauntless Unbroken Launcher",
      setupExe: "DauntlessUnbrokenLauncher-Setup.exe",
      setupIcon: "assets/icon.ico",
      iconUrl: "https://raw.githubusercontent.com/Vvoidddd/dauntless-unbroken/main/DauntlessUnbrokenLauncher/assets/icon.ico",
      noMsi: true,
    }, ["win32"]),
    new MakerZIP({}, ["win32", "linux"]),
    new MakerDeb(
      {
        options: {
          name: "dauntless-unbroken-launcher",
          productName: "Dauntless Unbroken Launcher",
          genericName: "Game Launcher",
          bin: "DauntlessUnbrokenLauncher",
          description: "Launcher for the Dauntless Unbroken community servers",
          section: "games",
          priority: "optional",
          maintainer: "Vvoidddd",
          homepage: "https://github.com/Vvoidddd/dauntless-unbroken",
          icon: "assets/icon.png",
          categories: ["Game"],
          mimeType: ["x-scheme-handler/dauntless-unbroken"],
          recommends: ["gnome-keyring", "libsecret-1-0", "pkexec"],
          suggests: ["wine64", "steam"],
        },
      },
      ["linux"],
    ),
    ...(skipRpm
      ? []
      : [
          new MakerRpm(
            {
              options: {
                name: "dauntless-unbroken-launcher",
                productName: "Dauntless Unbroken Launcher",
                genericName: "Game Launcher",
                bin: "DauntlessUnbrokenLauncher",
                description: "Launcher for the Dauntless Unbroken community servers",
                license: "AGPL-3.0-only",
                homepage: "https://github.com/Vvoidddd/dauntless-unbroken",
                icon: "assets/icon.png",
                categories: ["Game"],
                mimeType: ["x-scheme-handler/dauntless-unbroken"],
              },
            },
            ["linux"],
          ),
        ]),
    new MakerAppImage({
      options: {
        name: "dauntless-unbroken-launcher",
        productName: "Dauntless Unbroken Launcher",
        genericName: "Game Launcher",
        bin: "DauntlessUnbrokenLauncher",
        icon: "assets/icon.png",
        categories: ["Game"],
        mimeType: ["x-scheme-handler/dauntless-unbroken"],
        keywords: ["Dauntless", "launcher", "gaming", "Proton", "Wine"],
        compressor: "zstd",
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "src/preload.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
    // Switched off at package time: running the exe as plain Node, NODE_OPTIONS, the inspector
    // flags, and loading app code from anywhere but the (integrity-checked) asar.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
