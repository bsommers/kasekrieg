# installer-windows report

## Built
`desktop/scripts/installer-windows.sh` (host driver) + `desktop/scripts/win/{installer.nsi,installer.cmd,install-test.cmd}`. Produces `dist/Kaesekrieg-Setup-win32-x64.exe` (96.5 MB, NSIS 3.10 MUI2 wizard: welcome/dir/install/finish-with-launch). Per-user, no admin: installs to `%LOCALAPPDATA%\Programs\Kaesekrieg`, Start Menu shortcuts (app + uninstall), HKCU Uninstall entry (Apps & Features), `/S` silent and `/D=` supported, `Uninstall.exe /S` silent.

## Tool
makensis/ISCC absent in VM; iexpress.exe present but unused. Downloaded portable NSIS 3.10 zip from downloads.sourceforge.net (curl.exe, in the VM only) into `C:\Users\dev\kaesekrieg-build\.nsis` (once; cached). Nothing installed on the host.

## Verified (in VM, 3m53s full run incl. first NSIS download)
Silent install: exe, shortcut, uninstall registry entry present. Installed `Kaesekrieg.exe --smoke` ok=true fps 34.4 errors 0. Silent uninstall: dir, Start Menu folder, registry keys all removed.

## Mistakes
None blocking. First run looked hung: makensis with solid LZMA on ~400 MB in the software VM takes ~2-3 min and the output is 0 bytes until done; tail buffering hid progress.

## Learnings
- NSIS silent uninstaller relaunches itself from %TEMP%, so `start /wait` returns early; install-test.cmd polls for dir removal.
- Run `desktop/scripts/build-windows.sh` first (installer-windows.sh invokes it if the guest has no build). Pass `--no-test` to skip the install/uninstall test.
- Installer is unsigned; SmartScreen may warn.
- Version taken from desktop/package.json.
