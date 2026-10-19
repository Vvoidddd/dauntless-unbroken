import { Router } from "express";
import { PlayerMutationRateLimit } from "../middleware/RateLimits";
import { HasDauntlessUnbrokenMetagameAuth } from "../middleware/HasDauntlessUnbrokenMetagameAuth";
import { logger } from "../logger";
import { GetInventoryForUserIdAndCharacterId, InventoryError, RunInventoryTransaction, UpdateInstancedItem } from "../controllers/inventory";
import { EnforceKnownUnlockerMutation } from "../controllers/unlocker-detection";

export const inventoryRouter = Router();

function StatusForInventoryError(Error: InventoryError){
    switch(Error){
        case "forbidden":
            return 403;
        case "not_found":
            return 404;
        case "conflict":
        case "insufficient_quantity":
            return 409;
        case "invalid_inventory_item":
            return 400;
        case "invalid_inventory_data":
        case "db_error":
            return 500;
    }
}

inventoryRouter.post("/inventory/:characterId/:changeList", HasDauntlessUnbrokenMetagameAuth, (req: any, res) => {
    logger.info("Inventory migration (stubbed)");

    res.status(200);
    res.json({
        code: null,
        message: ""
    });
});

inventoryRouter.get("/inventory/:userId/:characterId", HasDauntlessUnbrokenMetagameAuth, async (req: any, res) => {
    const UserId = req.AuthData.IsGameserver ? req.params.userId : req.AuthData.userId;
    
    req.AuthData.userId;
    const CharacterId = req.params.characterId;

    logger.info(`UserId ${UserId} requested inventory for CharacterId ${CharacterId}`);

    const InventoryResult = await GetInventoryForUserIdAndCharacterId(UserId, CharacterId);

    if(InventoryResult.success){
        res.status(200);
        res.json(InventoryResult.data);
    }
    else{
        res.status(StatusForInventoryError(InventoryResult.error));
        res.send();
    }
});

inventoryRouter.post("/inventory", HasDauntlessUnbrokenMetagameAuth, PlayerMutationRateLimit, async (req: any, res) => {
    try {
        const detection = EnforceKnownUnlockerMutation(req.AuthData, req.body);
        if (detection.blocked) {
            res.status(403).json({error: detection.suspended ? "account_banned" : "forbidden"});
            return;
        }
    } catch {
        logger.error("Unlocker enforcement failed; inventory mutation refused");
        res.status(503).json({error: "inventory_unavailable"});
        return;
    }
    const UserId = req.AuthData.IsGameserver ? req.body.accountId : req.AuthData.userId;
    const CharacterId = req.body.characterId;
    const TransactionId = req.body.transactionId;
    const InstancedItemsToAdd = req.body.addInstancedItems;
    const StackedItemsToAdd = req.body.addStackedItems;
    const InstancedItemsToRemove = req.body.removeInstancedItems;
    const StackedItemsToRemove = req.body.removeStackedItems;
    const InstancedItemsToSave = req.body.saveInstancedItems;

    const TransactionResult = await RunInventoryTransaction(UserId, CharacterId, TransactionId, InstancedItemsToAdd, StackedItemsToAdd, InstancedItemsToRemove, StackedItemsToRemove, InstancedItemsToSave, {
        Caller: req.AuthData.IsGameserver ? "gameserver" : "client",
        Source: req.body.source
    });

    if(TransactionResult.success){
        if(TransactionResult.data!.replayed){
            logger.warn(`Replayed the stored result of transactionId ${TransactionId} for userId ${UserId} and characterId ${CharacterId}; the retry changed nothing`);
        }
        else{
            logger.info(`Ran transactionId ${TransactionId} for userId ${UserId} and characterId ${CharacterId}`);
        }

        res.status(200);
        res.json(TransactionResult.data!.response);

        return;
    }
    else{
        logger.error(`transactionId ${TransactionId} for userId ${UserId} and characterId ${CharacterId} FAILED! (${TransactionResult.error}, answered ${StatusForInventoryError(TransactionResult.error)})`);

        res.status(StatusForInventoryError(TransactionResult.error));
        res.send();
        return;
    }
});

inventoryRouter.post("/inventory/instanceditem", HasDauntlessUnbrokenMetagameAuth, PlayerMutationRateLimit, async (req: any, res) => {
    const CharacterId = req.body.characterId;
    const UserId = req.AuthData.IsGameserver ? req.body.accountId : req.AuthData.userId;
    const InstanceId = req.body.instanceId;
    const CatalogId = req.body.catalogId;
    const ItemData = req.body.itemData;
    const UpdateVersion = req.body.updateVersion;

    const ItemResult = await UpdateInstancedItem(CharacterId, UserId, InstanceId, CatalogId, ItemData, UpdateVersion, {
        Caller: req.AuthData.IsGameserver ? "gameserver" : "client"
    });

    if(ItemResult.success){
        res.status(200);
        res.json(ItemResult.data);
    }
    else{
        res.status(StatusForInventoryError(ItemResult.error));
        res.send();
    }
});
