# Game identification and product direction

Updated 2026-10-22 (Codex).

## Current implementation

1. Read local installation metadata only for an app actually seen in the foreground. Match Steam installdir + AppID or an exact Xbox MicrosoftGame.config executable declaration. Do not label every Steam app a game: Steam also distributes creative/educational software.
2. Upload a bounded friendly name/source/AppID alongside usage. Never upload the process path. Installation metadata is an untrusted hint, not an enforcement authority.
3. Present possible games for batch confirmation. Steam candidates start unchecked. Save selected games together; automatically fill labels and apply the family's existing shared allowance. Do not overwrite existing per-app rules, even if the parent saved Other or School. Protected browsers/launchers/system tools are never candidates.
4. If multiple identities use one executable basename, suppress automatic suggestions. A future identity model should key rules by verified app identity rather than basename.
5. Original fallback seed: modernwarfare.exe from Matt's supplied Windows pilot. No third-party executable database is copied into this build.

Tests cover parser bounds/malformed metadata, exact Xbox executable match, non-game Steam applications, protected browsers, parent overrides, conflicting hints, immutable uploads and old-client compatibility. Live Windows integration still needs a PC test.

## Sources reviewed

- Steam IStoreService/GetAppList: official catalog supports games vs software/DLC filters, pagination and changed-since. Requires an API key; names and IDs alone do not map processes to games. Good future server-side enrichment after terms/access are resolved. https://partner.steamgames.com/doc/webapi/IStoreService
- Steam Web API terms: requires confidential keys, documented use of nonpublic user data and other API obligations. Public API availability is not a blanket redistribution license. https://steamcommunity.com/dev/apiterms
- IGDB: official docs describe commercial partnerships and attribution; contact before commercial integration. No IGDB data or artwork included. https://api-docs.igdb.com/
- PCGamingWiki: default content license is CC BY-NC-SA. Excluded from a sellable product's bundled dataset unless separately licensed. https://www.pcgamingwiki.com/wiki/PCGamingWiki%3ADisclaimer
- Playnite: useful architectural reference; core repository is MIT. That does not license every external metadata provider's data. No source code or datasets copied. https://github.com/JosefNemec/Playnite
- Microsoft: documented ShellVisuals names and per-executable overrides; use locally installed metadata, do not copy game artwork. https://learn.microsoft.com/en-us/gaming/gdk/docs/reference/system/microsoftgameconfig/elements/microsoftgameconfig-element-shellvisuals

## Product path

Start with one promise: parents set one gaming allowance and chore rules while school remains available. Make setup a short flow: install, pair by QR/code, review detected games, choose allowance. Keep child-facing time/remaining allowance transparent.

Before a paid family pilot:
- Replace the Mac-specific bootstrap with managed HTTPS device enrollment; separate development/staging/production. Never ship a household's IP/certificate in a customer build.
- Give each parent individual authentication and stronger authorization for device changes; audit changes and show whether each PC actually applied a policy.
- Use a trusted Windows service with a restricted child-session sensor, authenticated local communication, robust app identities and an explicit tamper/offline policy. Current same-user app is bypassable.
- Signed installer, safe automatic updates, rollback/recovery, startup behavior, and broad Windows/Steam/Xbox/AV testing.
- Family-specific time zone and schedules, multi-PC accounting without silently truncating results, retention/deletion/export controls, and clear child/parent notices. Review child-data obligations for intended launch markets before sale.
- Version every classification source, track commercial terms/attribution, provide per-family overrides and a simple correction flow. Add an externally licensed catalog only when it measurably improves detection.
- Chore gates must use server-side ChoreZap proof semantics and protect school/sign-in/ChoreZap access. Confirm rules using notifications and device acknowledgements.
- Validate with a small paid pilot before subscriptions, public marketing or claims of comprehensive blocking. Measure false classifications, setup time, support burden and Windows reliability.

This is product planning, not a claim that the current pilot is ready for sale. No public deployment, provider signup, paid service or commercial license was purchased in this work.
