CREATE TABLE slayerlinkstate (
 linkId text PRIMARY KEY NOT NULL,
 progress integer NOT NULL DEFAULT 0,
 canceledAt integer,
 senderReleasedAt integer,
 targetReleasedAt integer,
 senderConfirmedRank integer NOT NULL DEFAULT 0,
 targetConfirmedRank integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE slayerlinkpools (
 linkId text NOT NULL,
 userId text NOT NULL,
 pool text NOT NULL,
 poolHash text NOT NULL,
 createdAt integer NOT NULL,
 servedAt integer,
 claimTransactionId text,
 claimCharacterId text,
 claimedRewards text,
 claimedAt integer,
 PRIMARY KEY(linkId,userId)
);
--> statement-breakpoint
CREATE INDEX slayerlinkpools_user ON slayerlinkpools(userId);
--> statement-breakpoint
CREATE TABLE slayerlinkxp (
 eventId text NOT NULL,
 linkId text NOT NULL,
 sourceUserId text NOT NULL,
 amount integer NOT NULL,
 createdAt integer NOT NULL,
 PRIMARY KEY(eventId,linkId)
);
