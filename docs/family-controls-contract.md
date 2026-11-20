# Family controls implementation contract

Work in this repository only. No credentials, live API calls, deployment or brain writes by delegated agents. Codex owns review and server implementation. Current scope is a cooperative household pilot; do not claim tamper-resistant service or native filtering shipped.

Types: src/lib/family-controls/types.ts. Existing CSS panel/field/btn variables. Read local Next route/page docs before edits.

GET /api/parent/family-controls?childId=... -> {children:[{id,name}],overview:FamilyOverview|null}; default first child. GET /api/child/family-controls -> FamilyOverview. Same-origin POST JSON. Errors {error:string}, non2xx. All successful mutations {ok:true}; refetch after. Parent endpoint body requires childId with actions:
- settings: {action:'settings',childId,settings:FamilySettings}; revision optimistic lock (409 on stale). All schedules initially empty; parent configures school/game/bedtime with days 0Sun..6Sat start/end HH:mm. Overnight supported. Empty gaming_windows = unrestricted hours except school/bedtime. Empty school/bedtime = not configured. Feature disabled default. Minutes default120/120/60. No all-day equal start=end. timezone initially America/Denver; pilot only Denver until activity accounting made timezone aware.
- open-iou: {amountCents,description}; one-time initialization, default suggested80.00 but no automatic actual debt.
- offer-job: {title,description,criteria,priceCents}; optional nonrecurring job directed to selected child.
- review-job: {jobId,decision:'approve'|'changes_requested'|'cancel',note}; approve submitted only; corrections require note; cancel only offered/accepted/changes_requested.
- bathroom-bonus: {note}; parent confirms actual completed deep clean, one bonus per weekend, only Sat/Sun, credited today, expires midnight. Receipt display after.
- settle-cash: {amountCents,requestId:crypto.randomUUID()}; mark a real payment already made, cannot exceed owed; key persisted for retry until success.
Child POST /api/child/family-controls: {action:'accept-job'|'submit-job',jobId,note?}; submit requires accepted/changes_requested. No child money approval endpoint.

Copy: routine chores are unpaid family responsibilities; earn game time after responsibilities. Jobs Dad/parent offers are optional paid work and first repay IOU. XP is progress only. School/YouTube never cost game minutes. Money never unlocks games. No guilt/shame debt copy. Do not offer bank transfers. Existing legacy reward asks remain for other privileges.

PC JSON response gains optional familyPolicy:{enabled:true,revision,day,timezone,eligible,allowed,reason,expiresAt} and policyLeaseSeconds (<=900 if enabled). settings.gaming_minutes becomes today's earned grant total /60, paused includes gate/schedule failure. Old mode remains warn or close; label honestly. No schedules inferred. Client should locally expire permission (fail closed for games when policy enabled), not grant another four-hour fallback. School/browser never closed for exhausted game time. Native filtering/service is separate next milestone.
