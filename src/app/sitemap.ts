import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/company";
import { LEGAL_PAGES } from "@/lib/legal";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, priority: 1 },
    { url: `${SITE_URL}/legal`, priority: 0.3 },
    ...LEGAL_PAGES.map((page) => ({ url: `${SITE_URL}/legal/${page.slug}`, priority: 0.3 })),
  ];
}
