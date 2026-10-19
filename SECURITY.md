# Security policy: Dauntless Unbroken

## Supported versions

The latest release and current `main` source in [Vvoidddd/dauntless-unbroken](https://github.com/Vvoidddd/dauntless-unbroken) are supported. Reproduce problems on a current, isolated installation when possible.

## Report privately

Use **Security → Report a vulnerability** when available. Otherwise, open an issue requesting a private reporting channel without exploit details. Include the component, version/commit, reproduction steps and impact.

Never publish live account keys, bot tokens, environment files or other players' data. Responses and disclosure coordination are best effort. Test only installations you are authorized to test.

## Scope

The metagame, gateway, deploy service, content service, custom native integration, launcher, Discord bot, deployment scripts and documentation maintained here are in scope.

The proprietary game executable, hosting infrastructure and external services have their own maintainers. A boundary failure in Unbroken's integration is still relevant.

## Design boundaries

- Metagame and deploy listeners are loopback-only by default. The deploy service starts game processes and must remain private.
- Public player traffic uses the TLS gateway. Launcher connections pin the certificate fingerprint from the invite.
- The launcher relay listens on local loopback and restricts which local processes may use it.
- Public player requests cannot use management routes or game-server credentials.
- UDP game ports have a separate configured range and player allowlist.
- Desktop account-key recovery files are intentionally readable. Keep them private.
- R2 downloads receive no account key; files must match the compiled game manifest.
- Offline mode uses separate local identity and save data.

See the [server guide](https://vvoidddd.github.io/dauntless-unbroken/server.html) for deployment and network guidance.
