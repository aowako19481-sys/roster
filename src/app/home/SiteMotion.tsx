"use client";

import { useEffect } from "react";
import { startSite } from "./site-motion";

/** Switches on the landing page's movement once the page is in the browser. */
export function SiteMotion() {
  useEffect(() => startSite(), []);
  return null;
}
