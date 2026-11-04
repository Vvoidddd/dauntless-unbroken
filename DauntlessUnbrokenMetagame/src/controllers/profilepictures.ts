import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';
import jpeg from 'jpeg-js';
import {PNG} from 'pngjs';
import {GetDb} from '../db';
import {profilepicturesubmissions, users} from '../db/schema';
import {eq} from 'drizzle-orm';

const MAX_BYTES = 100 * 1024;
const MIN_DIMENSION = 32;
const MAX_DIMENSION = 512;
const MIME_EXT: Record<string, string> = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'};
type PictureStatus = 'pending' | 'approved' | 'rejected';

type ParsedImage = {bytes: Buffer, mimeType: keyof typeof MIME_EXT, width: number, height: number};

function StorageDir(): string {
    return process.env.PROFILE_PICTURE_DIR || path.join(path.dirname(process.env.DB_FILENAME || process.cwd()), 'profile-pictures');
}

function ParsePng(bytes: Buffer): {width: number, height: number} | null {
    if(bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from('\x89PNG\r\n\x1a\n', 'binary')) || bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
    return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

function ParseJpeg(bytes: Buffer): {width: number, height: number} | null {
    if(bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let offset = 2;
    while(offset + 9 < bytes.length){
        if(bytes[offset] !== 0xff){ offset++; continue; }
        const marker = bytes[offset + 1];
        offset += 2;
        if(marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
        if(offset + 2 > bytes.length) return null;
        const length = bytes.readUInt16BE(offset);
        if(length < 2 || offset + length > bytes.length) return null;
        const isFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
        if(isFrame && length >= 7) return {height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5)};
        offset += length;
    }
    return null;
}

function ParseWebp(bytes: Buffer): {width: number, height: number} | null {
    if(bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
    if(bytes.toString('ascii', 12, 16) !== 'VP8X') return null;
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return {width, height};
}

function ParseImage(input: unknown): ParsedImage {
    if(typeof input !== 'string' || !input.startsWith('data:')) throw Error('invalid_image');
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input);
    if(!match) throw Error('invalid_image');
    const mimeType = match[1] as keyof typeof MIME_EXT;
    const bytes = Buffer.from(match[2], 'base64');
    if(bytes.length === 0 || bytes.length > MAX_BYTES) throw Error('image_too_large');
    const dimensions = mimeType === 'image/png' ? ParsePng(bytes) : mimeType === 'image/jpeg' ? ParseJpeg(bytes) : ParseWebp(bytes);
    if(!dimensions || !Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height) || dimensions.width < MIN_DIMENSION || dimensions.height < MIN_DIMENSION || dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) throw Error('invalid_image_dimensions');
    return {bytes, mimeType, width: dimensions.width, height: dimensions.height};
}

type Prediction = {className: string, probability: number};
const NSFW_THRESHOLDS: Record<string, number> = {Porn: 0.2, Hentai: 0.2, Sexy: 0.6};
let nsfwModel: Promise<nsfwjs.NSFWJS> | null = null;

export function EvaluateNsfwPredictions(predictions: readonly Prediction[]) {
    const match = predictions.find(prediction => NSFW_THRESHOLDS[prediction.className] !== undefined && prediction.probability >= NSFW_THRESHOLDS[prediction.className]);
    return match ? {status: 'rejected' as const, reason: `automatically rejected: ${match.className.toLowerCase()} content`} : {status: 'approved' as const, reason: 'automatically approved by local image moderation'};
}

function ImageTensor(image: ParsedImage): tf.Tensor3D {
    let rgba: Uint8Array;
    let width = image.width;
    let height = image.height;
    if(image.mimeType === 'image/png') {
        const decoded = PNG.sync.read(image.bytes);
        rgba = decoded.data;
        width = decoded.width;
        height = decoded.height;
    } else if(image.mimeType === 'image/jpeg') {
        const decoded = jpeg.decode(image.bytes, {useTArray: true});
        rgba = decoded.data;
        width = decoded.width;
        height = decoded.height;
    } else {
        throw Error('unsupported_image_format');
    }
    return tf.tensor3d(rgba, [height, width, 4], 'int32').slice([0, 0, 0], [-1, -1, 3]);
}

function Row(id: string){
    return GetDb().$client.prepare('SELECT id,accountId,fileName,mimeType,width,height,bytes,status,reason,createdAt,reviewedAt,reviewerId FROM profilepicturesubmissions WHERE id=?').get(id) as any;
}

function PublicRow(accountId: string){
    return GetDb().$client.prepare("SELECT id,accountId,fileName,mimeType,width,height,bytes,status,reason,createdAt,reviewedAt,reviewerId FROM profilepicturesubmissions WHERE accountId=? AND status='approved' ORDER BY reviewedAt DESC,createdAt DESC LIMIT 1").get(accountId) as any;
}

export function GetApprovedProfilePicture(accountId: string): {filePath: string, mimeType: string, width: number, height: number, id: string} | null {
    const row = PublicRow(accountId);
    if(!row) return null;
    const filePath = path.join(StorageDir(), row.fileName);
    if(!fs.existsSync(filePath)) return null;
    return {filePath, mimeType: row.mimeType, width: row.width, height: row.height, id: row.id};
}

export function GetProfilePictureStatus(accountId: string){
    return GetDb().$client.prepare('SELECT id,accountId,mimeType,width,height,bytes,status,reason,createdAt,reviewedAt,reviewerId FROM profilepicturesubmissions WHERE accountId=? ORDER BY createdAt DESC LIMIT 1').get(accountId) as any ?? null;
}

async function AutomaticallyModerate(image: ParsedImage): Promise<{status: PictureStatus, reason: string}> {
    const mode = process.env.PROFILE_PICTURE_MODERATION || 'manual';
    if(mode === 'manual') return {status: 'pending', reason: 'awaiting moderator review'};
    if(mode !== 'nsfwjs') throw Error('moderation_unavailable');
    if(image.mimeType === 'image/webp') throw Error('unsupported_image_format');
    try {
        nsfwModel ??= nsfwjs.load('MobileNetV2Mid');
        const model = await nsfwModel;
        const tensor = ImageTensor(image);
        try {
            return EvaluateNsfwPredictions(await model.classify(tensor));
        } finally {
            tensor.dispose();
        }
    } catch(error) {
        if(error instanceof Error && error.message === 'unsupported_image_format') throw error;
        throw Error('moderation_unavailable');
    }
}

export async function SubmitProfilePicture(accountId: string, input: unknown){
    const image = ParseImage(input);
    if(!GetDb().select({userId: users.userId}).from(users).where(eq(users.userId, accountId)).get()) throw Error('account_not_found');
    const id = crypto.randomUUID();
    const fileName = `${id}.${MIME_EXT[image.mimeType]}`;
    const directory = StorageDir();
    fs.mkdirSync(directory, {recursive: true});
    const filePath = path.join(directory, fileName);
    fs.writeFileSync(filePath, image.bytes, {flag: 'wx'});
    try {
        const automatic = await AutomaticallyModerate(image);
        GetDb().insert(profilepicturesubmissions).values({
            id, accountId, fileName, mimeType: image.mimeType, width: image.width, height: image.height,
            bytes: image.bytes.length, status: automatic.status, reason: automatic.reason, createdAt: Date.now(),
            reviewedAt: automatic.status === 'pending' ? null : Date.now(), reviewerId: automatic.status === 'pending' ? null : 'automod'
        }).run();
    } catch(error){
        fs.rmSync(filePath, {force: true});
        throw error;
    }
    return Row(id);
}

export function ListProfilePictureModeration(status: PictureStatus | 'all' = 'pending', offset = 0){
    if(!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw Error('invalid_offset');
    const where = status === 'all' ? '' : ' WHERE status=?';
    const args = status === 'all' ? [offset] : [status, offset];
    const rows = GetDb().$client.prepare(`SELECT id,accountId,fileName,mimeType,width,height,bytes,status,reason,createdAt,reviewedAt,reviewerId FROM profilepicturesubmissions${where} ORDER BY createdAt DESC LIMIT 51 OFFSET ?`).all(...args) as any[];
    return {rows: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null};
}

function Review(id: string, status: PictureStatus, reviewerId: string, reason?: string){
    const row = Row(id);
    if(!row) throw Error('not_found');
    if(row.status !== 'approved' && row.status !== 'pending') throw Error('already_reviewed');
    const now = Date.now();
    const db = GetDb().$client;
    db.transaction(() => {
        if(status === 'approved') db.prepare("UPDATE profilepicturesubmissions SET status='rejected',reason='replaced by newer approved image',reviewedAt=?,reviewerId=? WHERE accountId=? AND status='approved' AND id<>?").run(now, reviewerId, row.accountId, id);
        db.prepare('UPDATE profilepicturesubmissions SET status=?,reason=?,reviewedAt=?,reviewerId=? WHERE id=?').run(status, reason?.trim() || null, now, reviewerId, id);
    })();
    return Row(id);
}

export function ApproveProfilePicture(id: string, reviewerId: string){ return Review(id, 'approved', reviewerId, 'approved by moderator'); }
export function RejectProfilePicture(id: string, reviewerId: string, reason: string){ return Review(id, 'rejected', reviewerId, reason); }
export function RemoveProfilePicture(id: string, reviewerId: string, reason: string){
    const row = Row(id);
    if(!row || (row.status !== 'approved' && row.status !== 'pending')) throw Error(!row ? 'not_found' : 'already_reviewed');
    const now = Date.now();
    GetDb().$client.prepare("UPDATE profilepicturesubmissions SET status='rejected',reason=?,reviewedAt=?,reviewerId=? WHERE id=?").run(reason.trim() || 'removed by moderator', now, reviewerId, id);
    return Row(id);
}

export function ProfilePictureFile(id: string){
    const row = Row(id);
    if(!row || row.status !== 'approved') return null;
    const filePath = path.join(StorageDir(), row.fileName);
    return fs.existsSync(filePath) ? {filePath, mimeType: row.mimeType, width: row.width, height: row.height} : null;
}

export function ModerationProfilePictureFile(id: string){
    const row = Row(id);
    if(!row || (row.status !== 'pending' && row.status !== 'approved')) return null;
    const filePath = path.join(StorageDir(), row.fileName);
    return fs.existsSync(filePath) ? {filePath, mimeType: row.mimeType, width: row.width, height: row.height} : null;
}
