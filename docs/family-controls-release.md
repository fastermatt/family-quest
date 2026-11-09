# Family controls pilot — implementation and release notes

November 8, 2026 (Denver) · Codex + Sol + Luna

## Built

- Parent `/family-controls`, linked from PC time: editable 120 weekday / 120 weekend / 60 bathroom defaults, proof requirements, selected existing privilege to replace, school/game/bedtime windows, optional paid job offers/review, IOU and cash history, device status.
- Child home: dated earned minutes and last-uploaded remaining balance, IOU/cash, voluntary job acceptance, submission and specific corrections. Normal chores never create cash. The selected legacy game privilege no longer asks separately when enabled.
- Atomic PostgreSQL money and chore approval routines, replay-safe credits, family/child scope, denied browser roles/RLS, immutable daily grants. Job proceeds reduce IOU first, then cash owed. A cash receipt records payment already made; no banking integration.
- Desktop 0.3.0: short policy lease clipped to routine boundary/midnight, no fresh game permission after restart until sync, persistent shared final warning, settings revision acknowledgement, no silent policy downgrade. Signed updates now support allowlisted remote diagnostics, a labelled countdown test, update check/staging and safe-idle activation. Initial installer refresh required for the new stable launcher; subsequent compatible workers can update remotely.
- Next.js and ESLint config upgraded to 16.4.5. Removed disabled next-pwa dependency; hand-written push service worker and registration preserved. Runtime dependency audit clean at verification; eight moderate development-tool advisories remain in the ESLint dependency chain.

## Scope and limitations

This is a cooperative single-PC household pilot. It is not Qustodio parity. It does not implement an admin-owned service, native WFP/Apple filtering, YouTube content filters, a whole-PC bedtime lock, app-store clients, or multi-device spending reservations. School and YouTube remain outside the game allowance. Schedules restrict classified foreground games only; warn mode only reminds. Child can stop the current portable client, and minimized/background gaming is not reliably counted or closed. Native enforcement is the next milestone and cannot be replaced by this pilot.

Only one active linked PC is supported for earned minutes. Older clients need 0.3.0 or newer; more than one active device makes earned access unavailable. PC-reported balance may lag uploads by about five minutes. Revision acknowledgement covers settings receipt, not proof every latest task or usage change is applied. Offline policy may remain usable until the short lease expires; remote pause is not instantaneous when offline.

Existing update signature validation is not Authenticode. A Windows x64 installer ZIP and offline Ed25519-signed sequence10 release are prepared. Publishing this binary to the home OTA channel is not done. A rollback to old 0.2.9 cannot honor the new family protocol. Do not enable these rules while depending on an unverified update/downgrade path. A real Windows roundtrip, game-close, reboot, controller, fullscreen and update-recovery trial remains necessary.

Bathroom bonus in this pilot is parent-confirmed, at most once per weekend, credited on approval day and expires that midnight. Parent sees this before approval. Default weekend chores gate is off and editable. Schedules are blank until configured; no school or bedtime hours are inferred. IOU suggested80 dollars is not automatically seeded. XP is not converted into time or money.

## Source reconciliation

Worktree: `/Users/matt/Documents/ClaudeObsidian/Projects/ChoreZap/app-family-controls`, branch `codex/chorezap-family-controls`. It merges current origin/main829d887 (reminder/loading fixes) into the companion branch and preserves source from the dirty original `chorezap-test` without modifying the original worktree. Review includes that inherited companion work as well as new family controls. No branch force-push or production deployment.

## Release order

1. Review this pilot scope and current-code reconciliation; check no newer production change exists.
2. Apply additive migrations `20261109052008_family_controls_pilot.sql` and `20261109054611_companion_remote_maintenance.sql` after confirming existing companion activity schema. Do not blindly replay legacy numbered migrations: production reminder migrations were split historically. No destructive rollback of money/history.
3. Deploy matching app/server source, with settings disabled. Parent HTTP LAN login stays LAN-only; never expose the PIN-only home server publicly.
4. Upgrade a test Windows account to0.3.0; verify device headers, policy receipt, safe warning/close, school browser availability, disconnect and reboot, bad update recovery. Confirm actual installed launcher supports signed worker updates.
5. In parent UI select Greyson and the existing Video Games privilege; enter the agreed$80 opening IOU once. Set actual school/game/bedtime hours, proof rule and weekend gate; verify120/120/60. Enable only after PC checks. Existing$5patio offer in old bonus_tasks is not auto-imported or paid twice; explicitly re-offer it if wanted.
6. Run household trial and then build the protected service/native filtering. Do not market this pilot as tamper resistant.

These release steps are not completed. The original source-reconciliation hold has been addressed by merging verified origin/main; this does not establish Windows runtime correctness. Matching live database, web/home-server and OTA rollout is a separate release decision, with family settings disabled until the PC acceptance test passes.


## Final local validation

98 Node tests pass, including family policy/DST, embedded PostgreSQL money/game/remote-command transactions, RLS and actual-route authorization tests. Embedded PostgreSQL concurrency calls are queued by PGlite; this is not a multi-connection production load test. TypeScript, focused lint and production Next build pass. Focused lint has five inherited home-page unused-variable warnings. Full-repository lint retains existing login/setup hook/entity and CommonJS configuration errors; no full-lint-clean claim. Go race tests, Windows-target vet and Windows GUI cross-build pass.

Mobile browser tests use sample API responses and a local fake Supabase profile endpoint only. They cover schedule save, opening IOU, offered job acceptance/submission/approval and all four maintenance commands, queued/offline/completed/failed states, staged versus installed version and failure detail. These are not live backend or Windows integration tests.

Maintenance commands are family/device-scoped, bounded and replay-safe; no arbitrary shell or scripts. Polling is15seconds while connected, commands expire10minutes, update checks15minutes. Activation requires fresh accepted policy, saves the ledger, pins the signed manifest, rechecks all same-user classified games before restart and reports installation only by subsequent version heartbeat. Countdown receipt is at-most-once; a crash may skip an unconfirmed effect, so requested is not proof it appeared.

User setup/acceptance guide: `ChoreZap-Windows-Setup.md` in the session outputs. No private credentials or account tokens in packages. Manifest signatures are verified; executable is not Authenticode signed. Original worktree unchanged; no live migrations, deployment, IOU seed, job payment or PC policy change.
