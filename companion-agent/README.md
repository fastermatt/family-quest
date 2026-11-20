# ChoreZap companion: local pilot and boundaries

This branch is an early build. Linking a PC does not enforce anything. The live Mac server is a separate worktree; editing this branch does not update that server.

## Three separate capabilities

| Capability | Current status | What it means |
|---|---|---|
| Inventory / pairing | Existing, not verified on real Windows | Describes a PC; it does not bind it to Grey's account or activate protection |
| DNS diagnostics (`watch`) | Existing, machine-wide | Domains in Windows' DNS cache, including background programs and other users; not visits or time |
| Foreground pilot (`observe`) | Local-only, cross-compiled; Windows runtime unverified | Estimates executable foreground time in the current Windows session/account |
| Browser journal | Not implemented | Required for page timestamps, YouTube titles and video identifiers |
| Enforcement / phone commands | Not implemented | Requires separate trusted service, parent authentication and device acknowledgement |

Do not label DNS counts as visits, watch time, gaming minutes or Grey's activity. Never feed them into an entertainment budget. The parent API now returns exact observed hostnames so a quick rule cannot accidentally widen from one shared-hosting tenant to all tenants.

## Local foreground pilot

Build from this directory:

```sh
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -o ../dist/chorezap-agent.exe .
```

The development binary is unsigned and is not a release installer. Do not disable antivirus, SmartScreen or other protections to run it. If protection rejects it, record that outcome for the signing/compatibility review.

When Matt is present, run from Grey's standard account, WITHOUT Run as administrator:

```powershell
.\chorezap-agent.exe observe --duration 10m
```

`observe` does not read the device token, connect to ChoreZap, pair the PC, upload data, install a service, change Windows settings or enforce limits. It refuses elevation. It records executable basenames, foreground estimates and a separate recent-keyboard/mouse estimate. It does not record window titles, executable paths, URLs or key contents.

After the time expires, or Ctrl+C, it saves JSON beneath Grey's `%LOCALAPPDATA%\ChoreZapPilot`. The path is printed. Pilot output is not automatically deleted or uploaded; Matt can inspect and delete it locally. Abrupt termination can lose the current run.

The Windows sensor checks the active console session, input desktop and process owner; unavailable observations are gaps. Remote desktop, lock/unlock, user switching, UAC, elevated processes, packaged games, controller-only play and passive videos MUST be tested on Windows. It has not been proven to isolate every such case. Long gaps/sleep and app transitions are not credited to the last app. Keyboard/mouse idle is not evidence someone stopped watching or using a controller. These estimates must not drive enforcement yet.

Run this pilot separately from `link`, `report` or `watch`. Those older commands use administrator-only ProgramData storage. `watch` now defaults to local-only; uploading machine-wide diagnostics requires an explicit `--local-only=false`. It still is not the normal activity collector.

## Product behavior after the pilot

- Child: Time dashboard, daily/weekly category totals, per-game breakdown, sessions, browsing journal, remaining allowance and an explanation of each rule. No shame labels or fake zeroes when data is missing.
- Parent: The same activity plus access rules, scoped temporary overrides, requests, device coverage and command status. Saving a rule is separate from applying it.
- School and YouTube always win over entertainment blocks. School includes ChoreZap, lesson dependencies and the LAN lesson server. The domain-only prototype does not model IP/port-specific rules; do not pretend it does.
- Domain rules cover hostnames/subdomains, not page paths. Specific URL paths/queries are rejected instead of silently creating a wider rule.
- Category website rules do not stop offline games or guarantee closure of installed applications.
- School rules beat narrower denies. Ordinary allow/deny rules still use hostname specificity. YouTube and required delivery hosts are protected even against explicit denies.
- Unknown apps remain unclassified until a parent maps them. Steam/Xbox launchers and background downloads must never automatically count as gaming.

## Architecture still requiring Claude review before release

The foreground and browser sensors are untrusted reporting sources. A privileged service must own budgets and policy enforcement. Pairing should explicitly bind a device to Grey's SID, with a separate restricted helper identity; the child helper must not receive the administrator device token.

Before real pairing/uploads or a public release, review the existing HTTP LAN transport, parent PIN-only authorization, pairing-code collision/rate-limit behavior, claim/token-delivery recovery, and atomic upload throttling. Current tests do not prove these safe. Use authenticated HTTPS for real device secrets; a `.local` address alone is not transport security.

Define signed/versioned policy, revocation, schema compatibility, expiring overrides, offline eligibility and recovery before enabling blocks. Signed updates are a later feature; v1 must not execute arbitrary remote commands or downloaded code. Keep code changes separate from configuration sync.

## Verification gate

1. Compare foreground estimates with a stopwatch for one Steam game and one Xbox PC game; keep launchers open in the background.
2. Exercise keyboard/controller play, passive school video, app switching, sleep, lock, account switching and parent elevation. Record gaps, do not hide them.
3. Confirm output contains no activity from Matt's Windows account, and no titles, paths, URLs or credentials.
4. Then implement and test the browser journal locally before connecting it to uploads/dashboard data.
5. After authentication/pairing review, add batched, deduplicated uploads with a bounded local spool. No per-tick DB inserts or per-minute cron.
6. Only after reporting is trustworthy test game/site enforcement, school dependency exceptions, and command failure/recovery.

No production migrations, credential changes, running-server rebuilds or deployments are authorized by these instructions.


## Portable pilot package (0.1.1)

For the initial PC test, use the standalone local-only build, not the full pairing agent:

```sh
python3 build-pilot.py /absolute/output/ChoreZap-Pilot.exe
```

This compiles only observe/report code and a dedicated entry point. Pairing, DNS, tokens and upload commands are not included. Default duration30minutes; `--duration 2m` is a quick test. Each run now writes a self-contained offline HTML report beside the raw JSON. The portable package has Start/Quick/Open Reports launchers; no admin installation or startup task. The binary remains unsigned and Windows runtime behavior unverified. If security software blocks it, record the message; do not disable or bypass protection.
