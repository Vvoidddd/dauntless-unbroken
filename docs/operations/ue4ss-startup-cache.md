# UE4SS startup cache migration

Launcher1.0.37 and the friend-kit installer apply the existing shipped
`[General] bUseUObjectArrayCache = false` default to kept UE4SS INIs too.
Earlier updates only migrated the two Lua reload safety flags, leaving an older
object-array cache setting enabled or missing. Both installers preserve other
sections, comments, line endings, GUI preferences and mod switches.

The UE4SS3.0.1 release notes list disabling this cache as a possible startup-crash
workaround: <https://github.com/UE4SS-RE/RE-UE4SS/releases/tag/v3.0.1>.
This closes a configuration-migration gap; it does not identify every access violation.

This gap was found while investigating a startup access violation with UE4SS
first in the stack on launcher1.0.33. That individual crash remains unconfirmed
until a native UE4SS log or a successful configuration/retest is available.

`npm test -- client-mods` covers the real kept-INI installer, missing/duplicate
keys, mixed key casing, comments, section isolation, repeated installation and
PowerShell friend-kit parity. All10checks passed locally on Windows.
