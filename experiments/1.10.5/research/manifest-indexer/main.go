// Build-time adapter for the pinned Epic manifest. No game data or credentials are exported.
package main

import (
 "crypto/sha1"
 "encoding/json"
 "fmt"
 "os"
 "github.com/meszmate/manifest"
)

func main() {
 data, err := os.ReadFile(os.Args[1]); if err != nil { panic(err) }
 if fmt.Sprintf("%x", sha1.Sum(data)) != "a31648745d9e41016aaa6ed9a16d1eabab85ec7d" { panic("Unexpected 1.10.5 manifest") }
 m, err := manifest.ParseManifestFile(os.Args[1]); if err != nil { panic(err) }
 files := []any{}; chunks := map[string]any{}
 for _, f := range m.FileManifestList.FileManifestList {
  parts := []any{}
  for _, p := range f.ChunkParts {
   c := p.Chunk; id := c.GUID.String()
   parts = append(parts, []any{id, p.Offset, p.Size})
   chunks[id] = map[string]any{"path":m.ChunkURL("", c), "size":c.FileSize, "sha":fmt.Sprintf("%x", c.SHAHash)}
  }
  if f.SymlinkTarget != "" { panic("Unexpected symlink in manifest") }
  files = append(files, map[string]any{"path":f.FileName, "size":f.FileSize, "sha":fmt.Sprintf("%x", f.SHAHash), "parts":parts})
 }
 if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"version":m.Metadata.BuildVersion,"files":files,"chunks":chunks}); err != nil { panic(err) }
}
