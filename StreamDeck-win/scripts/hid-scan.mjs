// Debug helper: lists connected HID devices. Run on Windows (after `npm run sync-deps`)
// with `node scripts/hid-scan.mjs [vendorIdHex]`, e.g. `node scripts/hid-scan.mjs 0b05` for Asus.
// Used to find the right vendorId/productId/usagePage when wiring up a new device provider.
import HID from "node-hid";

const filterVendor = process.argv[2] ? parseInt(process.argv[2], 16) : undefined;

for (const d of HID.devices()) {
	if (filterVendor !== undefined && d.vendorId !== filterVendor) continue;
	console.log(
		`vendorId=0x${d.vendorId.toString(16).padStart(4, "0")} productId=0x${d.productId.toString(16).padStart(4, "0")} ` +
			`usagePage=0x${(d.usagePage ?? 0).toString(16)} usage=0x${(d.usage ?? 0).toString(16)} ` +
			`product="${d.product ?? ""}" path=${d.path}`,
	);
}
