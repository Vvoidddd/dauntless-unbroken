# Dauntless Unbroken artwork

The launcher background is the supplied [Umbral Nayzaga game artwork](https://massivelyop.com/wp-content/uploads/2020/06/umbral-nayzaga-2-1.jpg), bundled locally as
`DauntlessUnbrokenLauncher/src/renderer/brand/hero-umbral-nayzaga.jpg`.
`emblem.png` is the transparent behemoth cutout made from the supplied screenshot
with the built-in OpenAI image tool. The editable wordmark is `wordmark.svg`;
`logo-full.png` is its rendered master. Game artwork remains the property of its
respective owners. Upstream code and
contributors remain credited in [UPSTREAM.md](../UPSTREAM.md).

`palette.json` defines eight shared umbral navy/violet tokens and measured WCAG
contrast ratios. `build.py --check` verifies those ratios, documentation tokens
and copied images. The launcher adds its layout in
`DauntlessUnbrokenLauncher/src/renderer/unbroken-theme.css`.

Run `python3 brand/build.py` from the repository root to regenerate icons,
web, launcher, banner and social derivatives. It needs Pillow 9.1 or newer,
`rsvg-convert`, Inter and JetBrains Mono. Then run `npm run icon` in
`DauntlessUnbrokenLauncher` to update the packaged copies.

The cinematic launcher background is
`DauntlessUnbrokenLauncher/src/renderer/brand/hero-umbral-nayzaga.jpg`. It is separate
from the emblem and wordmark so text remains readable at different sizes.

## Background-removal prompt

Use case: background-extraction. Edit target: the user's attached screenshot of
the blue-black, purple-horned Dauntless behemoth. Remove ONLY the environment/background
(forest, sky, ground) and produce a clean genuinely transparent PNG cutout of the
visible behemoth for a desktop application icon. Preserve the exact creature
identity, pose, two tall purple horns, glowing purple eyes, dark blue armor,
original game-render appearance and colors. Do not invent extra anatomy, change
its design, add any text, badge, frame, circle, drop shadow or scenery. Preserve
the visible creature silhouette including the cropped body as shown; clean edge
pixels. Center the cutout on a square transparent canvas with a small safe margin
so the horns are not clipped. The attached screenshot is the only edit target.
