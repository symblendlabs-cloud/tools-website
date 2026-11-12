# Security and Privacy Standards

**Document status:** Proposed baseline  
**Scope:** Entire Tools website, all 241 tools, shared components, repositories, build pipeline and deployment process.

## 1. Core Privacy Principle

The production website is publicly accessible. All source repositories, internal datasets, implementation details, schemas, internal documentation and credentials must remain private.

The website is the only intended public interface through which visitors access tools and approved information.

Nothing is published independently without explicit approval.

Information required for public website functionality may be delivered through the website. Such information must be treated as publicly inspectable and potentially copyable.

## 2. Repository Privacy

The following repositories must remain private:

- `tools-website`
- `tools-content`

The complete Tool Registry, tool metadata, schemas, implementation paths, internal documentation and educational content source files must remain in private repositories.

No repository containing internal project data may be made public without explicit authorization.

## 3. Tool Registry Protection

The private Tool Registry is the authoritative source of truth for all 241 tools.

It may contain:

- Stable tool IDs.
- Internal tool metadata.
- Categories and routing information.
- Implementation module paths.
- Internal status and development information.
- References to schemas and other internal resources.

The complete registry must never be exposed through:

- Public repository files.
- Downloadable registry datasets.
- Public endpoints exposing the complete registry.
- Browser-accessible imports of the private registry.
- Production source maps.
- Unfiltered production build assets.

Individual public pages may receive only the explicitly approved information needed to render and operate those pages.

Public stable identifiers and URL slugs may be used where necessary. They must not expose unrelated internal registry metadata.

## 4. Public Website Output

Only explicitly allowlisted information necessary for public website functionality may enter production output.

Examples include:

- Public tool names.
- Public descriptions.
- Approved categories.
- Public URL slugs.
- User-facing instructions.
- Necessary interface configuration.
- Approved educational content.

Internal notes, implementation paths, development status, confidential identifiers and other internal metadata must not be exposed.

The website must not provide a separate public bulk-data download or endpoint exposing the complete tool catalogue or internal dataset.

## 5. Content Repository Protection

The `tools-content` repository must remain private.

It contains source material for educational content, help articles, tutorials and references.

Content must pass through the approved build-time processing pipeline before appearing on the public website.

The public website may display explicitly approved content, but the repository and its complete source dataset must remain private.

Once content is displayed publicly, visitors may inspect or copy it. Repository privacy does not make displayed content confidential.

## 6. Build-Time Security

The build pipeline must:

1. Read the private Tool Registry.
2. Read the private content source repository.
3. Validate schemas and references.
4. Validate stable tool IDs.
5. Apply explicit public-field allowlists.
6. Generate only necessary public website data.
7. Keep implementation modules independently lazy-loaded.
8. Reject accidental exposure of private fields.
9. Fail the build when required security validations fail.
10. Ensure private source files are never copied wholesale into production output.

Build infrastructure may access private repositories using appropriately restricted credentials.

Repository access credentials must remain in protected build or deployment configuration and must never enter browser assets, generated public data or published artifacts.

## 7. Browser Security Limitations

The website uses browser-based tools.

Any information or JavaScript delivered to a visitor's browser can potentially be inspected, copied or extracted.

Therefore:

- Never place secrets in browser code.
- Never include confidential data in client-side assets.
- Never assume private source code makes browser-delivered code secret.
- Do not claim that displayed information is impossible to copy.
- Keep information that must remain genuinely confidential outside the browser.

Repository privacy and browser-delivered data privacy are separate security requirements.

## 8. Credentials and Secrets

The following must never enter public production assets:

- API keys.
- Access tokens.
- Passwords.
- Private signing keys.
- Deployment credentials.
- Database credentials.
- Private environment variables.
- Private repository access tokens.

Secrets must be managed through appropriate private build and deployment configuration.

Use restricted permissions, avoid unnecessary credential access and rotate credentials when exposure is suspected.

## 9. Production Deployment Boundary

The public deployment must contain only approved production website assets.

For the approved static deployment architecture:

- `build/client` is the intended public deployment directory.
- Build-only server artifacts must not be published unless separately reviewed and explicitly approved.
- Production source maps must remain disabled unless explicitly approved.
- Private documentation, source files, registry files, schemas and development artifacts must not be deployed.

The deployment configuration must be verified to ensure that the correct directory is published.

## 10. Production Leakage Prevention

Automated production-build checks must verify:

- No complete Tool Registry is present.
- No private content-source dataset is exposed.
- No internal implementation paths are present.
- No internal notes or development metadata are present.
- No credentials or secrets are embedded.
- No prohibited source maps or private files are published.
- Only the approved deployment directory is published.

Security validation must include appropriate secret scanning, dependency review, production artifact inspection and targeted private-field checks.

Pattern-based scans alone are not sufficient to establish that production output contains no private information.

A failed mandatory security check must fail the production build or deployment.

## 11. Change Control

Any change that weakens repository privacy, production data protection, secret management, deployment restrictions or public-field allowlisting requires explicit architect approval.

No developer or coding assistant may independently weaken these requirements.

## 12. Mandatory Scope

These standards apply to:

- All 241 tools.
- All future tools.
- Shared components.
- Tool Registry and content processors.
- Build and deployment configuration.
- Production website output.
- Testing and validation pipelines.

**Final principle:** The website is public. Its source repositories and internal data remain private. Only explicitly approved information necessary for public website functionality may be exposed.