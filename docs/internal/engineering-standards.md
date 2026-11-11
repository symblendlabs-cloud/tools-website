# Tools Website — Engineering Standards

**Document status:** Approved baseline\
**Repository:** Private — `tools-website`\
**Applies to:** All shared components and all 241 tools\
**Architecture:** Modular monolith\
**Last updated:** 2026-11-11

---

## 1. Purpose and Scope

This document establishes mandatory engineering standards for the Tools website.

These standards apply to:

- Application infrastructure.
- Shared UI components.
- Tool Registry.
- Individual tool implementations.
- Shared utilities and hooks.
- Routing and rendering.
- Testing and build configuration.
- Security and privacy controls.

All implementation work must follow these standards.

Exceptions require explicit approval from the project architect before implementation.

## 2. Technology and Dependency Governance

Use the approved technology stack:

- React 19.
- React Router 8 — Framework Mode.
- TypeScript 6.
- Vite 8.
- Tailwind CSS 4.
- Zustand 5.
- Lucide React.
- Vitest 5.
- React Testing Library.
- Playwright.

Rules:

1. Use the exact dependency versions recorded in `package.json` and `package-lock.json`.
2. Do not independently upgrade, downgrade, replace, or remove dependencies.
3. Do not install new dependencies without architectural approval.
4. Prefer existing platform APIs and installed libraries.
5. Avoid introducing dependencies for functionality that can be implemented reliably with existing tools.
6. Keep production dependencies separate from development-only dependencies.
7. Preserve the lockfile and reproducible installation behavior.

## 3. TypeScript Standards

TypeScript must be used throughout application code.

Mandatory rules:

- Maintain strict TypeScript checking.
- Avoid `any`.
- Prefer explicit and accurate types.
- Use `unknown` when a value's type is genuinely unknown.
- Narrow types before operating on unknown data.
- Define reusable interfaces and types where appropriate.
- Avoid unnecessary type assertions.
- Do not suppress TypeScript errors merely to make builds pass.
- Do not use `@ts-ignore` without explicit approval.
- Keep public interfaces small and understandable.

All production code must pass the TypeScript validation command.

## 4. React Component Standards

Use functional React components and hooks.

Rules:

1. Components must have clear, focused responsibilities.
2. Reuse shared components when appropriate.
3. Avoid unnecessarily large components.
4. Avoid duplicated application-shell implementations.
5. Follow React hook rules.
6. Use stable keys when rendering collections.
7. Avoid unnecessary state and effects.
8. Keep rendering logic predictable.
9. Avoid unnecessary memoization.
10. Do not introduce class components.

Components should remain independently understandable and maintainable.

## 5. Folder and Module Organization

Maintain clear separation between:

- Application infrastructure.
- Shared components.
- Shared hooks.
- Shared utilities.
- Tool metadata.
- Individual tool implementations.
- Tests.
- Internal documentation.

Rules:

1. Tool implementations must remain independently maintainable.
2. Shared functionality belongs in approved shared modules.
3. Tool metadata must remain separate from tool implementation code.
4. Individual tools must not directly depend on other individual tool implementations.
5. Avoid circular dependencies.
6. Avoid creating unnecessary abstractions or deeply nested folder structures.
7. Keep internal documentation under `docs/internal/`.

The final folder structure must be approved before large-scale tool implementation.

## 6. Tool Implementation Contract

Every tool must follow a consistent implementation contract.

Each tool should have:

- A unique identifier.
- A unique URL slug.
- A display name.
- A concise description.
- An approved category.
- Relevant tags.
- A dedicated implementation module.
- Appropriate input and output handling.
- Loading, empty, and error states where applicable.
- Accessible controls.
- Appropriate automated tests.

Rules:

1. Tool implementations must be independently loadable.
2. Tool modules must be lazy-loaded.
3. Tool implementations must not be eagerly imported by the homepage.
4. Tool metadata must not require loading the implementation.
5. One tool must not directly import another tool's implementation.
6. Shared functionality must use approved shared modules.
7. Tool-specific logic must remain inside the relevant tool module.
8. Do not introduce backend dependencies without architectural approval.

## 7. State Management

Use local React state by default.

Use Zustand only when state genuinely needs to be shared across independent application components or features.

Rules:

- Avoid global state for temporary component interactions.
- Keep state as close as possible to its consumers.
- Avoid duplicating the same state in multiple stores.
- Keep store responsibilities focused.
- Do not use Zustand merely to avoid passing a small number of props.
- Avoid unnecessary persistence of user inputs.
- Never persist sensitive user-provided information without explicit architectural approval.

## 8. Styling and UI Consistency

Use Tailwind CSS 4 and the approved shared design system.

Rules:

1. Reuse shared UI components.
2. Maintain consistent spacing, typography, colors, and interaction patterns.
3. Support responsive layouts.
4. Avoid unnecessary custom CSS.
5. Avoid conflicting styling approaches.
6. Use semantic HTML.
7. Maintain visible keyboard focus.
8. Ensure readable contrast.
9. Keep tool interfaces visually consistent.
10. Do not introduce another component library without approval.

Individual tools must not create independent design systems.

## 9. Input Validation and Error Handling

All user-provided inputs must be validated appropriately.

Rules:

- Validate data before processing.
- Handle malformed input safely.
- Provide useful and understandable error messages.
- Avoid exposing internal implementation details to users.
- Handle empty input and unexpected input types.
- Prevent invalid operations from causing application crashes.
- Use predictable error-handling patterns.
- Avoid silently discarding user input.
- Do not treat client-side validation as a security boundary for any future server-side operation.

Errors must be handled at the appropriate component or application boundary.

## 10. Accessibility

Accessibility is mandatory.

All tools and shared components must:

1. Support keyboard navigation.
2. Use semantic HTML elements.
3. Provide accessible labels for form controls.
4. Maintain visible focus indicators.
5. Provide appropriate accessible names for icon-only buttons.
6. Communicate validation errors clearly.
7. Avoid relying exclusively on color to communicate information.
8. Support responsive layouts and usable touch targets.
9. Use ARIA attributes only where appropriate.
10. Avoid unnecessary accessibility regressions.

Automated accessibility checks should be included where practical, supplemented by manual keyboard and screen-reader testing.

## 11. Performance Standards

Performance must be considered throughout development.

Mandatory rules:

- Lazy-load individual tool implementations.
- Avoid unnecessary dependencies.
- Minimize initial JavaScript.
- Avoid unnecessary component re-rendering.
- Avoid expensive synchronous operations on the main thread when alternatives are appropriate.
- Use browser APIs efficiently.
- Avoid unnecessary network requests.
- Avoid loading tool-specific libraries on unrelated pages.
- Optimize assets where applicable.
- Measure performance rather than relying on assumptions.

Performance budgets and thresholds must be established and approved before being treated as release requirements.

## 12. Testing Standards

Use the approved testing stack:

- Vitest for unit tests.
- React Testing Library for component behavior.
- Playwright for browser-level testing.

Testing requirements:

1. Test important utility functions.
2. Test component behavior.
3. Test input validation.
4. Test error handling.
5. Test important user interactions.
6. Test tool-specific functionality.
7. Test representative responsive behavior.
8. Test critical navigation and routing.
9. Verify production builds.
10. Run appropriate regression tests after changes.

The first ten representative tools must validate the shared testing patterns before implementation expands to the remaining tools.

No tool should be considered complete solely because it renders successfully.

## 13. Security and Privacy

The browser-first privacy architecture is mandatory.

Rules:

1. User-provided files must remain in the browser.
2. Do not upload user files to application servers.
3. Do not transmit filenames or file contents to analytics.
4. Never send passwords, tokens, credentials, or sensitive inputs to analytics.
5. Avoid collecting unnecessary user information.
6. Never commit real credentials or secrets.
7. Keep internal documentation out of production output.
8. Do not expose private Tool Registry information in public content or client-side bundles.
9. Validate untrusted input before processing.
10. Use safe browser APIs and avoid unsafe HTML injection.
11. Do not introduce backend processing without architectural approval.
12. Clearly communicate relevant processing and privacy behavior to users.

## 14. Code Quality and Review

All implementation changes must:

- Follow the approved architecture.
- Use clear and descriptive naming.
- Avoid unnecessary duplication.
- Avoid dead code.
- Avoid unexplained workarounds.
- Avoid unnecessary comments that merely repeat the code.
- Preserve existing functionality unless a change is explicitly approved.
- Pass relevant tests and build validation.
- Be reviewed before integration.

Implementation assistants must report blockers rather than independently inventing architectural solutions.

## 15. Architecture Governance and Exceptions

These standards are mandatory for all shared components and all 241 tools.

Only the project architect may approve exceptions.

Implementation assistants must:

1. Follow the approved requirements exactly.
2. Avoid independent architecture decisions.
3. Avoid unauthorized dependency changes.
4. Stop when requirements conflict.
5. Report incomplete or ambiguous requirements.
6. Avoid expanding the scope of assigned work.
7. Never silently change established engineering standards.

Any proposed exception must document:

- The affected requirement.
- The reason for the exception.
- The affected tools or components.
- The expected technical consequences.
- The proposed alternative.

Implementation must not proceed until the exception is explicitly approved.

---

**End of engineering standards draft.**
