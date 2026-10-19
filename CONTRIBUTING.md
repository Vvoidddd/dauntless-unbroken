# Contributing to Dauntless Unbroken

The default branch is `main` in [Vvoidddd/dauntless-unbroken](https://github.com/Vvoidddd/dauntless-unbroken). Use a focused branch and explain the resulting behavior in your pull request.

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

CI checks the services, native integration, launcher, deployment kits, Linux/OpenBSD paths, documentation and repository hygiene. Required checks must pass before a launcher release. Its version is in `DauntlessUnbrokenLauncher/package.json`.

Use a test environment for in-game verification. Ordinary deployments must not maximize player accounts.

## Licensing

Contributions are provided under AGPL-3.0-only. See [LICENSE.txt](LICENSE.txt), [NOTICE.md](NOTICE.md) and bundled software notices.
