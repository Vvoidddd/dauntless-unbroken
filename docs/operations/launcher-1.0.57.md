# Launcher 1.0.57 release

Launcher 1.0.57 is the current public launcher release. The versioned release is
[Launcher 1.0.57](https://github.com/Vvoidddd/dauntless-unbroken/releases/tag/launcher-v1.0.57).
It contains the Windows installer and portable ZIP, plus Linux AppImage, DEB, RPM, ZIP and tar.gz
packages. `SHA256SUMS.txt` is published with the files.

Windows launchers use the rolling `launcher-updates` release for Squirrel updates. Linux users update
by installing the newer DEB or RPM, replacing the AppImage, or replacing the portable archive. The
Linux launcher runs the pinned Windows client through an installed Proton or Wine runtime; no game
files are bundled in the launcher release.

The release workflow ran the Windows and Linux typecheck, unit-test and package-build steps before
publishing. The public launcher news feed contains the release entry, and the public Discord download
feed refreshes after a successful release workflow. The first news publication attempt encountered
GitHub's short release-visibility delay; rerunning the failed job succeeded. The release-news lookup
now retries that transient 404 before failing.

Regular GitHub CI is manual-only. Run the affected checks locally before pushing, then use Actions >
**Launcher release** > **Run workflow** on `1.10.5` when a new launcher version is ready. A versioned
release is never replaced. If it already exists, the workflow only repairs the rolling update feed.

The Windows installer is not code-signed yet, so SmartScreen may require confirmation. Verify the
download against `SHA256SUMS.txt` before running it. The release is an unofficial community build and
does not include retail game files.
