import TurndownService from "turndown";

export const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });

/** Keyword patterns that indicate a useful business page */
export const KEYWORD_PATTERNS = /about|contact|team|leadership|service|solution|pricing|news|press|blog|career|company|location|office|faq|invest|partner/i;

/** Calendar / booking link patterns */
export const MEETING_PATTERNS = /calendly\.com|hubspot\.com\/meetings|tidycal\.com|savvycal\.com|wa\.me/i;

/** Fallback flat list used if sitemap + homepage spider both fail */
export const FALLBACK_PATHS: Array<{ path: string; label: string }> = [
  { path: "",            label: "Homepage" },
  { path: "/about",      label: "About" },
  { path: "/about-us",   label: "About Us" },
  { path: "/team",       label: "Team" },
  { path: "/leadership", label: "Leadership" },
  { path: "/contact",    label: "Contact" },
  { path: "/contact-us", label: "Contact Us" },
  { path: "/services",   label: "Services" },
  { path: "/solutions",  label: "Solutions" },
  { path: "/pricing",    label: "Pricing" },
  { path: "/news",       label: "News" },
  { path: "/press",      label: "Press" },
  { path: "/blog",       label: "Blog" },
  { path: "/careers",    label: "Careers" },
  { path: "/company",    label: "Company" },
  { path: "/locations",  label: "Locations" },
  { path: "/offices",    label: "Offices" },
  { path: "/faq",        label: "FAQ" },
  { path: "/investors",  label: "Investors" },
  { path: "/partners",   label: "Partners" },
];

export const FETCH_TIMEOUT_MS = 10_000;
export const PAGE_DELAY_MS    = 300;
export const MAX_PAGES        = 10;

export const BROWSER_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
} as const;
