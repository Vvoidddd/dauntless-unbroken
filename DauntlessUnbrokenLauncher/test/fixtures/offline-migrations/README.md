# Portable-save test schema

These migrations are a small synthetic schema used only by `offline-save.test.ts`. They exercise
schema validation, migration-prefix handling, rollback, and credential cleanup without importing the
private game-server database or its migration history. Do not use them to create or migrate a server
database.
