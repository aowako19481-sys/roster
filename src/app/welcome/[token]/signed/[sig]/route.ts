import { pdfResponse } from "@/lib/pdf";
import { signedCopy } from "@/lib/portal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The agent's own copy of something they signed. The private link decides whose it is. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; sig: string }> }) {
  const { token, sig } = await params;
  const copy = UUID.test(sig) ? await signedCopy(token, sig) : null;
  if (!copy) return new Response("Not found", { status: 404 });
  return pdfResponse(copy.bytes, copy.name);
}
