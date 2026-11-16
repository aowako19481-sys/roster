/**
 * Who runs this site. Shown in the footer and used throughout the policy
 * pages. Fill in the legal name, address and contact email before launch;
 * anything left empty is simply not shown.
 */
export const COMPANY = {
  legalName: "",          // e.g. "Kinu Technologies LLC"
  address: "",            // e.g. "123 Example St, New York, NY 10001"
  contactEmail: "hello@kinu.pro",
  governingState: "",     // e.g. "New York"
};

/** The public address of the site, for search engines. Change it when a domain is connected. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://kinu.pro").replace(/\/+$/, "");

/** Prices per agent seat per month, shown on the public site. Everything is included at one price. */
export const PRICES = { monthly: 15.99, annual: 13.5, monthlyMinimum: 500, adminSeat: 49.5 };
