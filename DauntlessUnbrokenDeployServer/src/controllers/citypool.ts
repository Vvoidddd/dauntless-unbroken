import {CapacityUnavailable, PriorityReservedCitySeats} from './capacity';

export const CITY_PLAYER_LIMIT = 20;
// Let cached health replies (5 s), their in-flight request (3 s), and a full
// 180 s traveller lease expire before stopping a retired endpoint.
export const CITY_RETIRE_GRACE_MS = 190000;
// RAMSGATE_CITY_CAPS="10,10,8": at most that many cities, filled in the order they started (the oldest first),
// each admitting up to its own cap. Unset keeps the default: cities of CITY_PLAYER_LIMIT, started on demand.
export function CityCaps(): number[] | undefined {
    const raw = process.env.RAMSGATE_CITY_CAPS;
    if (raw === undefined || raw.trim() === '') return undefined;
    const caps = raw.split(',').map(v => Number(v.trim()));
    if (!caps.every(n => Number.isInteger(n) && n >= 1 && n <= CITY_PLAYER_LIMIT)) throw new Error('Invalid RAMSGATE_CITY_CAPS');
    return caps;
}
export type City = {id: string, players: number | undefined, startedAt: number};
// Serialize allocation through readiness so concurrent requests share a cold start.
export class CityPool<T extends {id:string}> {
    private lastPlayers = new Map<string, number>();
    private queue: Promise<unknown> = Promise.resolve();
    private reservations = new Map<string, {size:number, until:number}[]>();
    private retiring = new Map<string, number>();
    constructor(private list: () => City[], private start: () => Promise<T>, private get: (id:string) => T,
        private now = () => Date.now(), private caps: () => number[] | undefined = CityCaps) {}
    allocate(size = 1, priority = false): Promise<T> {
        if (!Number.isInteger(size) || size < 1 || size > CITY_PLAYER_LIMIT) return Promise.reject(new CapacityUnavailable('hunts'));
        const work = this.queue.catch(() => {}).then(async () => {
            const cities = this.list().slice().sort((a, b) => a.startedAt - b.startedAt);
            const caps = this.caps();
            // Keep seats in the oldest city for priority accounts; other cities retain their full cap.
            const limitAt = (index: number) => {
                const cap = caps ? (caps[index] ?? 0) : CITY_PLAYER_LIMIT;
                return !priority && index === 0 ? Math.max(0, cap - Math.min(PriorityReservedCitySeats(), Math.max(0, cap - 1))) : cap;
            };
            let slot = 0;
            this.reconcile(cities);
            let chosen: T | undefined;
            for (const city of cities) {
                const limit = limitAt(slot++);
                if (this.isRetiring(city.id)) continue;
                const leases = this.reservations.get(city.id) ?? [];
                // Missing telemetry is not proof of free seats. For a fresh launch, all
                // admissions are still reserved; otherwise leave an unknown city alone.
                const occupied = city.players ?? (this.now() - city.startedAt < 180000 && leases.length > 0 ? 0 : CITY_PLAYER_LIMIT);
                if (occupied + leases.reduce((n,r) => n+r.size, 0) + size <= limit) {
                    chosen = this.get(city.id);
                    break;
                }
            }
            // Reopen a confirmed-empty city if every active city is full. Do not
            // strand arrivals behind the retirement grace or start a needless copy.
            if (!chosen) for (const [index, city] of cities.entries()) {
                if (this.isRetiring(city.id) && city.players === 0 && size <= limitAt(index)) {
                    this.retiring.delete(city.id);
                    chosen = this.get(city.id);
                    break;
                }
            }
            // Cold starts must obey the next city's cap too, not just existing cities.
            if (!chosen && ((caps && slot >= caps.length) || size > limitAt(slot))) throw new CapacityUnavailable('hunts');
            chosen ??= await this.start();
            const leases = this.reservations.get(chosen.id) ?? [];
            leases.push({size, until:this.now() + 180000});
            this.reservations.set(chosen.id, leases);
            return chosen;
        });
        this.queue = work;
        return work;
    }
    private reconcile(cities: City[]) {
        for (const map of [this.reservations, this.lastPlayers, this.retiring])
            for (const id of map.keys()) if (!cities.some(c => c.id === id)) map.delete(id);
        for (const city of cities) {
            const leases = (this.reservations.get(city.id) ?? []).filter(r => r.until > this.now());
            if (city.players !== undefined) {
                let arrivals = Math.max(0, city.players - (this.lastPlayers.get(city.id) ?? 0));
                for (const lease of leases) {
                    const consumed = Math.min(arrivals, lease.size);
                    lease.size -= consumed;
                    arrivals -= consumed;
                }
                this.lastPlayers.set(city.id, city.players);
            }
            this.reservations.set(city.id, leases.filter(r => r.size > 0));
        }
    }
    isRetiring(id: string) { return this.retiring.has(id); }
    reap(stop: (city:T) => boolean): Promise<void> {
        const work = this.queue.catch(() => {}).then(() => {
            const cities = this.list();
            this.reconcile(cities);
            for (const city of cities) {
                if ((city.players ?? 0) > 0 || this.reservations.get(city.id)?.length) {
                    this.retiring.delete(city.id);
                } else if (city.players === undefined || !this.retiring.has(city.id)) {
                    // Unknown telemetry cannot prove an uninterrupted empty interval.
                    if (city.players === 0 || this.retiring.has(city.id)) this.retiring.set(city.id, this.now());
                } else if (this.now() - this.retiring.get(city.id)! >= CITY_RETIRE_GRACE_MS) {
                    if (!stop(this.get(city.id))) this.retiring.set(city.id, this.now());
                }
            }
        });
        this.queue = work;
        return work;
    }
    reset() { this.queue = Promise.resolve(); this.reservations.clear(); this.lastPlayers.clear(); this.retiring.clear(); }
}
