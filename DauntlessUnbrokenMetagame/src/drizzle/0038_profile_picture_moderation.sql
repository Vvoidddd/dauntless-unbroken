CREATE TABLE `profilepicturesubmissions` (
 `id` text PRIMARY KEY NOT NULL,
 `accountId` text NOT NULL,
 `fileName` text NOT NULL,
 `mimeType` text NOT NULL,
 `width` integer NOT NULL,
 `height` integer NOT NULL,
 `bytes` integer NOT NULL,
 `status` text NOT NULL,
 `reason` text,
 `createdAt` integer NOT NULL,
 `reviewedAt` integer,
 `reviewerId` text
);
--> statement-breakpoint
CREATE INDEX `profilepicturesubmissions_account` ON `profilepicturesubmissions` (`accountId`);
--> statement-breakpoint
CREATE INDEX `profilepicturesubmissions_queue` ON `profilepicturesubmissions` (`status`,`createdAt`);
