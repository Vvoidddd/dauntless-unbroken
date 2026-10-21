CREATE INDEX `inventorylog_user_operation_id` ON `inventorylog` (`userId`,`operation`,`id`);
--> statement-breakpoint
CREATE INDEX `inventorylog_user_character_transaction` ON `inventorylog` (`userId`,`characterId`,`transactionId`);
