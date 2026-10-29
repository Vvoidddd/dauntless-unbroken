export function downloadPlatform(platform, userAgent) {
  const value = `${platform || ''} ${userAgent || ''}`;
  if (/Android|iPhone|iPad/i.test(value)) return 'unsupported';
  if (/Windows|Win32|Win64/i.test(value)) return 'windows';
  if (/Linux|X11|SteamOS/i.test(value)) return 'linux';
  return 'unsupported';
}
if (typeof document !== 'undefined') {
  const platform = downloadPlatform(navigator.userAgentData?.platform || navigator.platform, navigator.userAgent);
  const note = document.getElementById('download-platform');
  if (note) note.textContent = platform === 'windows' ? 'Windows detected — use the Windows installer below.'
    : platform === 'linux' ? 'Linux detected — use automatic Linux setup below. It checks your distribution locally.'
    : 'The game supports Windows and x86_64 Linux. Choose the matching option on your gaming computer.';
  const link = document.getElementById('recommended-download');
  if (link && platform !== 'unsupported') {
    link.hidden = false;
    link.href = platform === 'windows' ? 'https://github.com/Vvoidddd/dauntless-unbroken/releases/latest/download/DauntlessUnbrokenLauncher-Setup.exe' : '#linux';
    link.textContent = platform === 'windows' ? 'Download Windows installer' : 'Set up on Linux';
  }
}
