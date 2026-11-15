import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/company";

/** Search engines may read the public website and nothing else. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/$", "/legal"], disallow: ["/"] }], sitemap: `${SITE_URL}/sitemap.xml` };
}
