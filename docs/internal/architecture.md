# Tools Website — Technical Architecture

**Document status:** Approved baseline\
**Repository:** Private — `tools-website`\
**Architecture type:** Modular monolith\
**Last updated:** 2026-11-11

---

## 1. Product Overview

Tools is a free, browser-first platform providing approximately 241 developer and IT utilities.

Primary objectives:

- Fast, responsive browser-based tools.
- Independent and modular tool implementations.
- Search-engine-friendly public pages.
- Minimal infrastructure and operational complexity.
- Privacy-preserving client-side processing.
- A scalable architecture that supports incremental tool development.

## 2. Repository Architecture

Two separate repositories are maintained.

### 2.1 Private application repository

`tools-website`

Responsibilities:

- Application source code.
- Shared application shell.
- Tool implementations.
- Private Tool Registry.
- Internal technical documentation.
- Build and deployment configuration.
- Tests and development tooling.

Private information must never be published through the public application.

### 2.2 Public content repository

`tools-content`

Responsibilities:

- Public tool descriptions.
- Educational and help content.
- Public FAQs.
- Search-engine-oriented informational content.

It must not contain private business intelligence, internal implementation notes, or confidential registry information.

## 3. Application Architecture

Use a modular monolith.

The application has:

1. One shared application shell.
2. One central tool directory.
3. Category and discovery pages.
4. Independently implemented tool modules.
5. Shared UI and utility components.

Each tool must remain independently maintainable and load only when needed.

Tool implementations must be lazy-loaded rather than included eagerly in the initial homepage bundle.

## 4. Technology Stack

Approved foundation:

- React 19
- React Router 8 — Framework Mode
- TypeScript 6
- Vite 8
- Tailwind CSS 4
- Zustand 5
- Lucide React
- Vitest 5
- Playwright 1

Use the exact dependency versions already recorded in `package.json` and `package-lock.json`.

Do not independently upgrade or replace dependencies.

## 5. Rendering and Deployment

Approved rendering strategy:

- React Router Framework Mode.
- `ssr: false`.
- Static prerendering of explicitly enumerated public routes.
- Cloudflare Pages deployment.

The current root-only prerender configuration is temporary.

The final prerender implementation must enumerate:

- Homepage.
- Tool directory.
- Category pages.
- All 241 tool pages.
- Public help and educational pages.

Route enumeration must use the private Tool Registry and public content data without importing tool implementations.

Do not consider the temporary root-only configuration production-ready.

## 6. Tool Registry

The private Tool Registry is the source of truth for tool definitions.

It will contain the information needed to manage:

- Tool identifiers and slugs.
- Names and descriptions.
- Curated categories.
- Tags.
- Internal technical implementation metadata.
- Private business intelligence.

Private business intelligence must never enter public content files or client-side bundles.

Public content must be separated from internal registry information.

## 7. Browser-First Processing and Privacy

The platform must prioritize local browser processing.

Rules:

- User-provided files remain in the browser.
- Do not upload user files to application servers.
- Do not transmit filenames or file contents to analytics.
- Never send passwords, tokens, credentials, or sensitive inputs to analytics.
- Avoid introducing backend processing where browser APIs can perform the task.
- Clearly communicate processing and privacy behavior to users.

No user accounts, database, or cloud file-processing infrastructure is part of the approved initial architecture.

## 8. Shared UI Architecture

Shared components should provide:

- Application layout.
- Navigation.
- Tool directory.
- Category navigation.
- Tool page structure.
- Theme support.
- Accessible interaction patterns.
- Consistent responsive behavior.

Individual tools should reuse shared components rather than implementing independent application shells.

## 9. Initial Validation Strategy

Build and validate the first ten representative tools before expanding to the remaining tools.

Initial shortlist:

1. JSON/YAML converter.
2. Regex lookaround debugger.
3. CSV cleaner/converter.
4. Kubernetes manifest YAML validator.
5. Kafka partition calculator.
6. WASM module inspector.
7. WASM memory layout visualizer.
8. OAuth2 token debugger.
9. Git patch diff apply simulator.
10. Prisma schema ERD visualizer.

Validate architecture, performance, privacy, accessibility, and testing patterns before scaling.

## 10. Testing Strategy

Use:

- Vitest for unit and component tests.
- React Testing Library for component behavior.
- Playwright for browser-level tests.

Validate representative tools before implementing the remaining tool catalog.

Production builds and browser checks must pass before deployment.

## 11. Analytics and Monetization

After the initial ten tools have been deployed and validated, introduce:

- Google Analytics 4.
- Google Search Console.
- Google AdSense, subject to approval.
- Cloudflare analytics.

Analytics must respect the privacy restrictions in Section 7.

Do not build a custom analytics or administration dashboard without a separately approved requirement.

## 12. Documentation and Security

This repository is private.

Internal documentation belongs under:

`docs/internal/`

Rules:

- Internal documentation must remain in the private repository.
- It must not be copied into the public content repository.
- It must not be included in production output.
- Never commit real secrets, credentials, or environment files.
- Keep `.env.example` free of real credentials.

## 13. Architecture Governance

All architectural decisions require approval from the project architect.

Implementation assistants must:

- Follow explicitly approved technical decisions.
- Use only approved dependencies and versions.
- Avoid independent architectural changes.
- Stop when requirements conflict or are incomplete.
- Report blockers rather than inventing solutions.

Architecture changes must be reviewed before implementation.

---

**End of approved architecture baseline.**