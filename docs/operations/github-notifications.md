# GitHub notifications

The `Vvoidddd/dauntless-unbroken` repository uses a native repository webhook for `push` and `release` events. Its destination is Discord's GitHub-compatible webhook endpoint. The destination URL is kept in private GitHub webhook settings, never in launcher files or public source.

Webhook ID: `700219482`. TLS certificate verification is enabled. GitHub's initial ping received HTTP 204 from Discord.

Inspect recent deliveries under repository **Settings → Webhooks** after a push or launcher publication. HTTP 204 is a successful Discord delivery. No extra bot process or polling job is required. Update the existing hook rather than adding duplicates when changing the destination.
