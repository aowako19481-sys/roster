/**
 * Who runs this site. Shown in the footer and used throughout the policy
 * pages. Fill in the legal name, address and contact email before launch;
 * anything left empty is simply not shown.
 */
export const COMPANY = {
  legalName: "",          // e.g. "Kinu Technologies LLC"
  address: "",            // e.g. "123 Example St, New York, NY 10001"
  contactEmail: "",       // e.g. "hello@yourdomain.com"
  governingState: "",     // e.g. "New York"
};

/** The public address of the site, for search engines. Change it when a domain is connected. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://kinu-snowy.vercel.app").replace(/\/+$/, "");

/** Starting prices per agent per month, shown on the public site. */
export const PRICES = { ops: 2.5, finance: 2.5, retention: 4, shield: 1, compliance: 1, everything: 9.5, monthlyMinimum: 500, setupFrom: 1500 };
