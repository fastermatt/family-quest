ChoreZap — Windows PC Companion
================================

WHAT THIS IS
------------
ChoreZap tracks game and app time on this Windows account. A parent can
choose reminder mode or game closing after a save warning. The daily
allowance and schedules come from app-family-controls.vercel.app.


INSTALL (takes about 1 minute)
-------------------------------
1. Open your child's standard Windows account.

2. Put both files (ChoreZap.exe and server.json) in the same folder —
   Downloads, Desktop, anywhere is fine.

3. Double-click ChoreZap.exe.

   ChoreZap installs itself automatically to:
       %LOCALAPPDATA%\Programs\ChoreZap\

   A ChoreZap dashboard window opens showing a 4-digit setup code.

4. On your phone or another computer, go to:

       app-family-controls.vercel.app/pc

   Sign in as a parent, choose your child, and type the 4-digit code.

5. The dashboard confirms "This PC is linked."
   ChoreZap will now start automatically every time Windows launches.

You can delete the original ChoreZap.exe you downloaded — the app has
already copied itself to the right place.


UNINSTALL
---------
Go to Settings > Apps, find ChoreZap, and click Uninstall.
Or run:  ChoreZap.exe --uninstall


TROUBLESHOOTING
---------------
"server.json missing"     — Make sure server.json is in the SAME folder
                            as ChoreZap.exe when you first run it.

"Already running"         — An older version is running. Wait a few seconds
                            and try again; ChoreZap replaces itself automatically.

Dashboard shows no data   — Wait 30 seconds after opening a game.
                            ChoreZap samples activity every few seconds.

Damaged saved usage        — Preserve %LOCALAPPDATA%\ChoreZapDesktop\ledger.json.
                            Do not delete it or reset the allowance. A parent
                            can review uploaded usage and restore a verified
                            backup; unuploaded activity may be unrecoverable.

Killed from Task Manager  — Reopen ChoreZap if it does not restart. Recovery
                            timing depends on Windows Task Scheduler settings.
