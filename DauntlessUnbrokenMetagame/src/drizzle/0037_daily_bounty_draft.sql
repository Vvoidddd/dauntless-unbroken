CREATE TABLE `challengedrafts` (
    `accountId` text NOT NULL,
    `kind` text NOT NULL,
    `data` text NOT NULL,
    `updatedDate` text NOT NULL,
    PRIMARY KEY (`accountId`, `kind`)
);
