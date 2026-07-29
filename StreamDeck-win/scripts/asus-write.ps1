# Tests whether the ROG receiver's vendor collection can be written at all, and
# by which mechanism.
#
# node-hid's write goes through WriteFile (an interrupt OUT transfer) and fails
# with ERROR_INVALID_PARAMETER even at the descriptor's exact 64-byte output
# length. Two candidate explanations this script separates:
#   1. hidapi fell back to a read-only handle because something else (Armoury
#      Crate) holds the device -> the GENERIC_WRITE open below fails too.
#   2. The device wants SET_REPORT rather than an interrupt write -> WriteFile
#      fails but HidD_SetOutputReport succeeds.
param(
	[Parameter(Mandatory = $true)][string]$PathsFile,
	[string]$Bytes = "00 12 07",
	# Try every report ID at the descriptor's output length. ERROR_INVALID_PARAMETER
	# (87) is what an unknown report ID looks like, so the one that doesn't return
	# it is the real one.
	[switch]$IdSweep,
	[int]$ReportLength = 64
)

$ErrorActionPreference = 'Continue'

Add-Type -Namespace HidWrite -Name Native -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern IntPtr CreateFileW(string lpFileName, uint dwDesiredAccess, uint dwShareMode,
    IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

[DllImport("hid.dll", SetLastError = true)]
public static extern bool HidD_SetOutputReport(IntPtr HidDeviceObject, byte[] ReportBuffer, int ReportBufferLength);

[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool WriteFile(IntPtr hFile, byte[] lpBuffer, uint nNumberOfBytesToWrite,
    out uint lpNumberOfBytesWritten, IntPtr lpOverlapped);

[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool CloseHandle(IntPtr hObject);
'@

# Cast explicitly: PowerShell's -bor on these turns into a negative Int32, which
# then won't marshal to the UInt32 parameter.
$GENERIC_READ = [uint32]0x80000000
$GENERIC_READ_WRITE = [uint32]0xC0000000
$FILE_SHARE_READ_WRITE = 0x00000003
$OPEN_EXISTING = 3
$REPORT_LEN = $ReportLength

$payload = @($Bytes -split '\s+' | ForEach-Object { [byte]("0x$_") })

foreach ($path in Get-Content $PathsFile) {
	# Only the MI_02 vendor collections declare output reports.
	if (-not $path -or $path -notmatch 'MI_02') { continue }
	Write-Host "=== $(($path -split '#')[1..2] -join '#')"

	foreach ($mode in @('read+write', 'read-only')) {
		$access = if ($mode -eq 'read+write') { $GENERIC_READ_WRITE } else { $GENERIC_READ }
		$handle = [HidWrite.Native]::CreateFileW($path, $access, $FILE_SHARE_READ_WRITE, [IntPtr]::Zero, $OPEN_EXISTING, 0, [IntPtr]::Zero)

		if ($handle -eq [IntPtr]::Zero -or $handle -eq [IntPtr](-1)) {
			Write-Host "    open $mode : FAILED (err $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
			continue
		}
		Write-Host "    open $mode : ok"

		if ($mode -eq 'read+write' -and $IdSweep) {
			for ($id = 0; $id -le 255; $id++) {
				$buf = New-Object byte[] $REPORT_LEN
				$buf[0] = [byte]$id
				$buf[1] = 0x12
				$buf[2] = 0x07

				if ([HidWrite.Native]::HidD_SetOutputReport($handle, $buf, $REPORT_LEN)) {
					Write-Host ("    SetOutputReport id=0x{0:x2}: SUCCESS" -f $id)
				} else {
					$err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
					if ($err -ne 87) { Write-Host ("    SetOutputReport id=0x{0:x2}: err {1}" -f $id, $err) }
				}
			}
			[void][HidWrite.Native]::CloseHandle($handle)
			continue
		}

		if ($mode -eq 'read+write') {
			$buf = New-Object byte[] $REPORT_LEN
			for ($i = 0; $i -lt $payload.Length; $i++) { $buf[$i] = $payload[$i] }

			if ([HidWrite.Native]::HidD_SetOutputReport($handle, $buf, $REPORT_LEN)) {
				Write-Host "    HidD_SetOutputReport($REPORT_LEN): SUCCESS"
			} else {
				Write-Host "    HidD_SetOutputReport($REPORT_LEN): failed (err $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
			}

			$written = 0
			if ([HidWrite.Native]::WriteFile($handle, $buf, $REPORT_LEN, [ref]$written, [IntPtr]::Zero)) {
				Write-Host "    WriteFile($REPORT_LEN): SUCCESS ($written bytes)"
			} else {
				Write-Host "    WriteFile($REPORT_LEN): failed (err $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
			}
		}

		[void][HidWrite.Native]::CloseHandle($handle)
	}
}
