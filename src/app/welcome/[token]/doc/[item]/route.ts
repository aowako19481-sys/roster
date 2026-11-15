import { NextResponse } from "next/server";
import { packetFileUrl } from "@/lib/portal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens the brokerage's document for one packet item. The token decides
 * whose brokerage it is; the link handed back works for one minute.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; item: string }> }) {
  const { token, item } = await params;
  const url = UUID.test(item) ? await packetFileUrl(token, item) : null;
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url, { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" } });
}
