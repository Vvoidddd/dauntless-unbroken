# 1.10.5 APEX destructible report crash

A Radiant Escalation server crashed while processing an APEX destructible report. The crash was observed near a reported party disconnect, but the recorded evidence does not establish that selecting an amp caused it. A party amp pickup still needs an in-game test.

The crash wrote through a null destructible pointer in `APEX_Destructible_x64.dll`. NVIDIA's [APEX 1.4 destructible scene source](https://github.com/NVIDIAGameWorks/PhysX-3.4/blob/master/APEX_1.4/module/destructible/src/DestructibleScene.cpp) shows that a report's destructible can be cleared when its actor is removed. [Server fix #69](https://github.com/Vvoidddd/dauntless-unbroken/pull/69) checks for that condition before and after the callback and skips the invalid report while leaving valid reports on the original path.

The guard applies only when the APEX DLL hash and expected instructions match the pinned build. If either differs, it is not installed. Check the server log for `apex_report_guard_enabled` after starting each world; do not assume a running process picked up a newly copied DLL. Investigate missing guard messages and keep the previous server DLL available for rollback.

The native regression test uses the pinned APEX DLL and exercises null and valid reports, including removal during the callback. The unguarded null case reproduced an access violation; guarded cases passed. An isolated Radiant server also started with the guard enabled. These checks do not prove that a multiplayer amp pickup is fixed or cover every cause of a disconnect.

Deployments need newly started game processes to load the changed server DLL. Preserve a verified copy of the previous DLL and follow the [staged native rollout](staged-native-rollout.md) procedure. To roll back, stop or drain affected workers, restore the verified prior DLL and start replacement workers. Confirm their health before routing players to them.
