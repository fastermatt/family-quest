# ChoreZap family pilot — 0.3.7 release

November 11, 2026 (Denver). (Codex)

## Family setup

Greyson’s opening IOU is $80, entered exactly once for Modern Warfare 4. Daily chores remain unpaid family responsibilities. Parent-selected optional paid jobs reduce the IOU first, then accrue cash owed. Child and parent see the balance and transaction history.

Saved settings: 120 earned minutes Monday–Friday, 120 weekend minutes, one parent-approved bathroom bonus of 60 minutes per weekend. School is Monday–Friday 08:00–13:30; bedtime is daily 22:45–08:00, America/Denver. All are editable in Family controls. The bathroom bonus expires at midnight on its approval day. Family enforcement remains disabled until the supervised Windows acceptance test. Existing 120-minute reminder mode remains active.

## Release contents

- Parent and child family controls, chores proof gate, optional paid-job workflow, IOU/cash ledger, editable schedules and minute budgets.
- Browser history with timestamps and YouTube video links, explicit Edge/Chrome coverage and limits; legacy totals are labelled. History is not proof of watching or attention. Query strings are removed except a YouTube video ID. The child sees a collection notice.
- Correct app usage joins and allowance display. Classified running games can consume the shared budget in the background; school and browser apps stay available. Foreground game closing requires the optional close mode and warning. Concurrent per-game accounting remains approximate.
- Linked Stop requests verify the parent PIN online. Hashes stay server-side; the child ledger receives only whether a PIN is configured. Cross-device attempt limits are atomic. Damaged ledgers fail startup and remain available for recovery.
- Windows per-user installation, safer scoped process replacement/uninstall, signed sequence 16 updates, launcher version reporting, fresh-policy and game-idle checks before activation. A 0.3.7 launcher installation is required once; subsequent compatible workers support remote activation. A completed command is not proof of installation: verify the subsequent version heartbeat.
- Closed anonymous/authenticated access to an existing profile view exposing account tokens; rotated the five Carlson session tokens. Existing PINs and device pairing remain unchanged. Everyone must sign in again. No claim is made about historical access.

## Install and verify

Download `/downloads/ChoreZap-Windows-x64.zip` from the hosted app or PC maintenance page. Extract all files together, close games, stop the existing ChoreZap app from its dashboard, and run ChoreZap.exe in the child’s Windows account. It installs to `%LOCALAPPDATA%\Programs\ChoreZap`; existing usage and pairing are preserved. New installs show a setup code to enter on the parent PC page. The EXE is not Authenticode signed; update manifests are Ed25519 signed.

On the parent PC page verify worker and launcher version 0.3.7, a fresh check-in, diagnostics, and the labelled countdown demo. Check school/browser/YouTube access while a classified game is restricted. Test a minimized game, reboot, disconnect/reconnect, a supervised newer signed update and failed-start rollback. Confirm no game is interrupted by update activation. Only then enable family rules and choose reminder or close mode. The installer requires the existing launcher and tracker to be stopped before replacing files; it refuses a running installation without killing either process. Use the dashboard Stop app action first.

## Boundaries

This is a cooperative single-PC household pilot. It does not implement a protected Windows service, whole-PC bedtime lock, native content filtering, YouTube content controls, Mac/iOS clients or app-store readiness. A standard child Windows account with a separate parent administrator is still needed for the later protected-service phase. The current app can be stopped or uninstalled by the account owner. Native process, overlay, installation, restart and update recovery behavior needs real Windows testing; cross-compilation is not that test.

School and bedtime currently control classified games, not the entire Windows session. YouTube remains available. Browser collection covers at most eight Edge/Chrome profiles each, 2,000 visits/day and a bounded upload; unsupported browsers/private history are not captured. Multiple PCs cannot share a reliable earned-minute budget yet.

## Validation and operations

Automated coverage includes policy/DST, embedded PostgreSQL money and command transactions, role/family authorization, PIN attempts, installer path scope, update signatures/rollback, and actual Go browser payloads through the TypeScript validator. Embedded PostgreSQL is not a multi-connection load test. Live PostgreSQL PIN cryptography and permissions were tested in a rolled-back transaction. Browser UI checks use controlled fixtures; they are not native Windows tests.

Additive migrations: `20261111143134_companion_release_schema_and_stop_verification.sql` and `20261111143718_companion_stop_pin_transition_and_access.sql` are applied. Existing family and maintenance migrations were already present and were not replayed. Do not roll back financial history. Source branch: `codex/chorezap-family-controls`; production target: `app-family-controls.vercel.app` (not the old family-tasks-deploy project).

Remote commands are limited to diagnostics, update check, controlled activation and countdown demonstration, with device/family scoping, replay safety and ten-minute expiry. No arbitrary shell commands. Read current publication and Windows verification status in the ChoreZap project wiki.
