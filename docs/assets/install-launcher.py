#!/usr/bin/env python3
"""Native Linux setup. Never reads or changes account keys, saves or game files."""
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import subprocess
import sys
import tempfile
import urllib.request

REPO = 'Vvoidddd/dauntless-unbroken'
API = 'https://api.github.com/repos/' + REPO + '/releases/latest'


def os_release(text):
    fields = {}
    for line in text.splitlines():
        key, sep, value = line.partition('=')
        if sep and key in ('ID', 'ID_LIKE', 'VERSION_ID', 'PRETTY_NAME'):
            words = shlex.split(value, comments=True)
            fields[key] = ' '.join(words)
    return fields


def package_kind(info, machine, immutable=False):
    if machine.lower() not in ('x86_64', 'amd64'):
        raise RuntimeError('This game requires an x86_64 computer; ARM and 32-bit Linux are not supported.')
    families = set((info.get('ID', '') + ' ' + info.get('ID_LIKE', '')).lower().split())
    if immutable or families.intersection({'steamos', 'bazzite', 'silverblue', 'kinoite', 'nixos'}):
        return 'appimage'
    if families.intersection({'debian', 'ubuntu', 'pop', 'linuxmint', 'elementary'}):
        return 'deb'
    if families.intersection({'fedora', 'rhel', 'centos', 'rocky', 'almalinux', 'suse', 'opensuse', 'opensuse-tumbleweed', 'opensuse-leap'}):
        return 'rpm'
    return 'appimage'


def release_asset(release, kind):
    tag = release.get('tag_name', '')
    version = tag.removeprefix('launcher-v') if hasattr(tag, 'removeprefix') else tag[len('launcher-v'):]
    if not tag.startswith('launcher-v') or len(version.split('.')) != 3 or not all(p.isdigit() for p in version.split('.')):
        raise RuntimeError('The latest launcher release has an invalid version.')
    suffix = {'deb': 'linux-amd64.deb', 'rpm': 'linux-x86_64.rpm', 'appimage': 'linux-x86_64.AppImage'}[kind]
    name = 'DauntlessUnbrokenLauncher-' + version + '-' + suffix
    matches = [a for a in release.get('assets', []) if a.get('name') == name]
    if len(matches) != 1:
        raise RuntimeError('The matching Linux package is not available in the latest release yet.')
    asset = matches[0]
    expected_url = 'https://github.com/' + REPO + '/releases/download/' + tag + '/' + name
    digest = asset.get('digest', '')
    if asset.get('browser_download_url') != expected_url or not digest.startswith('sha256:') or len(digest) != 71 or any(c not in '0123456789abcdef' for c in digest[7:]):
        raise RuntimeError('The package URL or SHA-256 checksum is missing or invalid.')
    if not isinstance(asset.get('size'), int) or not 0 < asset['size'] <= 1024**3:
        raise RuntimeError('Invalid package size.')
    return asset


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'DauntlessUnbrokenSetup', 'Accept': 'application/vnd.github+json'}), timeout=60)


def download(asset, target):
    total, digest = 0, hashlib.sha256()
    with fetch(asset['browser_download_url']) as response, target.open('xb') as output:
        while True:
            block = response.read(1024**2)
            if not block:
                break
            total += len(block)
            if total > asset['size']:
                raise RuntimeError('Download exceeded the expected size.')
            digest.update(block)
            output.write(block)
            print('\rDownloading: {:3d}%'.format(total * 100 // asset['size']), end='', flush=True)
    print()
    if total != asset['size'] or 'sha256:' + digest.hexdigest() != asset['digest']:
        raise RuntimeError('Download verification failed. Nothing was installed; run setup again to retry.')


def package_command(kind, file, find=shutil.which):
    tools = [('apt-get', ['install', '-y'])] if kind == 'deb' else [('dnf', ['install', '-y']), ('zypper', ['--non-interactive', 'install'])]
    for tool, args in tools:
        command = find(tool)
        if command:
            if os.geteuid() == 0:
                return [command] + args + [str(file)]
            elevation = find('pkexec') or find('sudo')
            if elevation:
                return [elevation, command] + args + [str(file)]
    raise RuntimeError('Native package installation is unavailable. Use the AppImage from the download page.')


def install_appimage(file, home):
    directory = home / '.local' / 'opt' / 'dauntless-unbroken-launcher'
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / 'DauntlessUnbrokenLauncher.AppImage'
    # Stage next to the destination for an atomic replacement, including on another filesystem.
    handle, staged = tempfile.mkstemp(prefix='.setup-', dir=directory)
    os.close(handle)
    try:
        shutil.copyfile(file, staged)
        os.chmod(staged, 0o755)
        os.replace(staged, target)
    finally:
        if os.path.exists(staged):
            os.unlink(staged)
    applications = home / '.local' / 'share' / 'applications'
    applications.mkdir(parents=True, exist_ok=True)
    # Extraction mode works without FUSE and leaves SteamOS's read-only system untouched.
    escaped = str(target).replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%')
    shortcut = '[Desktop Entry]\nType=Application\nName=Dauntless Unbroken Launcher\nExec=env APPIMAGE_EXTRACT_AND_RUN=1 "' + escaped + '"\nTerminal=false\nCategories=Game;\n'
    (applications / 'dauntless-unbroken-launcher.desktop').write_text(shortcut, encoding='utf-8')
    return target


def main():
    if platform.system() != 'Linux':
        raise RuntimeError('For Windows, use https://github.com/' + REPO + '/releases/latest/download/DauntlessUnbrokenLauncher-Setup.exe')
    if os.geteuid() == 0:
        raise RuntimeError('Run this setup as your normal desktop user, not with sudo. Setup requests permission only if needed.')
    info = os_release(Path('/etc/os-release').read_text(encoding='utf-8'))
    kind = package_kind(info, platform.machine(), Path('/run/ostree-booted').exists())
    print('Dauntless Unbroken setup\nDetected: {} ({})\nPackage: {}'.format(info.get('PRETTY_NAME', info.get('ID', 'Linux')), info.get('VERSION_ID', 'rolling'), kind))
    if info.get('ID') == 'nixos':
        raise RuntimeError('NixOS needs appimage-run; use the NixOS instructions in the Linux guide.')
    with fetch(API) as response:
        release = json.load(response)
    asset = release_asset(release, kind)
    print('Release: ' + release['tag_name'])
    if sys.argv[1:] == ['--check']:
        print('Ready: ' + asset['name'])
        return
    if sys.argv[1:]:
        raise RuntimeError('Usage: python3 install-launcher.py [--check]')
    with tempfile.TemporaryDirectory(prefix='unbroken-setup-') as temporary:
        file = Path(temporary) / asset['name']
        download(asset, file)
        print('SHA-256 verified. Installing native Linux launcher…')
        if kind == 'appimage':
            install_appimage(file, Path.home())
        else:
            subprocess.run(package_command(kind, file), check=True)
    print('Installed. Open Dauntless Unbroken Launcher from your applications menu.\nKeep your existing account backup; no account or game files were changed.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print('\nSetup stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
