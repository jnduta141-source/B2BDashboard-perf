/**
 * Letterhead used on printable Mboka documents (receipts, bank letters).
 * Keep this product-facing — no partner/aggregator names.
 */
export const MBOKA_LETTERHEAD = {
  product: "Mboka",
  tagline: "Business payments",
  email: "info@elementpay.net",
  offices: [
    {
      region: "United States",
      lines: [
        "Elementpay Inc.",
        "1007 N Orange St, 4th Floor",
        "Ste 1382, Wilmington, DE 19801",
      ],
    },
    {
      region: "Kenya",
      lines: [
        "Elementpay Inc.",
        "Fedha Plaza, Parklands Road",
        "Nairobi, Kenya",
      ],
    },
  ],
  /** Compact hero lines for narrow / mobile previews. */
  compactLines: ["info@elementpay.net", "Wilmington, DE · Nairobi, Kenya"],
  /**
   * Flat lines for desktop letterhead (region blocks separated by a blank line).
   * Kept for callers that still map `lines` directly.
   */
  lines: [
    "United States",
    "Elementpay Inc.",
    "1007 N Orange St, 4th Floor",
    "Ste 1382, Wilmington, DE 19801",
    "",
    "Kenya",
    "Elementpay Inc.",
    "Fedha Plaza, Parklands Road",
    "Nairobi, Kenya",
    "",
    "info@elementpay.net",
  ],
} as const;

/** Full wordmark (mark + “Mboka”) — inline so saved/printed files never lose the asset. */
export const MBOKA_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 166 44" width="148" height="39" role="img" aria-label="Mboka"><rect width="44" height="44" rx="11" fill="#3B2ED3"></rect><path d="M24 18H35V35H18V24Z" fill="#FFFFFF" fill-opacity="0.45"></path><path d="M9 9H26V20L20 26H9Z" fill="#FFFFFF"></path><g fill="none" stroke="#131126" stroke-width="3.4" stroke-linecap="square" stroke-linejoin="round"><path d="M57 32V14.4l8.5 10.6L74 14.4V32"></path><path d="M81 32V13h7.5a4.6 4.6 0 0 1 0 9.2H81M88.5 22.2h.8a4.9 4.9 0 0 1 0 9.8H81"></path><rect x="101" y="13" width="15.4" height="19" rx="5.6"></rect><path d="M124 13v19M124.4 23l10.2-9.8M125.6 22.6L135.6 32"></path><path d="M141.6 32l7.4-17.8 7.4 17.8M144.6 25.6h8.8"></path></g></svg>`;
