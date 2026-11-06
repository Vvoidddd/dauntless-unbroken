import hashlib
import importlib.util
import io
import json
import os
import subprocess
from pathlib import Path, PurePosixPath
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('setup',Path(__file__).resolve().parents[1]/'docs/assets/install-launcher.py')
setup=importlib.util.module_from_spec(spec);spec.loader.exec_module(setup)


class InstallerTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'posix', 'Linux desktop entry parser')
    def test_desktop_setup_executes_verified_installer_and_preserves_download_failures(self):
        try:
            from gi.repository import GLib, Gio
        except ImportError:
            self.skipTest('GLib Python bindings unavailable')
        desktop=Path(__file__).resolve().parents[1]/'docs/assets/Install-Dauntless-Unbroken.desktop'
        keyfile=GLib.KeyFile();keyfile.load_from_file(str(desktop),0)
        self.assertIsNotNone(Gio.DesktopAppInfo.new_from_filename(str(desktop)))
        _,args=GLib.shell_parse_argv(keyfile.get_string('Desktop Entry','Exec'))
        for value in ['Home With Spaces', 'Home $dollar `tick` "quote" \\slash %percent']:
            data='[Desktop Entry]\nExec='+setup.desktop_argument(value)+'\n'
            entry=GLib.KeyFile();entry.load_from_data(data,len(data.encode()),0)
            _,parsed=GLib.shell_parse_argv(entry.get_string('Desktop Entry','Exec'))
            self.assertEqual(parsed[0].replace('%%','%'),value)
        with tempfile.TemporaryDirectory() as tmp:
            curl=Path(tmp)/'curl'
            curl.write_text('#!/bin/sh\n[ -z "$FAIL_DOWNLOAD" ] || exit 22\nwhile [ "$1" != "-o" ]; do shift; done\nprintf \'print("setup executed")\\n\' > "$2"\n')
            curl.chmod(0o755)
            env=dict(os.environ,PATH=tmp+os.pathsep+os.environ['PATH'])
            result=subprocess.run(args,input='\n',env=env,text=True,capture_output=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('setup executed',result.stdout)
            result=subprocess.run(args,input='\n',env=dict(env,FAIL_DOWNLOAD='1'),text=True,capture_output=True)
            self.assertEqual(result.returncode,22,result.stderr)
            self.assertNotIn('setup executed',result.stdout)

    def test_distribution_and_version(self):
        for text,wanted in [
            ('ID=pop\nID_LIKE="ubuntu debian"\nVERSION_ID="22.04"','deb'),
            ('ID=ubuntu\nVERSION_ID=24.04','deb'),('ID=debian','deb'),('ID=linuxmint','deb'),
            ('ID=fedora\nVERSION_ID=44','rpm'),('ID=rocky\nID_LIKE="rhel fedora"','rpm'),
            ('ID=opensuse-tumbleweed','rpm'),('ID=steamos\nID_LIKE=arch','appimage'),
            ('ID=bazzite\nID_LIKE=fedora','appimage'),('ID=arch','appimage'),('ID=unknown','appimage'),
        ]:
            info=setup.os_release(text)
            self.assertEqual(setup.package_kind(info,'x86_64'),wanted)
        self.assertEqual(setup.os_release('ID=pop\nVERSION_ID="22.04"')['VERSION_ID'],'22.04')
        self.assertEqual(setup.package_kind({'ID':'fedora'},'x86_64',True),'appimage')
        with self.assertRaises(RuntimeError):setup.package_kind({'ID':'pop'},'aarch64')

    def test_verified_download_and_trusted_asset(self):
        data=b'native Linux package'
        asset={'name':'DauntlessUnbrokenLauncher-1.0.42-linux-amd64.deb','browser_download_url':'https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-v1.0.42/DauntlessUnbrokenLauncher-1.0.42-linux-amd64.deb','size':len(data),'digest':'sha256:'+hashlib.sha256(data).hexdigest()}
        release={'tag_name':'launcher-v1.0.42','assets':[asset]}
        self.assertEqual(setup.release_asset(release,'deb'),asset)
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'package.deb'
            with patch.object(setup,'fetch',return_value=io.BytesIO(data)):setup.download(asset,target)
            self.assertEqual(target.read_bytes(),data)
            with patch.object(setup,'fetch',return_value=io.BytesIO(b'changed')):
                with self.assertRaises(RuntimeError):setup.download(asset,Path(tmp)/'bad.deb')
        for field,value in [('browser_download_url','https://evil.invalid/package.deb'),('digest',''),('name','../bad.deb')]:
            bad=dict(asset);bad[field]=value
            with self.assertRaises(RuntimeError):setup.release_asset(dict(release,assets=[bad]),'deb')

    def test_native_install_commands_and_portable_reinstall_preserve_accounts(self):
        with patch.object(setup.os,'geteuid',return_value=1000,create=True):
            paths={'pkexec':'/usr/bin/pkexec','apt-get':'/usr/bin/apt-get','dnf':'/usr/bin/dnf'}
            self.assertEqual(setup.package_command('deb',PurePosixPath('/tmp/a b.deb'),paths.get),['/usr/bin/pkexec','/usr/bin/apt-get','install','-y','/tmp/a b.deb'])
            self.assertEqual(setup.package_command('rpm',Path('/tmp/a.rpm'),paths.get)[1],'/usr/bin/dnf')
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp)/'Home With Spaces';home.mkdir()
            config=home/'.config';config.mkdir();key=config/'account.key';key.write_text('keep-private')
            source=Path(tmp)/'verified.AppImage';source.write_bytes(b'first')
            target=setup.install_appimage(source,home)
            source.write_bytes(b'updated');self.assertEqual(setup.install_appimage(source,home),target)
            self.assertEqual(target.read_bytes(),b'updated');self.assertEqual(key.read_text(),'keep-private')
            self.assertEqual(sorted(f.name for f in target.parent.iterdir()),['DauntlessUnbrokenLauncher.AppImage','launch.sh'])
            shortcut=(home/'.local/share/applications/dauntless-unbroken-launcher.desktop').read_text()
            wrapper=target.parent/'launch.sh'
            self.assertIn('"'+str(wrapper).replace('\\','\\\\\\\\')+'" %u',shortcut)
            self.assertIn('MimeType=x-scheme-handler/dauntless-unbroken;',shortcut)
            if os.name=='posix':
                # Execute the installed Steam target, with a fake AppImage, from
                # another directory. URLs/spaces must survive without shell expansion.
                target.write_text('#!/bin/sh\nprintf "%s\\n" "$APPIMAGE_EXTRACT_AND_RUN" "$@"\n')
                invite='dauntless-unbroken://join?name=One Two&code=ABC'
                result=subprocess.run([str(wrapper),invite],cwd=tmp,text=True,capture_output=True,check=True)
                self.assertEqual(result.stdout.splitlines(),['1',invite])


if __name__=='__main__':unittest.main()
