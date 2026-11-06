CREATE TABLE users (userId TEXT PRIMARY KEY, name TEXT NOT NULL, notes INTEGER NOT NULL DEFAULT 0, isAdmin INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE userapikeys (userId TEXT NOT NULL, keyHash TEXT NOT NULL UNIQUE);
--> statement-breakpoint
CREATE TABLE characters (characterId TEXT PRIMARY KEY, userId TEXT, createdDate TEXT, lastModifiedDate TEXT, name TEXT, updateVersion INTEGER, data TEXT);
--> statement-breakpoint
CREATE TABLE inventories (characterId TEXT PRIMARY KEY, instancedItems TEXT, stackedItems TEXT);
--> statement-breakpoint
CREATE TABLE loadouts (characterId TEXT, userId TEXT, loadouts TEXT, persistent TEXT);
--> statement-breakpoint
CREATE TABLE userapikeystoregister (userId TEXT, key TEXT);
--> statement-breakpoint
CREATE TABLE gameserverapikeystoregister (key TEXT);
--> statement-breakpoint
CREATE TABLE gameserverapikeys (keyHash TEXT);
--> statement-breakpoint
CREATE TABLE accountkeyrecovery (userId TEXT, keyHash TEXT, ciphertext TEXT);
--> statement-breakpoint
CREATE TABLE recoveryproofs (discordId TEXT, userId TEXT, keyHash TEXT);
--> statement-breakpoint
CREATE TABLE recoverychallenges (tokenHash TEXT, discordId TEXT, userId TEXT, keyHash TEXT, expiresAt INTEGER, used INTEGER);
--> statement-breakpoint
CREATE TABLE recoveryevents (id INTEGER PRIMARY KEY, discordId TEXT, action TEXT, createdAt INTEGER);
--> statement-breakpoint
CREATE TABLE authepochs (userId TEXT PRIMARY KEY, epoch INTEGER NOT NULL);
