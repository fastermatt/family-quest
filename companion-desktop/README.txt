ChoreZap — Windows PC Companion
================================

WHAT THIS IS
------------
ChoreZap tracks game and app time on this Windows account and enforces
the daily limits a parent sets at app-family-controls.vercel.app.


INSTALL (one time, takes 2 minutes)
------------------------------------
1. Copy this entire ChoreZap folder to your child's Documents folder.
   The app needs both ChoreZap.exe AND server.json in the same folder.

2. Open your child's Windows account, go to Documents\ChoreZap, and
   double-click ChoreZap.exe.

3. A dashboard opens in your browser and shows a 4-digit setup code.

4. On your phone or another computer, go to:

       app-family-controls.vercel.app/pc

   Sign in as a parent, choose your child, and enter the 4-digit code.

5. The dashboard confirms "This PC is linked."
   ChoreZap will now start automatically every time Windows launches.


NOTES
-----
- Run ChoreZap.exe in the CHILD's Windows account, not a parent account.
- Keep ChoreZap.exe and server.json in the same folder at all times.
- App data is stored in %LOCALAPPDATA%\ChoreZapDesktop — not this folder.
- To uninstall: delete this folder and remove ChoreZap from
  Settings > Apps, or delete %LOCALAPPDATA%\ChoreZapDesktop manually.


TROUBLESHOOTING
---------------
"Missing server certificate"  — server.json is missing or in a different
                                folder from ChoreZap.exe. Put them together.

"Already running"             — ChoreZap is already open in this account.
                                Check the system tray.

Dashboard shows no data       — Wait 30 seconds after opening a game.
                                ChoreZap samples activity every few seconds.
