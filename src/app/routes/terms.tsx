import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/terms";

export function meta({}: Route.MetaArgs) {
  return buildPageMeta({
    title: "Terms of Service",
    description: "Terms of Service for the Chifral website and its browser-based tools.",
    path: "/terms",
  });
}

interface SectionHeadingProps {
  id: string;
  children: string;
}

function SectionHeading({ id, children }: SectionHeadingProps) {
  return (
    <h2
      id={id}
      className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl mt-10 mb-4"
    >
      {children}
    </h2>
  );
}

export default function TermsPage() {
  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", to: "/" },
    { label: "Terms" },
  ];

  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mt-6 max-w-3xl">
          <PageHeader
            title="Terms of Service"
            description="Last updated: November 13, 2026 · Effective date: November 13, 2026"
          />

          <div className="mt-8 space-y-4 text-base text-muted-foreground leading-relaxed">
            <p>
              Welcome to Chifral. These Terms of Service govern your access to
              and use of the Chifral website and its browser-based tools. By
              accessing or using Chifral, you agree to these terms. If you do not
              agree, please discontinue using the website.
            </p>

            <SectionHeading id="about-chifral">1. About Chifral</SectionHeading>
            <p>
              Chifral is an independently operated website providing browser-based
              utilities and tools for general, educational and professional use.
            </p>
            <p>
              The website is currently operated by an individual and is not
              represented as a registered company or corporation. References to
              "Chifral", "we", "us" or "our" in these terms refer to the Chifral
              website and its individual operator.
            </p>

            <SectionHeading id="description-services">
              2. Description of Services
            </SectionHeading>
            <p>
              Chifral provides browser-based technology tools for general,
              educational, and professional use. The specific tools, features,
              and functionality available on the website may evolve over time.
            </p>

            <SectionHeading id="acceptable-use">3. Acceptable Use</SectionHeading>
            <p>
              You agree to use Chifral only for lawful purposes and in accordance
              with these terms.
            </p>
            <p>You must not:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the website for unlawful, fraudulent or harmful activities.</li>
              <li>
                Attempt to gain unauthorized access to the website, its
                infrastructure or related systems.
              </li>
              <li>
                Interfere with the website's availability, security or normal
                operation.
              </li>
              <li>Introduce malicious code or attempt to exploit vulnerabilities.</li>
              <li>Abuse, overload or disrupt website services.</li>
              <li>
                Use automated methods to access the website in ways that violate
                applicable laws or interfere with its operation.
              </li>
              <li>
                Copy, distribute or exploit website content in violation of
                applicable intellectual property rights.
              </li>
            </ul>
            <p>
              You are responsible for ensuring that your use of Chifral complies
              with the laws applicable to you.
            </p>

            <SectionHeading id="tool-inputs-outputs">
              4. Tool Inputs and Outputs
            </SectionHeading>
            <p>
              You remain responsible for the information, text, files or other
              inputs you provide to the tools, as well as the outputs you
              generate.
            </p>
            <p>
              Where a tool performs processing entirely within your browser, the
              relevant processing takes place locally on your device for that
              operation. However, processing and data handling may differ between
              tools.
            </p>
            <p>
              Tool outputs are provided for convenience and practical purposes.
              You should independently verify results where accuracy, security or
              reliability is critical before using them in production systems or
              important decisions.
            </p>

            <SectionHeading id="availability-changes">
              5. Availability and Changes
            </SectionHeading>
            <p>
              We aim to keep Chifral accessible and functional. However, we do
              not guarantee uninterrupted availability or continuous operation.
            </p>
            <p>
              We may, at our discretion, add, modify or remove tools and features,
              update website content, temporarily suspend services for
              maintenance, or restrict access where necessary to protect the
              website or comply with applicable requirements.
            </p>

            <SectionHeading id="intellectual-property">
              6. Intellectual Property
            </SectionHeading>
            <p>
              The Chifral website, including its branding, visual design, original
              written content, source code and other materials, is protected by
              applicable intellectual property laws.
            </p>
            <p>
              You may access and use the website and its tools for their intended
              purposes. Unless permitted by applicable law or expressly authorized
              by us, you may not reproduce or redistribute substantial portions of
              the website, republish original website content as your own, or
              commercially exploit Chifral's branding or visual identity.
            </p>
            <p>
              Your own input and data remain yours. Nothing in these terms
              transfers ownership of your original content to Chifral.
            </p>

            <SectionHeading id="third-party-services">
              7. Third-Party Services and Advertising
            </SectionHeading>
            <p>
              Chifral uses Cloudflare for website hosting and infrastructure.
              Chifral also uses Google Tag Manager (GTM) to manage website tags.
              Tags loaded through GTM may collect information or set cookies
              depending on their configuration.
            </p>
            <p>
              The website may also use additional third-party services to support
              analytics, advertising, and other operational requirements as it
              evolves.
            </p>
            <p>
              These services may include providers that operate independently of
              Chifral and may have their own terms, policies and data-handling
              practices. Chifral does not control the content, availability or
              policies of external websites and services. Your interactions with
              those services are subject to their respective terms and policies.
            </p>
            <p>
              Please review our{" "}
              <a
                href={`${import.meta.env.BASE_URL}privacy/`}
                className="text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary-hover hover:decoration-primary-hover"
              >
                Privacy Policy
              </a>{" "}
              for information about third-party services and applicable privacy
              choices.
            </p>

            <SectionHeading id="disclaimer-warranties">
              8. Disclaimer of Warranties
            </SectionHeading>
            <p>
              To the maximum extent permitted by applicable law, Chifral and its
              tools are provided on an "as is" and "as available" basis.
            </p>
            <p>
              We make no express or implied warranties regarding accuracy or
              completeness of tool outputs, fitness for a particular purpose,
              continuous availability, compatibility with every device, or freedom
              from errors.
            </p>
            <p>
              Nothing in these terms excludes warranties or rights that cannot
              legally be excluded under applicable law.
            </p>

            <SectionHeading id="limitation-liability">
              9. Limitation of Liability
            </SectionHeading>
            <p>
              To the maximum extent permitted by applicable law, Chifral and its
              operator will not be liable for indirect, incidental, special,
              consequential or punitive damages, or for loss of profits, data,
              business opportunities or goodwill arising from your use of or
              inability to use the website.
            </p>
            <p>
              You are responsible for verifying tool outputs and maintaining
              appropriate backups of important information. Nothing in these terms
              excludes or limits liability where such exclusion or limitation is
              prohibited by applicable law.
            </p>

            <SectionHeading id="indemnification">
              10. Indemnification
            </SectionHeading>
            <p>
              To the extent permitted by applicable law, you agree to be
              responsible for claims, losses and expenses arising from your
              unlawful use of Chifral, your violation of these terms or your
              infringement of another person's rights. This section does not apply
              to the extent a claim results from conduct for which you cannot
              legally be held responsible.
            </p>

            <SectionHeading id="external-links">
              11. External Links
            </SectionHeading>
            <p>
              Chifral may contain links to third-party websites, documentation or
              resources. These links are provided for convenience and
              informational purposes. We do not control or guarantee the accuracy,
              security, availability or content of external websites. Accessing
              third-party websites is at your own discretion and subject to their
              applicable terms and policies.
            </p>

            <SectionHeading id="changes-terms">
              12. Changes to These Terms
            </SectionHeading>
            <p>
              We may update these Terms of Service as Chifral evolves, new tools
              are introduced or legal and operational requirements change. Updated
              terms will be published on this page with a revised update date.
            </p>
            <p>
              Your continued use of Chifral after updated terms become effective
              constitutes acceptance where such acceptance is legally recognized.
              If you do not agree with updated terms, you should stop using the
              website.
            </p>

            <SectionHeading id="applicable-law">
              13. Applicable Law and Consumer Rights
            </SectionHeading>
            <p>
              These terms are intended for users in different countries and
              regions. Your use of Chifral remains subject to applicable laws.
            </p>
            <p>
              Nothing in these terms is intended to remove or restrict mandatory
              consumer rights or other legal protections that apply to you. Where
              specific governing-law or dispute-resolution provisions are
              required, they will be determined in accordance with the legal
              circumstances of the website's operator and applicable law.
            </p>
            <p>
              If you have a dispute or concern regarding these terms or the
              website, you may contact us first using the email address in Section
              14 to seek informal resolution. This informal process does not waive
              mandatory consumer rights or restrict any legal remedies available
              to you under applicable law.
            </p>

            <SectionHeading id="contact">14. Contact</SectionHeading>
            <p>
              For questions, feedback, technical issues or concerns regarding
              these Terms of Service, contact:
            </p>
            <p className="font-medium text-foreground mt-2">
              Email:{" "}
              <a
                href="mailto:symblend.labs@gmail.com"
                className="text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary-hover hover:decoration-primary-hover"
              >
                symblend.labs@gmail.com
              </a>
            </p>
            <p>
              Please include relevant details so that your enquiry can be handled
              appropriately.
            </p>
          </div>
        </div>
      </Container>
    </main>
  );
}