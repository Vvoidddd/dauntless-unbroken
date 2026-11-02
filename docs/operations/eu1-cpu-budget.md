# EU1 shared CPU budget

`5.83.134.32` uses one Windows job with a **60% hard CPU cap** for its
Dauntless deploy process and all game worlds combined. ARK and the other
Dauntless backend services are outside this job; total host CPU can exceed 60%.
This limits CPU time, not RAM, disk or network use. Under load, hunts can run
slower when they exhaust the shared budget.

The SYSTEM startup task `Dauntless Unbroken CPU budget` runs:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\DauntlessUnbroken\bin\Run-GameCpuBudget.ps1 -Root C:\DauntlessUnbroken -Percent 60 -Name Global\DauntlessUnbrokenEU1Cpu -QueueAtBudget
```

The watcher attaches the deployment process first so new worlds inherit the
budget, then attaches already-running worlds without restarting them. It checks
every five seconds to cover deployment restarts. Scripts in `bin` must remain
writable only by Administrators and SYSTEM. Status is written to
`data/run/cpu-budget.json`; verify its timestamp as well as the task state.

With `-QueueAtBudget`, the watcher measures the named job's cumulative CPU time,
including processes that exited between samples. At 95% of the allowance (57%
of machine CPU), it pauses new hunts using the allocator's existing `drain.flag`.
It resumes below 85% of the allowance (51%). It only clears its own flag; manual
maintenance drains remain in place. The existing queue handles waiting players.
Already-running worlds are not stopped. `UsagePercent` and `AdmissionPaused`
are included in the status file after the second sample.

The existing `GAMESERVER_CPU_LIMIT_PERCENT` guard measures whole-host load and
still applies. It cannot substitute for job usage: ARK can raise host CPU while
Dauntless has spare allowance, or the 60% cap can saturate before an 80% host guard.
Deploy `CpuBudgetAdmission.ps1` alongside the watcher. Run
`Test-CpuBudgetAdmission.ps1` to check thresholds and manual-drain preservation.

Run `deploy/windows-server/Test-ProcessCpuBudget.ps1` with Windows PowerShell
to check attachment, inheritance and exclusion using temporary sleeping processes.
Stopping the watcher does not remove the cap from processes already assigned;
to lift it, stop/disable the task and apply the same named job at `-Percent 100`
to the current deploy/game PIDs. No kill-on-close flag is used.
