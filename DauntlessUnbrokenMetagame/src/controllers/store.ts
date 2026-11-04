import { eq } from "drizzle-orm";
import { GetDb } from "../db";
import { inventory, users } from "../db/schema";
import { GetActiveCharacter } from "./activecharacter";
import { MAX_STACK_QUANTITY } from "./inventory";

export async function GetNotesForUser(userId: string){
    let UserFromDb = await GetDb().query.users.findFirst({where: eq(users.userId, userId)});

    return UserFromDb!.notes;
}

// The currencies the account's active character holds as inventory stacks (catalog id CURRENCY_*), with
// the character's id; an empty map for an account without a character or inventory. Balances from the
// inventory are Harmonic's idea (github.com/Harmonicrain/Undaunted 895f7c7), read here without a wallet.
export function GetHeldCurrencies(AccountId: string){
    return GetDb().transaction((tx) => {
        const Character = GetActiveCharacter(tx, AccountId);
        const Held = new Map<string, number>();

        if(Character == undefined){
            return {CharacterId: undefined, Held};
        }

        const Row = tx.select({stackedItems: inventory.stackedItems}).from(inventory).where(eq(inventory.characterId, Character.characterId)).get();

        let Stacks: unknown;
        try{
            Stacks = JSON.parse(Row?.stackedItems ?? "[]");
        }
        catch{
            return {CharacterId: Character.characterId, Held};
        }

        if(!Array.isArray(Stacks)){
            return {CharacterId: Character.characterId, Held};
        }

        for(const Stack of Stacks){
            const Quantity = typeof (Stack as any)?.quantity === "string" && /^\d+$/.test((Stack as any).quantity)
                ? Number((Stack as any).quantity)
                : (Stack as any)?.quantity;

            if(typeof (Stack as any)?.catalogId === "string" && (Stack as any).catalogId.startsWith("CURRENCY_")
                && Number.isSafeInteger(Quantity) && Quantity >= 0 && Quantity <= MAX_STACK_QUANTITY){
                const Total = (Held.get((Stack as any).catalogId) ?? 0) + Quantity;
                if(Number.isSafeInteger(Total) && Total <= MAX_STACK_QUANTITY){
                    Held.set((Stack as any).catalogId, Total);
                }
            }
        }

        return {CharacterId: Character.characterId, Held};
    });
}

// BALANCE_FROM_INVENTORY (roadmap 2.17): every key of a balance sheet that names a currency the character
// holds gets the held quantity. CURRENCY_X is the stack CURRENCY_X, and id_currency_x is the same stack
// (CURRENCY_NOTES is the Rams, settled in play). A currency the character does not hold keeps the sheet's
// value. Returns the keys it changed.
export function OverlayHeldCurrencies(Sheet: Record<string, unknown>, Held: Map<string, number>){
    const Changed: string[] = [];

    for(const Key of Object.keys(Sheet)){
        const CatalogId = Key.startsWith("CURRENCY_") ? Key : Key.startsWith("id_currency_") ? `CURRENCY_${Key.slice("id_currency_".length).toUpperCase()}` : undefined;

        if(CatalogId !== undefined && Held.has(CatalogId)){
            Sheet[Key] = Held.get(CatalogId);
            Changed.push(Key);
        }
    }

    return Changed;
}
