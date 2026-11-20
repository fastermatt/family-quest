package main

import (
	_ "embed"
	"encoding/base64"
	"fmt"
	"html/template"
	"math"
	"os"
	"sort"
	"time"
	_ "time/tzdata"
)

type reportApp struct {
	Name, Time, Recent string
	Percent            int
}

//go:embed assets/chorezap-icon-192.png
var reportBrandIcon []byte

type reportData struct {
	Icon template.URL

	Started, Ended, Foreground, Gaps, Elapsed string
	Apps                                      []reportApp
	Count                                     int
}

func reportDuration(seconds float64) string {
	if math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 {
		return "Unavailable"
	}
	n := int(math.Round(seconds))
	if n >= 3600 {
		return fmt.Sprintf("%dh %02dm", n/3600, n%3600/60)
	}
	if n >= 60 {
		return fmt.Sprintf("%dm %02ds", n/60, n%60)
	}
	return fmt.Sprintf("%ds", n)
}

func observationReportData(summary ObservationSummary) reportData {
	zone, _ := time.LoadLocation("America/Denver")
	data := reportData{Icon: template.URL("data:image/png;base64," + base64.StdEncoding.EncodeToString(reportBrandIcon)), Started: summary.StartedAt.In(zone).Format("Jan 2, 2006 · 3:04:05 PM MST"), Ended: summary.EndedAt.In(zone).Format("3:04:05 PM MST"), Gaps: reportDuration(summary.UnobservedSeconds), Elapsed: reportDuration(summary.EndedAt.Sub(summary.StartedAt).Seconds())}
	apps := append([]AppObservation(nil), summary.Apps...)
	sort.Slice(apps, func(i, j int) bool { return apps[i].ForegroundSeconds > apps[j].ForegroundSeconds })
	total := float64(0)
	for _, app := range apps {
		total += app.ForegroundSeconds
	}
	data.Foreground = reportDuration(total)
	for _, app := range apps {
		percent := 0
		if total > 0 {
			percent = int(math.Round(app.ForegroundSeconds / total * 100))
		}
		data.Apps = append(data.Apps, reportApp{Name: app.Executable, Time: reportDuration(app.ForegroundSeconds), Recent: reportDuration(app.WithRecentInputSeconds), Percent: percent})
	}
	data.Count = len(apps)
	return data
}

func writeObservationReport(path string, summary ObservationSummary) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	renderErr := observationReport.Execute(file, observationReportData(summary))
	closeErr := file.Close()
	if renderErr != nil {
		return renderErr
	}
	return closeErr
}

var observationReport = template.Must(template.New("report").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'"><title>ChoreZap · Your time in focus</title><style>
:root{color-scheme:dark;--bg:#020617;--panel:#0a1120;--line:#293348;--ink:#f1f5f9;--soft:#a8b3c5;--lime:#2dd4bf;--yellow:#fac922}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 'Segoe UI',sans-serif}main{max-width:960px;margin:auto;padding:38px 28px 60px}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:24px;gap:16px}.brand{display:flex;align-items:center;gap:12px;font-size:23px;font-weight:750;letter-spacing:-1px}.brand span{color:var(--yellow)}.badge{color:var(--lime);font-size:12px;border:1px solid #5b6880;padding:6px 11px;border-radius:6px}h1{font-size:clamp(32px,6vw,54px);line-height:1.12;letter-spacing:-1.5px;margin:38px 0 15px;font-weight:650}p{color:var(--soft);margin:0 0 18px}.dates{font-size:13px;color:var(--soft);margin:25px 0}.stats{display:grid;grid-template-columns:1.3fr 1fr 1fr;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:24px 0;margin:25px 0 35px;gap:20px}.number{font-size:32px;line-height:1.3;font-weight:650;font-variant-numeric:tabular-nums}.stats dt{font-size:13px;color:var(--soft);margin-top:6px}.stats dd{margin:0}.accent{color:var(--lime)}h2{font-size:23px;letter-spacing:-.5px;margin:30px 0 8px}.app{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:22px 0;border-bottom:1px solid var(--line)}.name{font-weight:650;overflow-wrap:anywhere}.time{font-size:19px;font-weight:650;text-align:right;font-variant-numeric:tabular-nums}.bar{height:8px;background:#101a2d;border-radius:4px;overflow:hidden;margin:11px 0}.bar-fill{height:100%;width:var(--share);background:var(--lime);border-radius:4px}.detail{font-size:13px;color:var(--soft)}.status{font-size:12px;color:#f1d588;margin-top:5px}.callout{padding:22px;background:var(--panel);border:1px solid var(--line);border-radius:14px;margin-top:28px}.callout strong{color:var(--ink)}.callout p:last-child{margin-bottom:0}.checks{padding-left:22px;color:var(--soft)}.checks li{margin:10px 0}.empty{padding:24px;background:var(--panel);border-radius:12px}footer{border-top:1px solid var(--line);padding-top:20px;margin-top:32px;font-size:12px;color:var(--soft)}@media(max-width:550px){main{padding:22px 18px 40px}.stats{gap:15px;grid-template-columns:1fr 1fr}.stats>div:first-child{grid-column:1/-1}.number{font-size:29px}.app{grid-template-columns:1fr}.time{text-align:left}.brand{display:flex;align-items:center;gap:12px;font-size:21px}.badge{font-size:10px}h1{letter-spacing:-1px}.dates{font-size:12px}}
</style></head><body><main><header><div class="brand"><img src="{{.Icon}}" width="48" height="48" alt=""><div>Chore<span>Zap</span> / PC companion</div></div><div class="badge">LOCAL TEST REPORT</div></header><h1>Your time, in focus.</h1><p>A look at the applications in front of you during this test.<br>Understand the time first. Set limits later.</p><div class="dates">{{.Started}} → {{.Ended}}</div><dl class="stats"><div><dd class="number accent">{{.Foreground}}</dd><dt>Estimated foreground time</dt></div><div><dd class="number">{{.Gaps}}</dd><dt>Unobserved / transition time</dt></div><div><dd class="number">{{.Elapsed}}</dd><dt>Total test duration</dt></div></dl><h2>What filled your test</h2><p>{{.Count}} applications observed. Percentages compare recorded foreground time only.</p>{{range .Apps}}<section class="app"><div><div class="name">{{.Name}}</div><div class="bar"><div class="bar-fill" style="--share:{{.Percent}}%"></div></div><div class="detail">{{.Percent}}% of recorded time · {{.Recent}} with recent keyboard/mouse input</div></div><div><div class="time">{{.Time}}</div><div class="status">Phone blocking: not available</div></div></section>{{else}}<p class="empty">No applications could be measured. This does not mean no PC usage. Check that you ran the test unelevated in the active Windows account, and note any lock, remote-desktop or security-software issues.</p>{{end}}<section class="callout"><strong>Foreground time is an estimate, not proof of play.</strong><p>Controller gaming and passive videos may continue without keyboard or mouse input. Launchers, browsers and unknown programs have not been classified as games or school. The test does not identify individual browser pages or YouTube videos.</p></section><h2>Quick check together</h2><ul class="checks"><li>Compare a game’s time with your stopwatch. Was its launcher left in the background?</li><li>Try a controller, a school video, switching apps, locking the PC and switching Windows accounts.</li><li>Check that the parent’s applications were excluded. Record problems before trusting these numbers.</li></ul><footer>Read-only development pilot · No uploads, pairing, blocking, background installation or notifications · School and YouTube remain available · Detailed JSON is saved beside this report.</footer></main></body></html>`))
