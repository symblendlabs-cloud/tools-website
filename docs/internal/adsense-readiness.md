# AdSense Readiness — Internal Document

**Status:** Not activated. This document prepares the path to activation. No advertising is currently integrated.

---

## 1. Current Integration Status

Verified as of the date of this document:

- No AdSense script is present in `src/app/root.tsx` or any route module.
- No `adsbygoogle` reference exists anywhere in the codebase.
- No third-party advertising, analytics, or consent scripts are loaded.
- No manually placed ad units, ad slots, or ad components exist.
- No Content Security Policy is currently configured (deferred to Cloudflare Pages configuration).
- No cookie banner or consent mechanism is configured.
- No publisher ID is configured or hardcoded anywhere.

---

## 2. What Is Already Prepared

- Static prerendering produces HTML for every eligible public route.
- SEO metadata (`buildPageMeta`) emits titles, descriptions, canonical URLs, OpenGraph, Twitter, and JSON-LD on every page.
- The site uses a `SITE_ORIGIN` environment variable for canonical URLs and sitemap generation — no domain is hardcoded.
- Public navigation includes Tools, Categories, Guides, About, Contact, Privacy, and Terms.
- A privacy policy page exists that describes current behavior accurately and discloses future advertising intent without claiming anything unverified.
- A terms of service page exists with initial acceptable-use, IP, and liability terms, flagged for legal review.
- The privacy scanner (`private/scanner/scan-client-build.ts`) verifies that no private registry or content data leaks into `build/client/`.

---

## 3. What Remains Before Applying for AdSense

1. **Approved AdSense publisher ID** — must be supplied by the project owner.
2. **AdSense account approval** — must be confirmed by the project owner.
3. **Substantial content on directory pages** — currently one real tool, one real category, one real guide. AdSense review may consider the directory pages "thin." Additional implemented tools should be added before applying.
4. **Consent Management Platform (CMP)** — required for EEA, UK, and Switzerland visitors. Must be a Google-certified CMP. Selection is a project-owner decision.
5. **Privacy policy update** — the "future advertising" section must be converted to "current behavior" before the AdSense script is activated.
6. **Terms of service legal review** — current terms are initial; must be reviewed by counsel before production launch.
7. **Contact channel** — if AdSense review requires contact information, an approved contact channel must be provided by the project owner.
8. **Cloudflare Pages deployment configuration** — CSP and security headers should be reviewed for AdSense compatibility before activation.

---

## 4. Publisher ID Requirement

- The AdSense publisher ID (format: `ca-pub-XXXXXXXXXXXXXXXX`) must be supplied by the **project owner**.
- It must not be hardcoded in source code.
- It should be supplied via environment variable at build time (e.g., `VITE_ADSENSE_PUBLISHER_ID`).
- The `src/app/root.tsx` file will conditionally include the AdSense script tag only when this env var is present, so development builds are unaffected.

---

## 5. Auto Ads Activation Procedure (Future)

When the publisher ID and account approval are ready:

1. Add a build-time environment variable `VITE_ADSENSE_PUBLISHER_ID=ca-pub-XXXXXXXXXXXXXXXX`.
2. Modify `src/app/root.tsx` to conditionally emit:
   ```html
   <script
     async
     src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
     crossOrigin="anonymous"
   />