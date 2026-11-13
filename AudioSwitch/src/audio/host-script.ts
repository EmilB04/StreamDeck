/**
 * The program the audio host runs: C# over Windows' Core Audio COM interfaces,
 * compiled by PowerShell's `Add-Type` when the host starts.
 *
 * It lives in a string, not in a .ps1 or an .exe next to the plugin, for two
 * reasons. A script file is subject to the machine's execution policy and an
 * inline command is not; and a compiled helper would have to be built on
 * Windows, where everything else here builds on any OS.
 *
 * Constraints on the C#:
 *  - Windows PowerShell 5.1 compiles it with the C# 5 compiler, so no string
 *    interpolation, no `?.`, no `out var`.
 *  - No backticks and no `${`: this is a JavaScript template literal.
 *  - The whole script travels on the command line as base64 of UTF-16, which
 *    Windows caps at 32,767 characters. That leaves room for about 12,000
 *    characters of script (see `encodedCommand` and its test).
 *
 * Protocol, one line each way:
 *   list                 -> {"ok":true,"devices":[...]}
 *   set <role> <id>      -> the same reply, read after the switch
 *   anything that fails  -> {"ok":false,"error":"..."}
 * The host prints {"ready":true} once the compile is done. Output is pure
 * ASCII (everything else is \u-escaped), so no code page can mangle a name.
 */
const CSHARP = String.raw`
using System; using System.IO; using System.Text; using System.Runtime.InteropServices;
namespace AudioSwitch {
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator {}
[ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class PolicyClient {}
[StructLayout(LayoutKind.Sequential)] struct PKEY { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Explicit)] struct PV { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr p2; }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IEnum {
 [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out ICol c);
 [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDev d); }
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ICol {
 [PreserveSig] int GetCount(out int n);
 [PreserveSig] int Item(int i, out IDev d); }
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDev {
 [PreserveSig] int Activate(ref Guid id, int ctx, IntPtr p, out IntPtr o);
 [PreserveSig] int OpenPropertyStore(int access, out IStore s);
 [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
 [PreserveSig] int GetState(out int s); }
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IStore {
 [PreserveSig] int GetCount(out int n);
 [PreserveSig] int GetAt(int i, out PKEY k);
 [PreserveSig] int GetValue(ref PKEY k, out PV v); }
// Undocumented, but it is what the Sound control panel itself calls and has kept
// this shape since Windows 7. Only the last method is used; the ten before it
// are there to put it in the right vtable slot and are never called.
[ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IPolicy {
 [PreserveSig] int A(); [PreserveSig] int B(); [PreserveSig] int C(); [PreserveSig] int D(); [PreserveSig] int E();
 [PreserveSig] int F(); [PreserveSig] int G(); [PreserveSig] int H(); [PreserveSig] int I(); [PreserveSig] int J();
 [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role); }
public static class Host {
 [DllImport("ole32.dll")] static extern int PropVariantClear(ref PV v);
 const string DEV = "a45c254e-df1c-4efd-8020-67d146a850e0";
 const string IFACE = "026e516e-b814-414b-83cd-856d6fef4822";
 static string Q(string s) {
  var b = new StringBuilder("\"");
  foreach (char c in s ?? "") {
   if (c == '"' || c == '\\') b.Append('\\').Append(c);
   else if (c < 32 || c > 126) b.Append("\\u").Append(((int)c).ToString("x4"));
   else b.Append(c);
  }
  return b.Append('"').ToString();
 }
 static string Prop(IDev d, string fmtid, int pid) {
  IStore s; if (d.OpenPropertyStore(0, out s) != 0 || s == null) return "";
  PKEY k = new PKEY(); k.fmtid = new Guid(fmtid); k.pid = pid;
  PV v; if (s.GetValue(ref k, out v) != 0) return "";
  string r = v.vt == 31 ? Marshal.PtrToStringUni(v.p) : "";
  PropVariantClear(ref v); return r ?? "";
 }
 // PKEY_AudioEndpoint_FormFactor: a UINT saying what the endpoint physically is
 // (speakers, headphones, headset, HDMI display...). -1 when the driver gives none.
 static int FormFactor(IDev d) {
  IStore s; if (d.OpenPropertyStore(0, out s) != 0 || s == null) return -1;
  PKEY k = new PKEY(); k.fmtid = new Guid("1da5d803-d492-4edd-8c23-e0c0ffee7f0e"); k.pid = 0;
  PV v; if (s.GetValue(ref k, out v) != 0) return -1;
  int r = v.vt == 19 ? (int)(v.p.ToInt64() & 0xffffffff) : -1;
  PropVariantClear(ref v); return r;
 }
 static string DefaultId(IEnum e, int flow, int role) {
  IDev d; string id = "";
  if (e.GetDefaultAudioEndpoint(flow, role, out d) == 0 && d != null) d.GetId(out id);
  return id ?? "";
 }
 static string List() {
  var e = (IEnum)new Enumerator(); var b = new StringBuilder("{\"ok\":true,\"devices\":["); bool first = true;
  for (int flow = 0; flow < 2; flow++) {
   string def = DefaultId(e, flow, 1); string com = DefaultId(e, flow, 2);
   ICol c; int n = 0;
   if (e.EnumAudioEndpoints(flow, 1, out c) != 0 || c == null) continue;
   c.GetCount(out n);
   for (int i = 0; i < n; i++) {
    IDev d; string id;
    if (c.Item(i, out d) != 0 || d == null) continue;
    if (d.GetId(out id) != 0 || string.IsNullOrEmpty(id)) continue;
    if (!first) b.Append(','); first = false;
    b.Append("{\"id\":").Append(Q(id))
     .Append(",\"flow\":").Append(flow == 0 ? "\"output\"" : "\"input\"")
     .Append(",\"name\":").Append(Q(Prop(d, DEV, 14)))
     .Append(",\"description\":").Append(Q(Prop(d, DEV, 2)))
     .Append(",\"adapter\":").Append(Q(Prop(d, IFACE, 2)))
     .Append(",\"formFactor\":").Append(FormFactor(d))
     .Append(",\"isDefault\":").Append(id == def ? "true" : "false")
     .Append(",\"isCommunications\":").Append(id == com ? "true" : "false").Append('}');
   }
  }
  return b.Append("]}").ToString();
 }
 static void Set(string role, string id) {
  var p = (IPolicy)new PolicyClient();
  // "Default device" in Windows' own UI is two roles, console and multimedia;
  // setting only one leaves some applications on the old device.
  int[] roles = role == "communications" ? new int[] { 2 } : role == "default" ? new int[] { 0, 1 } : new int[] { 0, 1, 2 };
  foreach (int r in roles) {
   int hr = p.SetDefaultEndpoint(id, r);
   if (hr != 0) throw new Exception("SetDefaultEndpoint failed with 0x" + hr.ToString("x8"));
  }
 }
 static string Handle(string line) {
  try {
   if (line == "list") return List();
   string[] parts = line.Split(new char[] { ' ' }, 3);
   if (parts.Length == 3 && parts[0] == "set") { Set(parts[1], parts[2]); return List(); }
   return "{\"ok\":false,\"error\":\"unknown request\"}";
  } catch (Exception ex) { return "{\"ok\":false,\"error\":" + Q(ex.Message) + "}"; }
 }
 public static void Run() {
  var utf8 = new UTF8Encoding(false);
  var stdin = new StreamReader(Console.OpenStandardInput(), utf8);
  var stdout = new StreamWriter(Console.OpenStandardOutput(), utf8); stdout.AutoFlush = true;
  stdout.WriteLine("{\"ready\":true}");
  string line;
  while ((line = stdin.ReadLine()) != null) { line = line.Trim(); if (line.Length > 0) stdout.WriteLine(Handle(line)); }
 }
} }
`;

/**
 * The PowerShell around it. A compile failure has to reach the plugin as a line
 * it can log; left alone it would be an error record on a stream nobody reads,
 * and the plugin would see only a host that never became ready.
 */
export const HOST_SCRIPT = [
	"$ErrorActionPreference = 'Stop'",
	"$ProgressPreference = 'SilentlyContinue'",
	"try {",
	"Add-Type -TypeDefinition @'",
	CSHARP.trim(),
	"'@",
	"[AudioSwitch.Host]::Run()",
	"} catch {",
	"[Console]::Out.WriteLine('{\"fatal\":\"' + ($_.Exception.Message -replace '[^ -!#-\\[\\]-~]', ' ') + '\"}')",
	"exit 1",
	"}",
].join("\n");

/** The script in the form `powershell.exe -EncodedCommand` takes: base64 of UTF-16LE. */
export function encodedCommand(script: string = HOST_SCRIPT): string {
	return Buffer.from(script, "utf16le").toString("base64");
}
