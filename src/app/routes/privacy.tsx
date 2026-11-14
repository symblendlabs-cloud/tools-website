import { Container } from "../../ui/container";
import { PageHeader } from "../../ui/page-header";
import { Breadcrumbs, type BreadcrumbItem } from "../../ui/breadcrumbs";
import { buildPageMeta } from "../seo/site-meta";
import type { Route } from "./+types/privacy";

export function meta({}: Route.MetaArgs) {
  return buildPageMeta({
    title: "Privacy Policy",
    description: "Chifral's privacy policy regarding website data, browser-based tools, and third-party services.",
    path: "/privacy",
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

export default function PrivacyPage() {
  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Home", to: "/" },
    { label: "Privacy" },
  ];

  return (
    <main>
      <Container className="py-10 sm:py-14">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mt-6 max-w-3xl">
          <PageHeader
            title="Privacy Policy"
            description="Last updated: November 13, 2026"
          />

          <div className="mt-8 space-y-4 text-base text-muted-foreground leading-relaxed">
            <p>
              Chifral respects your privacy. This Privacy Policy explains how
              information may be handled when you visit or use the Chifral
              website and its browser-based tools.
            </p>
            <p>
              Chifral is independently operated by an individual and provides
              browser-based utilities for general and professional use.
            </p>
            <p>
              This Privacy Policy describes Chifral's information practices.
              Reading this policy or using the website does not automatically
              constitute consent to optional cookies, analytics, or advertising.
              Where applicable law requires consent, it will be requested
              separately through an appropriate mechanism as described below.
            </p>

            <SectionHeading id="information-collect">
              1. Information We Collect
            </SectionHeading>
            <p>
              Chifral does not require user accounts or registration to use its
              tools.
            </p>
            <p>
              Depending on how you access the website, the following information
              may be processed:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Basic technical information associated with website requests.</li>
              <li>Browser and device information.</li>
              <li>Website performance and usage metrics.</li>
              <li>Information voluntarily provided when contacting us.</li>
            </ul>
            <p>
              This information may be processed for the following purposes:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Delivering, operating, and maintaining Chifral.</li>
              <li>Maintaining website security and preventing abuse.</li>
              <li>Understanding website performance and usage.</li>
              <li>Diagnosing technical errors and improving reliability.</li>
              <li>Responding to messages, support requests, and privacy requests.</li>
            </ul>
            <p>
              We do not intentionally request personal information to operate
              the browser-based tools.
            </p>

            <SectionHeading id="tool-processing">
              2. Browser-Based Tool Processing
            </SectionHeading>
            <p>
              Chifral is designed to provide browser-based utilities. Where a
              tool performs processing entirely within your browser, the input
              and output are processed locally on your device and are not
              transmitted to Chifral's application servers for that operation.
            </p>
            <p>
              However, processing may vary depending on the individual tool and
              its implementation. You should review the functionality of a tool
              before entering confidential, sensitive or personal information.
            </p>
            <p>
              You remain responsible for the information you enter and the
              outputs you generate.
            </p>

            <SectionHeading id="hosting-infrastructure">
              3. Website Hosting and Infrastructure
            </SectionHeading>
            <p>
              Chifral is hosted using Cloudflare Pages. Cloudflare provides
              website delivery, hosting infrastructure and related technical
              services.
            </p>
            <p>
              As part of providing these services, Cloudflare may process
              technical information associated with website requests, security,
              network delivery and infrastructure operations. Such processing is
              subject to Cloudflare's applicable privacy policies and service
              terms.
            </p>
            <p>
              Cloudflare Privacy Policy:{" "}
              <a
                href="https://www.cloudflare.com/privacypolicy/"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://www.cloudflare.com/privacypolicy/
              </a>
            </p>

            <SectionHeading id="google-tag-manager">
              4. Google Tag Manager
            </SectionHeading>
            <p>
              Chifral uses Google Tag Manager (GTM) to manage website tags. GTM
              is a service that can load other scripts (tags) configured through
              its management interface.
            </p>
            <p>
              According to Google, GTM may collect aggregated tag-firing
              diagnostics. Google states that GTM does not collect visitor IP
              addresses or individual measurement identifiers through its own
              diagnostic collection, and that standard HTTP request logs are
              deleted within 14 days.
            </p>
            <p>
              Other tags loaded through GTM may collect additional information or
              set cookies depending on their configuration. This policy does not
              imply that every possible tag is currently active.
            </p>
            <p>
              Google Tag Manager Privacy:{" "}
              <a
                href="https://support.google.com/tagmanager/answer/9323295"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://support.google.com/tagmanager/answer/9323295
              </a>
            </p>

            <SectionHeading id="cloudflare-analytics">
              5. Cloudflare Web Analytics
            </SectionHeading>
            <p>
              Chifral uses Cloudflare Web Analytics (its performance beacon) to
              understand website performance and visitor activity. The beacon
              collects browser performance metrics and sends them to Cloudflare.
            </p>
            <p>
              According to Cloudflare, the source IP is received as part of
              normal HTTP request handling and discarded at a Cloudflare data center selected through its network routing, rather than stored in its core databases or
              logs. Cloudflare also states that the beacon does not access
              browser cookies or storage.
            </p>
            <p>
              Cloudflare RUM Beacon documentation:{" "}
              <a
                href="https://developers.cloudflare.com/speed/observatory/rum-beacon/"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://developers.cloudflare.com/speed/observatory/rum-beacon/
              </a>
            </p>
            <p>
              Cloudflare Web Analytics documentation:{" "}
              <a
                href="https://developers.cloudflare.com/web-analytics/about/"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://developers.cloudflare.com/web-analytics/about/
              </a>
            </p>

            <SectionHeading id="cookies">
              6. Cookies and Similar Technologies
            </SectionHeading>
            <p>
              Chifral uses Google Tag Manager (GTM). Tags configured through GTM
              may set cookies or use other technologies depending on their
              configuration. Cloudflare's performance beacon is documented as not
              accessing browser storage. Cloudflare infrastructure and security
              services may use strictly necessary cookies or similar
              technologies where required to provide, secure or maintain website
              services.
            </p>
            <p>
              If additional analytics, advertising or other third-party services
              are introduced, they may use cookies, local storage or similar
              technologies. Where required by applicable law, appropriate
              information and consent choices will be provided before such
              technologies are used.
            </p>
            <p>
              Where consent is legally required, visitors will be informed and given the opportunity to make the choices required by applicable law. Optional cookies and similar technologies will be handled according to applicable legal requirements.
            </p>

            <SectionHeading id="future-analytics">
              7. Future Analytics and Advertising
            </SectionHeading>
            <p>
              Chifral may introduce additional analytics and advertising services
              as the website develops. These may include Google Analytics 4
              (GA4), Google AdSense, and other relevant measurement or
              advertising services.
            </p>
            <p>
              These services are not represented as currently active merely
              because they are mentioned in this policy. Before introducing such
              services, this Privacy Policy will be updated to describe their
              relevant data practices.
            </p>
            <p>
              Third-party providers may collect, process or receive information
              according to their own privacy policies and applicable settings.
              Advertising may include personalized or non-personalized
              advertisements depending on the service configuration, applicable
              law and user choices.
            </p>

            <SectionHeading id="third-party-websites">
              8. Third-Party Websites and Services
            </SectionHeading>
            <p>
              Chifral may provide links to external websites, documentation and
              services. We do not control the privacy practices or content of
              third-party websites.
            </p>
            <p>
              When visiting an external website, you should review its privacy
              policy and applicable terms.
            </p>

            <SectionHeading id="data-retention">
              9. Data Retention
            </SectionHeading>
            <p>
              Chifral does not maintain user accounts or an application database
              of tool inputs and outputs.
            </p>
            <p>
              Technical information may nevertheless be retained by hosting,
              infrastructure or other service providers according to their
              respective retention policies. Information voluntarily submitted
              through email may be retained for as long as reasonably necessary
              to respond to the enquiry, maintain relevant correspondence or meet
              applicable legal obligations.
            </p>

            <SectionHeading id="data-security">
              10. Data Security
            </SectionHeading>
            <p>
              We take reasonable steps to maintain the security and reliability
              of Chifral. However, no website, internet transmission or
              electronic storage method can be guaranteed to be completely
              secure.
            </p>
            <p>
              You should avoid submitting sensitive information unless necessary
              and appropriate for the particular service.
            </p>

            <SectionHeading id="international-visitors">
              11. International Visitors and Privacy Rights
            </SectionHeading>
            <p>
              Chifral is intended for visitors worldwide. Depending on your
              location, you may have privacy rights under applicable laws,
              including rights to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Request access to personal information.</li>
              <li>Request correction of inaccurate information.</li>
              <li>Request deletion of personal information where applicable.</li>
              <li>Object to or restrict certain processing.</li>
              <li>Withdraw consent where processing is based on consent.</li>
              <li>
                Submit a privacy-related complaint to the relevant authority.
              </li>
            </ul>
            <p>
              To exercise an applicable privacy right, contact us using the email
              address below. We will consider and respond to requests in
              accordance with applicable legal requirements.
            </p>

            <SectionHeading id="childrens-privacy">
              12. Children's Privacy
            </SectionHeading>
            <p>
              Chifral is a general-purpose utility website and is not
              specifically directed at children. We do not knowingly seek to
              collect personal information from children.
            </p>
            <p>
              If you believe that a child has provided personal information to
              us, please contact us so that the matter can be reviewed and
              addressed where appropriate.
            </p>

            <SectionHeading id="policy-updates">
              13. Changes to This Privacy Policy
            </SectionHeading>
            <p>
              We may update this Privacy Policy when Chifral introduces new
              tools, services, analytics, advertising or other features, or when
              legal requirements change.
            </p>
            <p>
              Changes will be published on this page with an updated revision
              date. We encourage visitors to review this page periodically.
            </p>

            <SectionHeading id="contact">14. Contact</SectionHeading>
            <p>
              For privacy questions, data-related requests or concerns regarding
              this policy, contact:
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
              Please include sufficient details to help us understand and respond
              to your request.
            </p>
          </div>
        </div>
      </Container>
    </main>
  );
}