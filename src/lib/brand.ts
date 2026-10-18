/**
 * Company identity, in one place.
 *
 * The logo is the company's own artwork, served as a static asset from
 * `/public`. It is a plain vector file: paths and polygons only, no scripts, no
 * external references.
 */

export const brand = {
  /** Registered company name, as it should read in the UI and on documents. */
  companyName: "Radwa Gulf and Co",
  /** Short form for tight spaces (breadcrumb root, print footers). */
  shortName: "Radwa Gulf",
  /** What this system does, shown under the logo. */
  tagline: "Tender & Work Order Management",
  /** Browser tab and bookmark title. Short, because tabs are narrow. */
  documentTitle: "Radwa Gulf & Co ERP",
  /** Line under the logo on printed documents — matches the logo artwork. */
  documentSubtitle: "Engineering & Construction",
  logo: {
    src: "/radwa-gulf-logo.svg",
    /** Intrinsic viewBox of the supplied artwork. */
    width: 251,
    height: 55,
    alt: "Radwa Gulf and Co",
  },
} as const;
