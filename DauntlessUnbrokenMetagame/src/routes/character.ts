import { Router } from "express";
import { logger } from "../logger";
import { HasDauntlessUnbrokenMetagameAuth } from "../middleware/HasDauntlessUnbrokenMetagameAuth";
import { CharacterCreationError, CreateCharacterForUid, GetCharactersForUid, GetCharacterWithUid, UpdateCharacterForUid } from "../controllers/character";
import { PlayerMutationRateLimit } from '../middleware/RateLimits';

export const characterRouter = Router();

characterRouter.get("/character", HasDauntlessUnbrokenMetagameAuth, async (req: any, res) => {
    const UserId = req.AuthData.userId;

    const CharactersForUid = await GetCharactersForUid(UserId);

    logger.info(`Retrieved ${CharactersForUid.length} characters for ${UserId}`);

    res.status(200);
    res.json(CharactersForUid);
});

characterRouter.put("/character", HasDauntlessUnbrokenMetagameAuth, PlayerMutationRateLimit, async (req: any, res) => {
    try {
        res.status(200).json(await CreateCharacterForUid(req.AuthData.userId, req.body?.name));
    } catch (error) {
        if (!(error instanceof CharacterCreationError)) throw error;
        res.status(error.message === 'character_limit_reached' ? 409 : 400).json({error: error.message});
    }
})

// The client sends a JSON number; a numeric string compared and stored the same way before, so keep accepting it
function ParseUpdateVersion(Value: unknown){
    const Version = typeof Value === "string" && /^\d+$/.test(Value) ? Number(Value) : Value;

    return Number.isSafeInteger(Version) && (Version as number) >= 0 ? Version as number : undefined;
}

characterRouter.post("/character", HasDauntlessUnbrokenMetagameAuth, PlayerMutationRateLimit, async (req: any, res) => {
    const CharacterIdToUpdate = req.body.characterId;
    const UserId = req.AuthData.userId;
    const DataToUpdateWith = req.body.data;
    const UpdateVersion = ParseUpdateVersion(req.body.updateVersion);

    logger.info(`Updating characterId ${CharacterIdToUpdate} for userId ${UserId} with updateVersion ${req.body.updateVersion}`);

    if(UpdateVersion == undefined){
        logger.warn(`Refusing update of characterId ${CharacterIdToUpdate} for userId ${UserId}: updateVersion ${JSON.stringify(req.body.updateVersion)} is not a version number`);

        res.status(400);
        res.send();
        return;
    }

    const Result = UpdateCharacterForUid(CharacterIdToUpdate, UserId, DataToUpdateWith, UpdateVersion, req.AuthData.IsGameserver ? "save:gameserver" : "save:client");

    if(!Result.success){
        if(Result.error === "not_found"){
            logger.warn(`Failed to update characterId ${CharacterIdToUpdate} for userId ${UserId}: no such character for this user`);

            res.status(404);
            res.send();
            return;
        }

        if(Result.error === "invalid_data"){
            res.status(400);
            res.send();
            return;
        }

        logger.warn(`Failed to update characterId ${CharacterIdToUpdate} for userId ${UserId} due to conflict (stored updateVersion ${Result.storedVersion}, incoming ${UpdateVersion})`);

        res.status(409);
        res.send();
        return;
    }

    const UpdatedCharacter = await GetCharacterWithUid(CharacterIdToUpdate, UserId);

    res.status(200);
    res.json(UpdatedCharacter);
});
