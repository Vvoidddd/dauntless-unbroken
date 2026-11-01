"""Copy a private read-only account export into a NEW local test DB, never live."""
import hashlib
import json
import pathlib
import secrets
import sqlite3

root = pathlib.Path(__file__).resolve().parents[3]
state = root / 'backend-state'
source = state / 'void-live-export.json'
raw = source.read_bytes()
digest = hashlib.sha256(raw).hexdigest()
assert digest == source.with_suffix('.sha256').read_text().strip(), 'Export checksum changed'
export = json.loads(raw)
assert export['format'] == 1 and export['source'] == 'live-1.4.4' and export['readOnly'] is True
tables = export['tables']
uid = export['userId']
assert len(tables['users']) == 1 and tables['users'][0]['userId'] == uid
assert tables['users'][0]['name'] == 'Void', 'Wrong account; not the requested Void player'
allowed = set('users characters userapikeys authepochs loadouts breadcrumbs encounteredcontent loadoutslots discordlinks huntregions bounties bountydraft cooldowns entitlements huntpassselection objectives progress_tracks escalationprogression escalationtalents escalationunlocks leaderboardprofiles inventories account_playtime'.split())
assert set(tables) == allowed
target = state / 'imported.db'
profile = state / 'imported-account.json'
assert not target.exists() and not profile.exists(), 'Existing local import preserved; do not overwrite test progress'
# SQLite backup makes a consistent copy even while the synthetic lab is running.
with sqlite3.connect(f'file:{state / "synthetic.db"}?mode=ro', uri=True) as original:
    with sqlite3.connect(target) as clone:
        original.backup(clone)
key = 'UUK-' + secrets.token_hex(32)
with sqlite3.connect(target) as db:
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert not db.execute('SELECT 1 FROM users WHERE userId=?', (uid,)).fetchone()
    for table, rows in tables.items():
        columns = {c[1] for c in db.execute(f'PRAGMA table_info("{table}")')}
        for row in rows:
            assert set(row) <= columns, f'Unsupported source columns in {table}'
            names = ','.join('"'+k+'"' for k in row)
            db.execute(f'INSERT INTO "{table}" ({names}) VALUES ({",".join("?" for _ in row)})', tuple(row.values()))
    # Verify byte-for-byte character and inventory preservation before any game saves.
    for row in tables['characters']:
        assert db.execute('SELECT data FROM characters WHERE characterId=?', (row['characterId'],)).fetchone()[0] == row['data']
    for row in tables['inventories']:
        assert db.execute('SELECT instancedItems,stackedItems FROM inventories WHERE characterId=?', (row['characterId'],)).fetchone() == (row['instancedItems'],row['stackedItems'])
    # This clone uses a disposable local key. The live hash remains in the private export.
    # Production migration must preserve userapikeys unchanged; this is test-only.
    db.execute('UPDATE userapikeys SET keyHash=? WHERE userId=?', (hashlib.sha256(key.encode()).hexdigest(),uid))
    db.commit()
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
profile.write_text(json.dumps({'UUK':key,'userId':uid,'name':'Void','sourceHash':digest}))
report = {'sourceHash':digest,'sourceExportedAt':export['exportedAt'], 'account':'Void',
    'copiedRows':{t:len(rows) for t,rows in tables.items()},
    'relationshipsArchivedOnly':{t:len(rows) for t,rows in export['relationships'].items()},
    'status':'compatibility-test-only', 'liveModified':False,
    'limitations':['Old quest-to-Slayer\'s Path mapping and item compatibility are not yet validated.',
                   'Relationships are retained in the export, not installed in the single-player lab.',
                   'Only the local clone uses a disposable key. The production credential is untouched.']}
(state/'import-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'imported':'Void','database':str(target),'copiedRows':report['copiedRows'],'integrity':'ok','liveModified':False}))
