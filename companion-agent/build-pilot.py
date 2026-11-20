#!/usr/bin/env python3
"""Build only the local observation pilot; excludes pairing, DNS, tokens and HTTP."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

PILOT_MAIN = '// ChoreZap local-only pilot. This entry point excludes all server, pairing,\n// device-token, DNS-collection and upload code from the executable.\npackage main\n\nimport (\n "flag"\n "fmt"\n "os"\n "time"\n)\n\nfunc main(){\n duration:=flag.Duration("duration",30*time.Minute,"visible test duration, up to 1h")\n flag.Parse()\n fmt.Println("ChoreZap PC Pilot 0.1.1 - read-only, local-only development build")\n if flag.NArg()!=0 {fmt.Fprintln(os.Stderr,"No commands are supported. Use --duration 30m.");os.Exit(2)}\n if err:=observe(*duration,2*time.Second);err!=nil {fmt.Fprintln(os.Stderr,"Test could not complete:",err);os.Exit(1)}\n}\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Path for the Windows x64 .exe")
    args = parser.parse_args()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    go = shutil.which("go")
    if not go:
        raise SystemExit("Go is required to build the pilot.")
    source = Path(__file__).resolve().parent
    with tempfile.TemporaryDirectory(prefix="chorezap-local-pilot-") as temp:
        target = Path(temp)
        for name in ("observe.go", "observe_windows.go", "observe_other.go", "observe_report.go"):
            shutil.copyfile(source / name, target / name)
        shutil.copytree(source / "assets", target / "assets")
        shutil.copyfile(source / "assets/chorezap-windows-amd64.syso", target / "rsrc_windows_amd64.syso")
        (target / "main.go").write_text(PILOT_MAIN)
        (target / "go.mod").write_text("module chorezap/local-pilot\n\ngo 1.22\n")
        env = dict(os.environ, GOOS="windows", GOARCH="amd64", CGO_ENABLED="0")
        subprocess.run([go, "build", "-trimpath", "-ldflags", "-s -w", "-o", str(output), "."], cwd=target, env=env, check=True)
    print("Built local-only Windows x64 pilot:", output)


if __name__ == "__main__":
    main()
