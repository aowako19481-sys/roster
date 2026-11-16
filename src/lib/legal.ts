import { BRAND } from "@/lib/brand";
import { COMPANY, PRICES } from "@/lib/company";

/**
 * The words of every policy on the public site, kept in one place so a
 * lawyer can review and edit them without touching any page code.
 * A string is a paragraph; a list of strings is a bulleted list.
 *
 * These were written to match what the product actually does. They have not
 * been reviewed by a lawyer. Have one read them before relying on them.
 */

export const LEGAL_UPDATED = "15 November 2026";

type Block = string | string[];
export type LegalPage = {
  slug: string;
  title: string;
  group: "Legal" | "Trust";
  summary: string;
  intro: string[];
  sections: { heading: string; body: Block[] }[];
};

const us = COMPANY.legalName || BRAND;
const reach = COMPANY.contactEmail ? `email ${COMPANY.contactEmail}` : "use the Get started form on our home page";
const state = COMPANY.governingState ? `the State of ${COMPANY.governingState}` : "the state in which we are organised";
const address = COMPANY.address ? ` Our postal address is ${COMPANY.address}.` : "";

export const LEGAL_PAGES: LegalPage[] = [
  {
    slug: "terms",
    title: "Terms of Service",
    group: "Legal",
    summary: "The agreement between your brokerage and us.",
    intro: [
      `These terms are the agreement between ${us} ("${BRAND}", "we", "us") and the business that signs up for ${BRAND} ("you", "the brokerage"). By creating an account, signing an order or using the service, you agree to them.${address}`,
      "If you are an agent using a link your brokerage sent you, your brokerage has agreed to these terms; the Electronic Signature Disclosure and Privacy Policy explain what applies to you.",
    ],
    sections: [
      { heading: "1. Who can use the service", body: [
        `${BRAND} is for businesses. You must be at least 18 and able to bind the brokerage you sign up for. It is not offered to consumers for personal or household use.`,
        "You are responsible for everyone you give access to, for keeping sign-in details private, and for choosing which of your people hold which roles and powers.",
      ] },
      { heading: "2. What the service does, and what it does not do", body: [
        `${BRAND} helps a brokerage onboard agents, collect signatures and paperwork, record deals, and prepare commission payroll. It calculates, checks, flags and records.`,
        [
          "You make every pay decision. A calculation, check or flag from the service is information for you to review, not an instruction and not a guarantee that a figure is right.",
          `${BRAND} does not move money. It is not a payroll provider, bank, escrow agent or money transmitter.`,
          `${BRAND} does not give legal, tax, accounting or employment advice, and does not file tax forms. Exports are prepared for your own accountant or filing service.`,
          `${BRAND} is not a real estate broker and does not supervise your agents.`,
          `${BRAND} assists you in checking an agent's licence: it shows what the agent entered, its own consistency checks and a way to the state's public record. A person at your brokerage confirms each licence. ${BRAND} does not guarantee that any licence is valid, active or in good standing, and a difference it finds is never treated as a rejection by itself.`,
        ],
      ] },
      { heading: "3. Your data and your documents", body: [
        "You own the information you and your agents put into the service. You give us permission to host, process and display it only to provide and support the service.",
        "You are responsible for the documents and wording you upload or write (agreements, policies, riders, deposit records and other forms), for whether they are lawful and suitable, and for having the right to collect the information you ask your agents for.",
        "You agree not to use the service to collect or store full Social Security or taxpayer numbers, full bank account or routing numbers, dates of birth or identity document scans. The service is designed to work without them.",
      ] },
      { heading: "4. Electronic signatures", body: [
        "The service records electronic signatures and acknowledgements with a record of the wording, the signer's consent, the time and where it was signed from. It is built around the US ESIGN Act and the Uniform Electronic Transactions Act.",
        "Some documents cannot be signed electronically, or need extra steps, under the law of some states. Deciding whether an electronic signature is right for a particular document is your responsibility.",
      ] },
      { heading: "5. Fees, renewal and taxes", body: [
        `Prices are per agent seat per month: $${PRICES.monthly} month to month, or $${PRICES.annual.toFixed(2)} on a 12-month plan, with a monthly minimum of $${PRICES.monthlyMinimum} and a one-time setup fee quoted by volume, as shown on our pricing page or in your order. Add-ons are priced per agent seat per month, as shown on our pricing page. A custom quote in a signed order replaces these prices. Fees are billed monthly in advance and exclude taxes, which you are responsible for.`,
        `Agent seats cover the whole brokerage across all its offices and teams. One Owner / Admin seat is included; each extra one is $${PRICES.adminSeat.toFixed(2)} per month, added to your monthly bill. If you use more agent seats than your order covers, we will bill the extra seats at your plan's rate from the month they were first used.`,
        "A month-to-month plan renews each month until cancelled. A 12-month plan is a commitment to 12 months, billed monthly, and renews for another 12 months unless you tell us at least 30 days before it ends. See Refunds and Cancellation for how to cancel and what happens next.",
        "We may change prices by giving you at least 30 days' notice before the change takes effect at your next renewal.",
      ] },
      { heading: "6. Acceptable use", body: ["You agree to follow the Acceptable Use policy. We may suspend access that puts the service, other customers or anyone's data at risk, and will tell you when we do."] },
      { heading: "7. Availability and changes", body: [
        "We work to keep the service available and accurate, but we do not promise it will be uninterrupted or error-free. We may add, change or remove features. If a change materially reduces what you paid for, you may cancel and receive a refund of fees paid for the period after cancellation.",
      ] },
      { heading: "8. Confidentiality and privacy", body: [
        "Each of us will keep the other's non-public information confidential and use it only for this agreement. How we handle personal information is described in the Privacy Policy and the Data Processing Agreement, which form part of these terms.",
      ] },
      { heading: "9. Our software", body: [`We own ${BRAND}, its software and its design. You receive a right to use the service while your subscription is active. You may not copy, resell or reverse engineer it.`] },
      { heading: "10. Disclaimers", body: [
        "The service is provided \"as is\". To the fullest extent the law allows, we disclaim all implied warranties, including merchantability, fitness for a particular purpose and non-infringement. Examples, timings and figures on our website are illustrations, not promises of results.",
      ] },
      { heading: "11. Limit of liability", body: [
        "To the fullest extent the law allows, neither of us is liable to the other for lost profits, lost revenue, or indirect, special, incidental or consequential damages.",
        "Our total liability for all claims relating to the service is limited to the fees you paid us in the 12 months before the event that gave rise to the claim.",
        "These limits do not apply to amounts you owe us, or to liability that cannot be limited by law.",
      ] },
      { heading: "12. Your responsibility for claims", body: [
        "You will defend and cover us against claims brought by your agents, staff or others that arise from your pay decisions, your documents, your instructions to us, or your breach of these terms or the law.",
      ] },
      { heading: "13. Ending the agreement", body: [
        "Either of us may end the agreement if the other materially breaches it and does not fix the breach within 30 days of written notice. We may suspend or end access immediately for non-payment or a serious breach of the Acceptable Use policy.",
        "For 30 days after the agreement ends you may ask for an export of your data. After that we delete it, except where the law requires us to keep it.",
      ] },
      { heading: "14. General", body: [
        `These terms are governed by the laws of ${state}, without regard to its conflict-of-law rules. Before starting any formal proceeding, each of us will try in good faith for 30 days to resolve the dispute by talking to the other.`,
        "We may update these terms. We will post the new version here and, for material changes, give you at least 30 days' notice. Continuing to use the service after the change takes effect means you accept it.",
        `Questions about these terms: ${reach}.`,
      ] },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    group: "Legal",
    summary: "What we collect, why, and what we never collect.",
    intro: [
      `This policy explains what personal information ${us} handles through ${BRAND}, why, and the choices people have. It covers visitors to this website, staff of brokerages that use ${BRAND}, and agents who are onboarded or paid through it.`,
    ],
    sections: [
      { heading: "The short version", body: [[
        "We collect as little as the job needs. We never ask for a full Social Security or taxpayer number, a full bank account or routing number, a date of birth or an identity document.",
        "We do not sell personal information and we do not share it for advertising.",
        "This website has no analytics, no advertising trackers and no session recording.",
        "When someone signs a document, we keep a record that includes the internet (IP) address and browser they signed from. That is what makes the signature provable.",
      ]] },
      { heading: "Who is responsible for the information", body: [
        `For information a brokerage puts into ${BRAND} about its staff and agents, the brokerage decides what is collected and why; we handle it on the brokerage's instructions as its service provider. If you are an agent and have a question about your information, your brokerage is the right first contact.`,
        "For visitors to this website and people who contact us, we are responsible.",
      ] },
      { heading: "What we collect", body: [
        "Website visitors:",
        ["If you send us the Get started form: your name, brokerage, work email, the size of your roster, what you are interested in and your message.", "A one-way fingerprint of your internet address, kept only to limit how many messages one connection can send. We cannot turn it back into the address.", "Our hosting provider keeps standard short-lived server logs (such as internet address and browser type) to run and protect the site."],
        "Brokerage staff:",
        ["Name, work email, role, office and sign-in records.", "A log of the changes each person makes in the product (for example approvals, overrides and payroll releases)."],
        "Agents:",
        ["Name, email, phone and office.", "Real estate licence number, state, expiry date and a photo of the licence, if the brokerage asks for one.", "For the W-9 step: legal name and the last four digits of the taxpayer number, and whether the form has been received.", "For direct deposit: the bank's name, whether the account is checking or savings, and the last four digits of the account number.", "Commission terms (riders and splits), deals, payouts and statements.", "Documents the brokerage asks the agent to sign, acknowledge or upload."],
        "Signature records:",
        ["The exact wording that was signed and a fingerprint (SHA-256) of it and of any attached document.", "The name typed, the email the invitation was sent to, the date and time.", "The internet (IP) address and the browser the signature came from.", "The electronic-signature disclosure the signer agreed to."],
      ] },
      { heading: "How we use it", body: [[
        "To provide the service the brokerage has asked for: onboarding, paperwork, signatures, deal records and commission payroll.",
        "To keep the service secure, prevent misuse and keep a trustworthy record of who did what.",
        "To reply to people who contact us.",
        "To meet legal obligations.",
      ], "We do not use personal information to build advertising profiles, and we do not use automated decision-making that produces legal effects about a person. A flag in the product is a prompt for a person at the brokerage to look."] },
      { heading: "Who we share it with", body: [[
        "The brokerage the information belongs to, and the people at that brokerage whose role allows them to see it.",
        "Companies that run parts of the service for us under contract (see Sub-processors). They may use the information only to provide their service to us.",
        "Authorities, where the law requires it. Where we are allowed to, we tell the brokerage first.",
        "A successor, if our business is merged or sold, under the same commitments as this policy.",
      ]] },
      { heading: "How long we keep it", body: [[
        "Brokerage data: for as long as the brokerage's account is open, and for 30 days afterwards so it can be exported. Then it is deleted, except where the law requires us to keep something.",
        "Signature records: for as long as the brokerage's account is open, because their purpose is to be available if a signature is ever questioned.",
        "Messages from the Get started form: up to 24 months.",
        "Onboarding links: each link stops working after 14 days, or as soon as a newer one is issued.",
      ]] },
      { heading: "Your choices and rights", body: [
        "Depending on where you live, you may have the right to see, correct, delete or receive a copy of your personal information, and to object to some uses.",
        [`Agents and brokerage staff: ask your brokerage. We will help the brokerage respond.`, `Website visitors and anyone unsure who to ask: ${reach}.`],
        "We do not sell personal information or share it for cross-context behavioural advertising, so there is nothing to opt out of. We will not treat anyone differently for using these rights.",
      ] },
      { heading: "Security", body: ["Security measures are described in the Security Overview. No system is perfectly secure. If a breach affects your information, we will notify the brokerage and, where required, you and the relevant authorities."] },
      { heading: "Children", body: [`${BRAND} is for businesses and adults. It is not directed to anyone under 18 and we do not knowingly collect their information.`] },
      { heading: "Where information is held", body: ["The service is hosted in the United States by the providers listed under Sub-processors. If you use it from elsewhere, your information will be processed in the United States."] },
      { heading: "Changes and contact", body: [`We will post changes here and update the date at the top. For material changes we will tell brokerages in advance. Questions: ${reach}.${address}`] },
    ],
  },
  {
    slug: "esign",
    title: "Electronic Signature Disclosure",
    group: "Legal",
    summary: "What it means to sign electronically through Kinu.",
    intro: [
      `Brokerages use ${BRAND} to ask agents to sign and acknowledge documents electronically. This page explains what that means for the person signing. The same points are shown, in short form, beside every signature box.`,
    ],
    sections: [
      { heading: "Your consent", body: [
        "Before you sign, you are asked to tick a box agreeing to use electronic records and signatures with your brokerage. Typing your full name and selecting Sign then has the same legal effect as signing on paper.",
        "Your consent applies to the document in front of you. You are asked again for each document.",
      ] },
      { heading: "You can choose paper", body: [
        "You do not have to sign electronically. Before you sign, you may ask your brokerage for a paper copy, or to sign on paper instead, by contacting your brokerage directly. Choosing paper may slow down your onboarding but carries no fee from us.",
        "To withdraw your consent for documents you have not yet signed, contact your brokerage before signing. Withdrawing consent does not undo documents you have already signed.",
      ] },
      { heading: "What you need", body: [[
        "A phone, tablet or computer with a current web browser and an internet connection.",
        "The ability to open PDF files, if your brokerage has attached a document.",
        "The email address or phone your brokerage used to send your private link.",
      ]] },
      { heading: "Your copies", body: [
        "Straight after you sign or acknowledge a document, you can download your own copy, with its signature record, from the same page. Keep it somewhere safe. Your brokerage keeps the same record and can give you another copy.",
      ] },
      { heading: "What is recorded", body: [[
        "The exact wording you signed, and a fingerprint of it and of any attached document, so any later change would show.",
        "The name you typed, the email your invitation was sent to, and the date and time.",
        "The internet (IP) address and browser you signed from.",
        "This disclosure, as you agreed to it.",
      ], "A signature record cannot be edited after signing, by your brokerage or by us."] },
      { heading: "Keeping your details current", body: ["If your email address or phone number changes, tell your brokerage so future documents reach you."] },
      { heading: "A note on the law", body: [
        `Electronic signatures recorded by ${BRAND} are designed to meet the US ESIGN Act and the Uniform Electronic Transactions Act. Some kinds of document cannot be signed electronically, or need extra steps, in some states. Your brokerage decides which documents it asks you to sign this way. This page is information, not legal advice.`,
      ] },
    ],
  },
  {
    slug: "refunds",
    title: "Refunds and Cancellation",
    group: "Legal",
    summary: "How billing, renewal, cancelling and refunds work.",
    intro: [`Plain rules for paying for ${BRAND} and for stopping.`],
    sections: [
      { heading: "Billing and renewal", body: [
        `Both plans are billed monthly in advance, per agent seat, with a monthly minimum of $${PRICES.monthlyMinimum}. Month to month is $${PRICES.monthly} per seat. The 12-month plan is $${PRICES.annual.toFixed(2)} per seat. Nothing is charged for a year upfront. A one-time setup fee, quoted by volume, is billed when setup begins.`,
        "A month-to-month plan renews each month until you cancel. A 12-month plan renews for another 12 months unless you tell us at least 30 days before it ends. The renewal terms are shown before you subscribe.",
      ] },
      { heading: "How to cancel", body: [
        `You can cancel at any time: ${reach}, from an owner of the brokerage's account, at least one working day before your next billing date. We will confirm in writing.`,
        "Cancellation takes effect at the end of the month you have already paid for. You keep full access until then.",
        `Cancelling a 12-month plan early: the lower price was given in return for the 12-month commitment. If you cancel before the 12 months are up, the months you used are re-billed at the month-to-month price, so you owe the difference of $${(PRICES.monthly - PRICES.annual).toFixed(2)} per seat for each month used. You do not owe anything for the months you did not use. This does not apply if you cancel because we materially failed to provide the service.`,
      ] },
      { heading: "Refunds", body: [[
        "Monthly fees are not refunded for a month that has already started, except as set out below or where the law requires.",
        "If we made a billing mistake, we correct it and refund the difference.",
        "If we end your subscription without cause, or remove something material that you paid for and you cancel as a result, we refund fees paid for the time after the end date.",
        "The setup fee is refundable in full until setup work begins, and not after.",
      ]] },
      { heading: "After you leave", body: ["For 30 days after your subscription ends you can ask for an export of your data, including signature records. After that it is deleted, except where the law requires us to keep it."] },
      { heading: "Changing your plan", body: ["You can add or remove products and add-ons. Additions are billed from the day they are switched on; removals take effect from your next billing date."] },
    ],
  },
  {
    slug: "acceptable-use",
    title: "Acceptable Use",
    group: "Legal",
    summary: "What the service must not be used for.",
    intro: [`These rules keep ${BRAND} safe for every brokerage that uses it. They apply to everyone with access, including agents using an onboarding link.`],
    sections: [
      { heading: "Do not", body: [[
        "Collect, upload or store full Social Security or taxpayer numbers, full bank account or routing numbers, dates of birth or identity documents. The service is built to work without them.",
        "Put real personal or financial information into a test or demonstration workspace.",
        "Use the service to break the law, including fair housing, employment, privacy, tax and anti-discrimination laws.",
        "Sign for someone else, pressure someone into signing, or alter a document after it has been presented for signature.",
        "Share sign-in details, or let more than one person use one account.",
        "Try to get at another brokerage's information, probe or test the security of the service without our written permission, or get around its limits.",
        "Upload malware, or files disguised as another type of file.",
        "Use invitations or messages to send spam.",
        "Copy, resell or reverse engineer the service.",
      ]] },
      { heading: "If something goes wrong", body: [
        "If you believe an account has been misused or you have found a security weakness, tell us straight away. We may suspend access that puts the service or anyone's information at risk, and will tell the brokerage what we did and why.",
        `To report a problem: ${reach}.`,
      ] },
    ],
  },
  {
    slug: "dpa",
    title: "Data Processing Agreement",
    group: "Trust",
    summary: "Our commitments when we handle personal data for your brokerage.",
    intro: [
      `This agreement applies automatically whenever ${us} handles personal information on behalf of a brokerage through ${BRAND}. It forms part of the Terms of Service. A countersigned copy is available on request.`,
    ],
    sections: [
      { heading: "Roles", body: ["The brokerage decides what personal information is processed and why (the \"controller\" or \"business\"). We process it only on the brokerage's documented instructions, which include the Terms of Service and the brokerage's use of the product (we are the \"processor\" or \"service provider\")."] },
      { heading: "What we commit to", body: [[
        "Use the personal information only to provide, secure and support the service, and not sell it, share it for advertising, or combine it with information from other customers.",
        "Make sure our people who can access it are bound to confidentiality.",
        "Keep in place the security measures described in the Security Overview.",
        "Use sub-processors only under written contracts with equivalent protections, keep the list published, and give notice before adding one so the brokerage can object.",
        "Help the brokerage respond to requests from people about their information, and with assessments the law requires of it.",
        "Tell the brokerage without undue delay, and where feasible within 72 hours, after becoming aware of a breach of its personal information, with what we know and what we are doing.",
        "At the end of the agreement, return the information by export on request and delete it after 30 days, unless the law requires us to keep it.",
        "Give the brokerage the information reasonably needed to confirm we are meeting these commitments.",
        "Tell the brokerage if we believe an instruction would break the law.",
      ]] },
      { heading: "The brokerage's commitments", body: ["The brokerage confirms it has the right to collect the information it puts into the service and to instruct us to process it, has given its agents and staff any notices the law requires, and will not ask us to process categories of information the Acceptable Use policy excludes."] },
      { heading: "Details of processing", body: [[
        "Subject matter: agent onboarding, document signing and commission payroll records.",
        "Duration: the term of the subscription plus 30 days.",
        "People: the brokerage's staff and its real estate agents.",
        "Information: as listed under \"What we collect\" in the Privacy Policy.",
      ]] },
      { heading: "Transfers", body: ["The service is hosted in the United States. Where the law requires a specific transfer mechanism for a brokerage's data, we will agree one with that brokerage before the data is processed."] },
    ],
  },
  {
    slug: "subprocessors",
    title: "Sub-processors",
    group: "Trust",
    summary: "The companies that run parts of the service for us.",
    intro: [`These are the companies that process brokerage data on our behalf. Each is bound by contract to protect it and to use it only to provide its service to us.`],
    sections: [
      { heading: "In use today", body: [[
        "Supabase, Inc. Database, sign-in and private file storage.",
        "Vercel, Inc. Hosting of the website and application.",
        "Resend (Plus Five Five, Inc.). Sending email: sign-in codes and requests to sign a document.",
        "Railway Corporation. Hosting of our own electronic-signing service (open-source Documenso software that we run ourselves), which holds documents sent for signature and the signer's name and email.",
        "Cloudflare, Inc. Our domain name, network routing and the forwarding of email sent to our own addresses.",
      ]] },
      { heading: "Planned, not yet in use", body: [
        "The following kinds of provider will be added as the related features are switched on. Each will be named here before it processes any brokerage data.",
        ["A payments provider, for subscription billing.", "A tax-form provider, to collect and hold W-9 forms so that full taxpayer numbers never reach us."],
      ] },
      { heading: "Changes to this list", body: [`We update this page before a new sub-processor starts processing brokerage data. A brokerage that objects on reasonable grounds may cancel the affected service. Questions: ${reach}.`] },
    ],
  },
  {
    slug: "security",
    title: "Security Overview",
    group: "Trust",
    summary: "How brokerage data is protected, in plain words.",
    intro: [`What we do to protect the information in ${BRAND}, and what is still on the way. We would rather tell you plainly than overstate it.`],
    sections: [
      { heading: "We keep less", body: [[
        "No full Social Security or taxpayer numbers. Last four digits only.",
        "No full bank account or routing numbers. Bank name, account type and last four digits only.",
        "No dates of birth and no identity document scans.",
      ]] },
      { heading: "Each brokerage is sealed off", body: ["Every table in the database enforces, in the database itself, that a person can only reach the records of a brokerage they belong to, and only what their role allows. The application cannot override this."] },
      { heading: "Roles and powers", body: ["Access is by role. Releasing payroll and overriding a calculated split are separate powers that an owner gives to named people. An owner can preview exactly what any role sees."] },
      { heading: "A record of every change", body: ["Approvals, overrides, releases and edits are written to an audit log with the person's name and the time. Signature records cannot be edited or deleted by a brokerage or by us."] },
      { heading: "In transit and at rest", body: ["All connections use HTTPS. Data is encrypted at rest by our database and hosting providers. Uploaded files are kept in private storage and served only to people allowed to see them."] },
      { heading: "The application", body: [[
        "All data access happens on our servers; a visitor's browser never talks to the database directly.",
        "Sign-in sessions are held in cookies that page scripts cannot read.",
        "A strict content security policy blocks scripts from anywhere but our own site, and the site loads nothing from other companies.",
        "An agent's onboarding link is long and random, only a fingerprint of it is stored, and it stops working after 14 days or when a newer link is issued.",
        "Uploaded files are checked against their real contents, not just their name.",
      ]] },
      { heading: "Still on the way", body: [[
        "Two-step sign-in for staff accounts.",
        "An independent penetration test before general availability.",
        "Formal compliance reports. We do not currently hold a SOC 2 or ISO 27001 certification.",
      ]] },
      { heading: "Reporting a problem", body: [`If you believe you have found a security weakness, please tell us before telling anyone else: ${reach}. We will acknowledge your report and keep you informed.`] },
    ],
  },
  {
    slug: "cookies",
    title: "Cookie Notice",
    group: "Trust",
    summary: "The few cookies we use, and the ones we do not.",
    intro: [`${BRAND} uses only the cookies it needs to work. There are no advertising or analytics cookies, which is why there is no cookie banner.`],
    sections: [
      { heading: "Cookies we set", body: [[
        "Sign-in cookies. Set when a staff member signs in, so the site knows who they are. They cannot be read by page scripts and are removed on sign-out.",
        "A brokerage choice cookie. Remembers which brokerage a person with access to more than one is working in.",
        "A role preview cookie. Set only while an owner is previewing what another role sees.",
      ]] },
      { heading: "What we do not use", body: [[
        "No analytics or measurement cookies.",
        "No advertising or cross-site tracking cookies.",
        "No session recording.",
        "No fonts, scripts or images loaded from other companies' servers.",
      ]] },
      { heading: "Your controls", body: ["You can clear or block cookies in your browser settings. Blocking the sign-in cookies will stop you signing in. Visiting the public pages of this site sets no cookies."] },
    ],
  },
  {
    slug: "accessibility",
    title: "Accessibility",
    group: "Trust",
    summary: "Our commitment to a product everyone can use.",
    intro: [`We want ${BRAND} to work for everyone, including people who use a keyboard, a screen reader, magnification or reduced motion.`],
    sections: [
      { heading: "What we aim for", body: ["We build toward the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA."] },
      { heading: "What we do", body: [[
        "Real buttons, links, labels and tables, so assistive technology can describe them.",
        "Everything can be reached and used with a keyboard, with a visible focus outline.",
        "Status is always given in words, never by colour alone.",
        "Movement respects your device's reduced-motion setting. With it on, the animations on this site are replaced by still images.",
        "Text can be enlarged without losing content.",
      ]] },
      { heading: "Known limits", body: [[
        "The moving pictures on our home page are decorative; the same information is in the text beside them.",
        "PDF documents uploaded by a brokerage are that brokerage's own files and may not be accessible. Ask your brokerage for another format if you need one.",
      ]] },
      { heading: "Tell us", body: [`If something does not work for you, we want to know so we can fix it: ${reach}. Please tell us the page and what you were trying to do.`] },
    ],
  },
];

export function legalPage(slug: string) {
  return LEGAL_PAGES.find((page) => page.slug === slug) ?? null;
}
