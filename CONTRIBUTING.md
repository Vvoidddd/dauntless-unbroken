# Contributing to Dauntless Unbroken

The release branch is `1.10.5` in [Vvoidddd/dauntless-unbroken](https://github.com/Vvoidddd/dauntless-unbroken). Use a focused branch and explain the resulting behavior in your pull request.

## Development

Read the [server architecture](docs/server.md) and the affected package's README. Keep source, deployed installations and persistent data separate. Use disposable test accounts and databases.

- Update callers, configuration and documentation when changing names or interfaces.
- Add meaningful regression coverage for changes to saves, currency, authentication, matchmaking or process cleanup.
- Run the affected package's build and tests. Node services use Node 24; native Windows builds require the C++ tools.
- Never commit credentials, databases, retail game assets, private logs or environment files.
- Preserve copyright and license notices.

## Documentation

The main site has three entry points: Play, Run a server and Reference. Detailed pages should remain searchable rather than becoming extra navigation tabs.

After changing the roadmap or guides, run:

```sh
node tools/sync-roadmap.js
node tools/build-llms.js
```

Build the Jekyll site and check links, code blocks, tables and mobile styles. There are no hosting-provider partnerships.

## Releases

GitHub CI is manual-only for now. Run the affected checks locally before pushing; a hosted CI run is
available through Actions > **CI** > **Run workflow**. The default CodeQL setup is separate from
that workflow and may still report automatically. The launcher version is in
`DauntlessUnbrokenLauncher/package.json`.

### Which CI checks run

When CI is run manually, its selector uses the changed paths between the selected commit and the
`1.10.5` branch. A skipped job means that its inputs were not changed; it is expected and does not
indicate a failed test.

- Package source changes under a package's `src/` directory run the affected package and server-port checks. Package build/install metadata and deployment changes also run the Windows server-kit checks, including the sandbox.
- Package test-only changes run the affected package and server-port checks without rebuilding the Windows server-kit sandbox.
- For source-only changes, run the affected package's `npm test` locally before pushing. Run the Windows server-kit scripts locally when changing deployment behavior; CI reserves those hosted jobs for build/install and deployment changes.
- `deploy/windows-server/` changes run all server-kit phases.
- Changes to the CI workflow run the selector, server-kit unit and remote checks. Changes to the CodeQL workflow select the Actions analysis without running unrelated CI suites.
- Documentation, launcher, native-server and other paths select only their corresponding checks.

CodeQL analysis runs through GitHub's separate code-scanning setup. It is not a substitute for the
local test commands above.

### Launcher releases

After the local launcher checks pass, merge the version change into `1.10.5`, then run Actions >
**Launcher release** > **Run workflow** for that branch. The workflow builds and tests the Windows
and Linux packages when `launcher-v<version>` does not exist, publishes that versioned release,
updates the rolling `launcher-updates` feed, and publishes build provenance. If the versioned release
already exists, it only repairs the rolling feed. Re-run failed jobs if a publication is interrupted.

The `launcher-news` workflow remains automatic on public-branch pushes and published releases. The
`launcher-discord` workflow refreshes the public download announcement after a successful release
workflow. Neither workflow runs in the private repository.

Use a test environment for in-game verification. Ordinary deployments must not maximize player accounts.

## Licensing

Contributions are provided under AGPL-3.0-only. See [LICENSE.txt](LICENSE.txt), [NOTICE.md](NOTICE.md) and bundled software notices.
