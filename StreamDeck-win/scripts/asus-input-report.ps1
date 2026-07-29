# Reads HID *input* reports via HidD_GetInputReport.
#
# The Linux kernel's hid-asus driver fetches ASUS battery with a GET_REPORT on
# input report 0x03 (see drivers/hid/hid-asus.c: BATTERY_REPORT_ID). node-hid
# exposes only feature reports, so that call is unreachable from Node — hence
# this P/Invoke.
#
#   node scripts/asus-probe.mjs --paths $env:TEMP\asus-paths.txt
#   powershell -File scripts/asus-input-report.ps1 -PathsFile $env:TEMP\asus-paths.txt
param(
	[Parameter(Mandatory = $true)][string]$PathsFile,
	[int[]]$ReportIds = @(0x01, 0x02, 0x03, 0x04, 0x05, 0x0d, 0x12, 0x5a),
	[int[]]$Sizes = @(9, 17, 33, 65)
)

$ErrorActionPreference = 'Continue'

Add-Type -Namespace Hid -Name Native -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern IntPtr CreateFileW(string lpFileName, uint dwDesiredAccess, uint dwShareMode,
	IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

[DllImport("hid.dll", SetLastError = true)]
public static extern bool HidD_GetInputReport(IntPtr HidDeviceObject, byte[] ReportBuffer, int ReportBufferLength);

[DllImport("hid.dll", SetLastError = true)]
public static extern bool HidD_GetFeature(IntPtr HidDeviceObject, byte[] ReportBuffer, int ReportBufferLength);

[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool CloseHandle(IntPtr hObject);
'@

$GENERIC_READ = 0x80000000
$FILE_SHARE_READ_WRITE = 0x00000003
$OPEN_EXISTING = 3

function Show-Bytes($label, $bytes) {
	$hex = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ' '
	Write-Host "        $label : $hex"
	$cands = @()
	for ($i = 0; $i -lt $bytes.Length; $i++) {
		if ($bytes[$i] -ge 1 -and $bytes[$i] -le 255) {
			$pct = [int](($bytes[$i] * 100) / 255)
			$cands += "[$i]=$($bytes[$i]) (raw%=$($bytes[$i]), /255=$pct)"
		}
	}
	if ($cands.Count -gt 0) { Write-Host "            candidates: $($cands -join '  ')" }
}

foreach ($path in Get-Content $PathsFile) {
	if (-not $path) { continue }
	Write-Host "=== $path"

	$handle = [Hid.Native]::CreateFileW($path, $GENERIC_READ, $FILE_SHARE_READ_WRITE, [IntPtr]::Zero, $OPEN_EXISTING, 0, [IntPtr]::Zero)
	if ($handle -eq [IntPtr]::Zero -or $handle -eq [IntPtr](-1)) {
		Write-Host "    open failed (err $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
		continue
	}

	foreach ($id in $ReportIds) {
		foreach ($size in $Sizes) {
			$buf = New-Object byte[] $size
			$buf[0] = [byte]$id

			if ([Hid.Native]::HidD_GetInputReport($handle, $buf, $size)) {
				Show-Bytes "INPUT  id=0x$('{0:x2}' -f $id) len=$size" $buf
			}

			$fbuf = New-Object byte[] $size
			$fbuf[0] = [byte]$id
			if ([Hid.Native]::HidD_GetFeature($handle, $fbuf, $size)) {
				Show-Bytes "FEATURE id=0x$('{0:x2}' -f $id) len=$size" $fbuf
			}
		}
	}

	[void][Hid.Native]::CloseHandle($handle)
}
