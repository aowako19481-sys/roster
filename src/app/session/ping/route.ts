/**
 * The page calls this every few minutes while the person is actively using
 * Kinu, so reading a long page does not count as being away. The proxy does
 * the real work (it refreshes the activity clock on every signed-in request).
 */
export function POST() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
