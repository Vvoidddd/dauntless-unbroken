# Dauntless Unbroken artwork

The purple aether landscape and silver/purple emblem were generated for
Dauntless Unbroken with OpenAI image generation. The editable wordmark is
`wordmark.svg`; `logo-full.png` is its rendered master. Upstream code and
contributors remain credited in [UPSTREAM.md](../UPSTREAM.md).

`palette.json` defines the eight shared purple theme tokens and measured WCAG
contrast ratios. `build.py --check` verifies those ratios, documentation tokens
and copied images. The launcher adds its layout in
`DauntlessUnbrokenLauncher/src/renderer/unbroken-theme.css`.

Run `python3 brand/build.py` from the repository root to regenerate icons,
web, launcher, banner and social derivatives. It needs Pillow 9.1 or newer,
`rsvg-convert`, Inter and JetBrains Mono. Then run `npm run icon` in
`DauntlessUnbrokenLauncher` to update the packaged copies.

The cinematic launcher background is
`DauntlessUnbrokenLauncher/src/renderer/brand/hero-unbroken.png`. It is separate
from the emblem and wordmark so text remains readable at different sizes.
