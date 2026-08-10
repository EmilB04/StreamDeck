# Dumps HIDP_CAPS for each ASUS HID interface: the exact input/output/feature
# report byte lengths Windows expects. Purely read-only — no reports are sent.
#
# Windows rejects any write whose length doesn't match OutputReportByteLength
# exactly, and node-hid can't read the descriptor, so this is how to find the
# right length instead of brute-forcing writes (which would send real commands).
#
#   node scripts/asus-probe.mjs --paths $env:TEMP\asus-paths.txt
#   powershell -File scripts/asus-caps.ps1 -PathsFile $env:TEMP\asus-paths.txt
param([Parameter(Mandatory = $true)][string]$PathsFile)

$ErrorActionPreference = 'Continue'

Add-Type -Namespace HidCaps -Name Native -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)]
public struct HIDP_CAPS {
    public ushort Usage;
    public ushort UsagePage;
    public ushort InputReportByteLength;
    public ushort OutputReportByteLength;
    public ushort FeatureReportByteLength;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)] public ushort[] Reserved;
    public ushort NumberLinkCollectionNodes;
    public ushort NumberInputButtonCaps;
    public ushort NumberInputValueCaps;
    public ushort NumberInputDataIndices;
    public ushort NumberOutputButtonCaps;
    public ushort NumberOutputValueCaps;
    public ushort NumberOutputDataIndices;
    public ushort NumberFeatureButtonCaps;
    public ushort NumberFeatureValueCaps;
    public ushort NumberFeatureDataIndices;
}

[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern IntPtr CreateFileW(string lpFileName, uint dwDesiredAccess, uint dwShareMode,
    IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

[DllImport("hid.dll", SetLastError = true)]
public static extern bool HidD_GetPreparsedData(IntPtr HidDeviceObject, out IntPtr PreparsedData);

[DllImport("hid.dll", SetLastError = true)]
public static extern int HidP_GetCaps(IntPtr PreparsedData, out HIDP_CAPS Capabilities);

[DllImport("hid.dll", SetLastError = true)]
public static extern bool HidD_FreePreparsedData(IntPtr PreparsedData);

[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool CloseHandle(IntPtr hObject);
'@

$FILE_SHARE_READ_WRITE = 0x00000003
$OPEN_EXISTING = 3

foreach ($path in Get-Content $PathsFile) {
	if (-not $path) { continue }

	# 0 desired access is enough for the descriptor and avoids the write-access
	# denial Windows applies to keyboard collections.
	$handle = [HidCaps.Native]::CreateFileW($path, 0, $FILE_SHARE_READ_WRITE, [IntPtr]::Zero, $OPEN_EXISTING, 0, [IntPtr]::Zero)
	if ($handle -eq [IntPtr]::Zero -or $handle -eq [IntPtr](-1)) {
		Write-Host "open failed: $path"
		continue
	}

	$pre = [IntPtr]::Zero
	if ([HidCaps.Native]::HidD_GetPreparsedData($handle, [ref]$pre)) {
		$caps = New-Object HidCaps.Native+HIDP_CAPS
		if ([HidCaps.Native]::HidP_GetCaps($pre, [ref]$caps) -eq 0x00110000) {
			$short = ($path -split '#')[1..2] -join '#'
			Write-Host ("up=0x{0:x4} u=0x{1:x2}  in={2,3}  out={3,3}  feat={4,3}   {5}" -f `
				$caps.UsagePage, $caps.Usage, $caps.InputReportByteLength, `
				$caps.OutputReportByteLength, $caps.FeatureReportByteLength, $short)
		}
		[void][HidCaps.Native]::HidD_FreePreparsedData($pre)
	}

	[void][HidCaps.Native]::CloseHandle($handle)
}
