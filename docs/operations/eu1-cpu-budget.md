# EU1 shared CPU budget

`5.83.134.32` uses one Windows job with a **60% hard CPU cap** for its
Dauntless deploy process and all game worlds combined. ARK and the other
Dauntless backend services are outside this job; total host CPU can exceed 60%.
This limits CPU time, not RAM, disk or network use. Under load, hunts can run
slower when they exhaust the shared budget.

The SYSTEM startup task `Dauntless Unbroken CPU budget` runs:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\DauntlessUnbroken\bin\Run-GameCpuBudget.ps1 -Root C:\DauntlessUnbroken -Percent 60 -Name Global\DauntlessUnbrokenEU1Cpu
```

The watcher attaches the deployment process first so new worlds inherit the
budget, then attaches already-running worlds without restarting them. It checks
every five seconds to cover deployment restarts. Scripts in `bin` must remain
writable only by Administrators and SYSTEM. Status is written to
`data/run/cpu-budget.json`; verify its timestamp as well as the task state.

The existing `GAMESERVER_CPU_LIMIT_PERCENT` admission setting only controls new
launches and is **not** a hard cap. EU2's settings are unchanged.

Run `deploy/windows-server/Test-ProcessCpuBudget.ps1` with Windows PowerShell
to check attachment, inheritance and exclusion using temporary sleeping processes.
Stopping the watcher does not remove the cap from processes already assigned;
to lift it, stop/disable the task and apply the same named job at `-Percent 100`
to the current deploy/game PIDs. No kill-on-close flag is used.
