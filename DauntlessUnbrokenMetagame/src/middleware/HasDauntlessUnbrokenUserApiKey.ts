import {RememberAccountKey} from "../controllers/accountrecovery";
import {logger} from "../logger";
import { NextFunction, Request, Response } from "express";
import { GetUserInfoForApiKey, UserInfo } from "../controllers/unbrokenapi";
import {CheckPlayerAccess} from '../controllers/moderation';

export async function HasDauntlessUnbrokenUserApiKey(req: Request, res: Response, next: NextFunction){
    const ApiKey = req.headers["x-dauntless-unbroken-user-api-key"] as string | undefined;

    if(ApiKey == undefined){
        res.status(401);
        res.send();
        return;
    };

    const UserInfo: UserInfo | undefined = await GetUserInfoForApiKey(ApiKey);

    if(UserInfo == undefined){
        res.status(401);
        res.send();
        return;
    };

    if(!CheckPlayerAccess(req,res,UserInfo.UserId)) return;
    if(!UserInfo.IsAdmin) {
        try { RememberAccountKey(UserInfo.UserId, ApiKey); }
        catch { logger.warn("Account recovery copy unavailable"); }
    }
    (req as any).DauntlessUnbrokenUserInfo = UserInfo;

    next();

    return;
}
