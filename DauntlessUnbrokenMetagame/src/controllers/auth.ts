import {AuthEpoch} from "./keyrotation";
import jwt, {JwtPayload} from "jsonwebtoken";
import crypto from "crypto";
import { GetDb } from "../db";
import { userapikeys, userapikeystoregister } from "../db/schema";
import { logger } from "../logger";
import {BanFor} from './moderation';

const PRIVKEY = Buffer.from(process.env.AUTH_SIGNING_PRIVKEY_B64!, "base64").toString("utf-8");
const PUBKEY = Buffer.from(process.env.AUTH_SIGNING_PUBKEY_B64!, "base64").toString("utf-8");

export function HashUserAPIKey(UserAPIKeyToHash: string){
    return crypto.createHash("sha256").update(UserAPIKeyToHash, "utf8").digest("hex");
}

export async function DrainAndRegisterUserAPIKeys(){
    const APIKeysToRegister = await GetDb().query.userapikeystoregister.findMany();

    await GetDb().delete(userapikeystoregister);

    for(const APIKey of APIKeysToRegister){
        await GetDb().insert(userapikeys).values({
            userId: APIKey.userId,
            keyHash: HashUserAPIKey(APIKey.key)
        });
    }

    logger.info(`Registered ${APIKeysToRegister.length} new User API Key(s) on boot!`);
}

export async function GetUserIDForAPIKey(UserAPIKey: unknown){
    if(typeof UserAPIKey !== "string" || UserAPIKey.length === 0){
        return undefined;
    }

    const AllAPIKeyHashes = await GetDb().query.userapikeys.findMany();

    const IncomingUserAPIKeyHashBuffer = Buffer.from(HashUserAPIKey(UserAPIKey), "hex");

    let UserId: string | undefined = undefined;

    for(const CmpAPIKeyHash of AllAPIKeyHashes){
        const CmpAPIKeyHashBuffer = Buffer.from(CmpAPIKeyHash.keyHash!, "hex");

        if(CmpAPIKeyHashBuffer.length !== IncomingUserAPIKeyHashBuffer.length){
            continue;
        }

        if(crypto.timingSafeEqual(IncomingUserAPIKeyHashBuffer, CmpAPIKeyHashBuffer)){
            UserId = CmpAPIKeyHash.userId;
        }
    }

    return UserId;
}

function SignMetagameJWTForUid(userId: string){
    const ban=BanFor(userId);
    if(ban) throw Object.assign(Error('account_banned'),{reason:ban.reason});
    return jwt.sign({
        userId: userId,
        epoch: AuthEpoch(userId)
    }, PRIVKEY, {
        algorithm: "RS256",
        expiresIn: "24h",
        issuer: "dauntless-unbroken-metagame",
        audience: "dauntless-unbroken-metagame"
    });
}

function ValidateMetagameJWTAndGetPayload(token: string){
    const payload = jwt.verify(token, PUBKEY, {
        algorithms: ["RS256"],
        issuer: "dauntless-unbroken-metagame",
        audience: "dauntless-unbroken-metagame"
    });
    if(typeof payload === 'string' || typeof payload.userId !== 'string' || (payload.epoch ?? 0)!==AuthEpoch(payload.userId)) throw Error('session_revoked');
    const ban=BanFor(payload.userId);
    if(ban) throw Object.assign(Error('account_banned'),{reason:ban.reason});
    return payload;
}

export function AccessFailure(error:unknown):{status:number,body:{error:string,reason?:string}}|undefined {
    if(error instanceof Error && error.message==='account_banned' && typeof (error as any).reason==='string')return {status:403,body:{error:'account_banned',reason:(error as any).reason}};
    if(error instanceof Error && error.message==='session_revoked')return {status:401,body:{error:'session_revoked'}};
    return undefined;
}

export { SignMetagameJWTForUid, ValidateMetagameJWTAndGetPayload }
