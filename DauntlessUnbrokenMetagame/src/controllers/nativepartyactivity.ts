import { IsAccountIdShape } from './login';
import { TouchPlayer } from './party';

let Reports=0, ConnectedTouches=0, LastReportAt: number | null=null;
// Called only with complete connection snapshots after native authentication and session checks.
export function TouchConnectedPartyPlayers(Ids: string[]){
    Reports++; LastReportAt=Date.now();
    for(const Id of Ids.filter(IsAccountIdShape)){ TouchPlayer(Id); ConnectedTouches++; }
}
// Count-only diagnostics in the private checkpoint distinguish a working feed from missing telemetry.
export function NativePartyActivitySummary(){ return {reports:Reports,connectedTouches:ConnectedTouches,lastReportAt:LastReportAt}; }
