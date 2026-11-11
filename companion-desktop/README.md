# ChoreZap Desktop 0.3.1 — family controls pilot

The installable, per-account Windows app records foreground usage, receives short family game policies, and can close only a currently foreground classified game after a saved 30-second warning when close mode is selected. Family game permission expires locally and remains denied after a restart until a fresh policy is accepted. School and browser apps remain exempt. This is a cooperative app, not a protected service, native content filter, or session lock.

The per-user installer copies the stable launcher and public server bootstrap into LocalAppData, enables HKCU startup, and creates a Start Menu shortcut. A signed updater stages verified workers. The 0.3.0 launcher can also respond to parent maintenance commands: bounded diagnostics, a signed update check, a labelled 10-second countdown demo, and a controlled apply-update request. Apply-update waits for a recent policy and checks same-user classified game processes, including minimized games; it defers if a game or inaccessible process may be running. The launcher starts the pinned signed build, checks startup health, and rolls back a failed startup. A command acknowledgement reports a restart request; only a later version heartbeat confirms that the new build ran.

A countdown result of `requested` is only a durable receipt, not proof that the overlay appeared. A crash after the receipt is saved can skip the display; the parent can send a new test command. Only the native window's visibility signal reports `displayed`.

An older stable launcher needs this package installed once to gain remote activation. The initial installer stops the current app and can lose the last few seconds of unsaved usage. Native Windows installation, process inventory, overlay visibility, remote activation, and rollback still require a real PC pilot test. No live release is implied by a local build.

## 2026-11-10 — Standalone dashboard window 0.3.1 (Claude)

Dashboard tray click now opens in a standalone app-mode window (no browser address bar or tabs) instead of a default browser tab. On Windows 11+ Edge is always present and is preferred; Chrome at standard install paths is the fallback; `rundll32.exe` is the final fallback if neither is found. Window opens at 440×760px. Published sequence 10. No server or DB change.

## Historical design notes (0.2.x)

A visible, per-account Windows application with a local browser dashboard. Uses the current ChoreZap icon and navy/teal/yellow palette. Shows conservative foreground application estimates, classified gaming/school/other totals, remaining allowances and sync status. Browsers cannot be split into school vs entertainment in this version.

Run normally in the child's standard Windows account, not as administrator. Windows named mutex prevents duplicate collectors in that account/session. This pilot is intentionally stoppable; it is not a tamper-resistant service. An executable basename is a classification hint, not a verified game identity.

The device generates a random token protected with Windows DPAPI and an account SID hash. The parent claims its 24-character code in the home server `/pc` screen. Only token hashes are stored server-side. The packaged public TLS certificate pins uploads to the home Mac server; no Windows trust-store changes. Never package `.companion/tls.key` or `.env.local`.

Immutable UUID batches cover at most five minutes and upload each minute after a batch closes. Server checks retry identity, overlap, durations, family scope and revocation. Local state checkpoints every15seconds; abrupt power loss can lose that interval. Transitions, inaccessible windows and sleep gaps are not charged as gameplay. Daily totals reset at Denver midnight. Queue:1000batches, server retention14days,350batches/client/day. Long offline gaps beyond14days require recovery; this is a home-LAN pilot.

Parent classifies executables, sets shared/per-game daily limits and can pause gaming. Default mode is reminders on the dashboard. Optional close mode gives a Windows popup and30seconds to save, then closes only the current foreground, same-account, explicitly classified game. This can lose unsaved progress. Browsers, launchers and system tools have a hard-coded safety exemption. A fresh server policy is required after every startup; closing falls back to reminders after4hours offline or immediately after a401 response. Stopping the app bypasses limits. No OS-wide protection, installer, startup task, updater, web history, YouTube titles or chore gate yet.

Build (Go toolchain): `go test -race ./...`, Windows `GOOS=windows GOARCH=amd64 go vet ./...`, then `GOOS=windows GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o ChoreZap-Desktop.exe .`. The checked-in `.syso` embeds the verified current icon. `go run . -demo` opens a sample dashboard without collecting or uploading.

Mac server: custom `companion-server.cjs` keeps parent HTTP3100 and adds certificate-pinned device HTTPS3101. Public HTTP rejects v2 device calls. The existing parent login remains unchanged; do not expose this server to the Internet. The web deployment is not updated by this build.

Tests on Mac cover accounting, restart identity, midnight/sleep, protected apps, shared budgets, upload acknowledgements, dashboard authentication/host/origin, plus Windows cross-build/vet. New DPAPI/single-instance/closing code still needs real Windows testing. The earlier read-only sensor was successfully smoke-tested on Windows. No claim that game closing is proven on Steam/Xbox yet.

## Application suggestions (0.2.1)

For an observed foreground executable, inspect up to eight ancestor folders for a matching MicrosoftGame.config declared executable or a matching Steam appmanifest installation. Metadata reads are bounded; paths stay local. Names, source and Steam AppID may accompany that app's usage. No account login, entire installed-library inventory, remote game database or private paths are uploaded. A Steam install may be software, so it stays a suggestion until the parent selects it. Both sources require parent confirmation before game budgets apply. Existing rules always win. Conflicting hints for one basename suppress suggestions. Older clients/uploads remain compatible. Detection is best-effort; legacy Xbox packages and ambiguous executables can still need manual classification.

See CLASSIFICATION.md for source/license research and the commercial-product roadmap.

## Countdown (0.2.2)

A native topmost, click-through, nonactivating corner window appears during the final five minutes of a classified foreground game's allowance. Teal turns yellow at60seconds. Close mode shows the same30second deadline used by enforcement, including retry status; reminder/offline mode explicitly keeps the game open. School/protected apps and extended allowances hide it. A matching dashboard component refreshes eachsecond. The overlay uses the current ChoreZap icon and navy/teal/yellow palette; no injection or game hooks. The foreground monitor is chosen when the overlay appears.

Windows behavior remains unverified: test visibility, mouse/keyboard focus, DPI/multiple monitors and lock/unlock in reminders mode first. Exclusive fullscreen can cover ordinary desktop overlays; use borderless/windowed mode for the pilot. Four additional countdown tests cover thresholds, interpolation, real deadline, stale-policy fallback, extra time, school and stale-deadline removal. The previous MessageBox call at expiry is replaced by the countdown overlay. No server/database change for this release.

## Awareness check-ins (0.2.3)

Every30minutes of parent-classified gaming today triggers a20second nonblocking notice showing the recorded daily total, even with no cap. Limit countdowns take precedence. School/protected apps and unavailable foreground observations do not show awareness notices. Milestone/day are checkpointed with the ledger; abrupt termination before the15second checkpoint can repeat a notice. No historical time is invented, no limit is changed, no game is closed by a check-in. Existing foreground measurement and fullscreen-overlay limitations remain. This portable release does not implement protected service, schedules, remote show-now, startup installation, or automatic updates.


## 2026-10-23 — Game notifications0.2.4 (Codex)

Matt requests Let's Go on game launch, half-hour mental time checks, and persistent time-up notice. Added8second Let's Go for newly observed classified foreground PID/executable; repeated foreground observations do not retrigger. Existing daily30minute milestones now say30 MINUTES HAS PASSED and show recorded daily total. Expired notice says TIME IS UP and persists across foreground switches until its allowance restored/reset; close-mode save countdown still wins. No forced enforcement or parent settings changed. Pilot limitations: foreground discovery rather than background process-start events; PID reuse can suppress greeting; restart resets process sightings and sticky expiry until game observed again; lock screen hides native overlay; fullscreen visibility unverified.24Go race tests pass, Windows vet/build pass; ZIP integrity/hashes checked. Updated ZIP/setup0.2.4 at Oct22 outputs, LAN IP fix retained. No server/DB changes. (Codex)


## 2026-10-23 — Family OTA updater0.2.6 (Codex)

Matt explicitly approved creating a dedicated update signing key and home-server release endpoint. Added portable launcher/worker updater; current Windows package0.2.6 release sequence6. Launcher checks every15minutes while app runs, stages bounded downloads, and activates next manual app start (no in-game restart). Ed25519 signature over exact manifest payload, SHA256/size checks, pinned HTTPS, fixed same-server download paths, no redirects, sequence floor/current-active checks. Stable original launcher executes verified side-by-side workers under LocalAppData/ChoreZapDesktop/updates. A separate named mutex prevents duplicate launchers. New worker must serve dashboard, sample and save successfully for20seconds and signal health within45seconds; failure falls back to previous worker and quarantines failed sequence. Stop app exits launcher too. Existing account/ledger retained; no DB migration. Updates must maintain ledger compatibility; executable rollback does not restore/migrate data.

Private Ed25519 key .companion/update-signing.pem on Mac server (0600), public key compiled into client. Never include private key in ZIP or Git. Publication script companion-desktop/publish-update.cjs takes executable, increasing sequence, version, server directory. Immutable hash-named binaries published before atomic manifest switch. Dedicated existing TLS3101 exposes only exact manifest/hash filenames; parent HTTP device-route rejection retained. Server restarted, live certificate-verified manifest/binary downloaded and matched finalZIP. First sequence5 was superseded before user delivery by6 after health-test factoring. No public-site/credentials-existing/DB changes.

27Go race tests pass; Windows-target vet/build, JS syntax, live TLS download/hash and ZIP integrity/per-file hashes pass. Tests cover signature tampering, binary corruption, bad staging, sequence floor and startup success/crash/timeout. Windows launch/replacement/rollback end-to-end remains UNVERIFIED. This is release-signature verification, not Authenticode; Windows executable remains unsigned and portable/bypassable. No automatic startup or protected service/schedules. Old0.2.4 clients require one manual ZIP install; future approved releases auto-download/apply next start. Original launcher/bootstrap/certificate rotation/protocol changes can still need manual package. Bad startup rollback applies only before healthy marker; not a general later-crash rollback.

Updated outputs/ChoreZap-Desktop-Windows-x64.zip and Setup/Validation in Oct22workspace. ZIP SHA256 b9ec0d8cec5c00f35751cf54323e09f56686a5dc882d4d604407b8422b58068b. Windows morning test should confirm launcher/worker startup, dashboard update status, Stop app shutdown, then a supervised newer release and failed-start rollback before relying on OTA. (Codex)


## 2026-10-23 — Visible tray/background desktop0.2.7 (Codex)

Matt accepts cooperative tracking for now and requested unobtrusive background operation with visible tray icon. Built Windows GUI-subsystem launcher/worker, no persistent console. Native notification-area ChoreZap icon opens authenticated local dashboard on left/right click, tooltip states tracking running; TaskbarCreated re-adds after Explorer restart; icon removed on clean shutdown. Tray creation failure surfaces error rather than silently running without presence. Closing browser leaves tracking running; existing explicit Stop app retained for cooperative pilot. No hidden processes, admin restrictions, startup registration or chores dashboard added.

27Go race tests pass, Windows target vet/build, PE GUI subsystem2 verified, package hashes and live signed manifest match. Native tray clicks/Explorer restart/multi-DPI still require Windows runtime test. Published sequence7/version0.2.7 on existing home updater. Fresh ZIP required for fully console-free launcher since0.2.6 original launcher is stable and remains console-subsystem after worker OTA. ZIP at Oct22outputs SHA2561456174f96247f4eb8c15c4c51812ec89b2ac1ee609ec1e7f669fef33b263939. User can directly run ChoreZap-Desktop.exe; CMD convenience launcher now starts it and exits. Pairing/ledger preserved. (Codex)
