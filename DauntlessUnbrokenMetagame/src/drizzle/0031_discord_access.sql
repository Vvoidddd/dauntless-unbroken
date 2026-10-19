CREATE TABLE `discord_invites` (
    `discordId` text PRIMARY KEY NOT NULL,
    `inviteCode` text NOT NULL UNIQUE,
    `createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discord_moderation` (
    `discordId` text PRIMARY KEY NOT NULL,
    `guildId` text NOT NULL,
    `active` integer NOT NULL,
    `reason` text NOT NULL,
    `actor` text NOT NULL,
    `revision` integer NOT NULL,
    `updatedAt` integer NOT NULL,
    `syncStatus` text NOT NULL,
    `syncError` text
);
--> statement-breakpoint
CREATE TABLE `account_access_events` (
    `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    `accountId` text,
    `discordId` text,
    `action` text NOT NULL,
    `reason` text NOT NULL,
    `actor` text NOT NULL,
    `createdAt` integer NOT NULL
);
