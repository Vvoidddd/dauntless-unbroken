# Fleet watchdog

The allocator checks its owned game processes every 15 seconds. Native hunt servers
also exit after two minutes without pending or open connections.

`deploy/windows-server/Install-FleetWatchdog.ps1 -Root C:\DauntlessUnbroken`
adds an independent Windows task. Use `-StorageOnly` on the UK key bot host.
It recovers stopped, enabled service tasks and checks local temporary hunts every
15 seconds. It respects `data/run/stopped.flag` and disabled tasks.

The fallback requires two minutes of fresh zero-connection observations. Before
terminating an instance it checks its session, local UDP port, executable and process
creation time again. Relayed worker instances, Ramsgate, Training Grounds, occupied
hunts and unknown/stale observations are excluded. Instance age on a hunt card is
not the duration it has been empty. PID and port reuse start a new observation interval.

The task runs protected code as SYSTEM and stores aggregate health in
`watchdog/health.json`. It does not restart a running allocator or interrupt active
hunts to recover a monitoring failure. Existing component supervisors handle
individual component crashes with restart backoff.

The Discord status worker edits one persisted message every 15 seconds, showing
the two EU hosts and the UK key bot/storage role. It reports CPU, RAM, hunt capacity,
backend checks, watchdog freshness, service-task states and the last verified DB
copy. Missing/stale data is unknown. Keep its webhook URL in the private
`data/keys/discord-status.key` file; never commit it. `Install-DiscordStatus.ps1`
installs that worker without restarting game services.
