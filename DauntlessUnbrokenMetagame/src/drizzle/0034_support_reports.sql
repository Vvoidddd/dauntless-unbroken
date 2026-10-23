CREATE TABLE `support_reports` (
 `id` text PRIMARY KEY NOT NULL,
 `created_at` integer NOT NULL,
 `account_id` text,
 `username` text,
 `claimed_name` text NOT NULL,
 `launcher` text NOT NULL,
 `summary` text NOT NULL,
 `reviewed_at` integer,
 `report` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_reports_created` ON `support_reports` (`created_at`);
