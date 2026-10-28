/**
 * Evidence-backed content for the existing /services/street-lighting/ page.
 * Reviewed 24 October 2026 against the supplied RTA certificate, the company
 * profile, corporate service pages and the official authority sources below.
 *
 * Shape: metadata + directAnswer; sections with paragraphs/bullets/sources;
 * qualification with exact certificate fields; buyerBrief with advice steps;
 * relatedEvidence with links; faqs with source links; and a closing cta.
 * Source records are editorial evidence, not endorsements or partnerships.
 */
const certificateSource = {
  label: 'RTA prequalification certificate — page 1',
  url: '/assets/documents/rta-approval-pq.pdf',
};

const companyProfileSource = {
  label: 'VOLTRONIX company profile — PDF pages 24–25',
  url: '/assets/documents/voltronix-prequalification.pdf#page=24',
};

const rtaPrequalificationSource = {
  label: 'RTA contractor and supplier prequalification policies',
  url: 'https://rta.ae/wps/portal/rta/ae/home/about-rta/contractors-suppliers/general-policies/',
};

const constructionNocSource = {
  label: 'RTA: Construction NOC for infrastructure work',
  url: 'https://rta.ae/wps/portal/rta/ae/home/rta-services/service-details?lang=en&serviceId=315',
};

const designNocSource = {
  label: 'RTA: Design NOC for infrastructure works',
  url: 'https://www.rta.ae/wps/portal/rta/ae/home/rta-services/service-details?serviceId=313',
};

const specialNatureNocSource = {
  label: 'RTA: NOC for infrastructure works of special nature',
  url: 'https://rta.ae/wps/portal/rta/ae/home/rta-services/service-details?serviceId=316',
};

const approvalCoordinationSource = {
  label: 'VOLTRONIX: RTA approval coordination',
  url: 'https://voltronix.ae/rta-approved-contractor/',
};

// Public DEWA identity/category record reviewed 26 October 2026. Historical
// project evaluations in this record do not establish current RTA approval.
const dewaContractorSource = {
  label: 'DEWA: VOLTRONIX electrical contractor record',
  url: 'https://crm.dewa.gov.ae/irj/portal/anonymous/gradedet?bpnumber=17093911',
};

export const streetLightingContent = {
  slug: 'street-lighting',
  title: 'Street Lighting Contractor in Dubai | VOLTRONIX',
  metaDescription: 'Discuss Dubai street lighting, electrical cabling and RTA coordination with VOLTRONIX. Review conditional RTA prequalification and request a project quotation.',
  h1: 'Street Lighting Contractor in Dubai',
  directAnswer: 'Voltronix Contracting LLC handles road lighting enquiries in Dubai, supported by conditional RTA prequalification, documented electrical and cable works, and approval coordination services. Its supplied certificate covers street lighting works for roads, excludes tunnel lighting and specifies an AED 5 million value limit. Share your drawings and requirements so the team can confirm the project scope.',
  sections: [
    {
      id: 'street-lighting-scope',
      heading: 'Define your road lighting package',
      paragraphs: [
        'For a developer or main contractor, appointing a street lighting contractor starts with matching the required work to the contractor’s qualification and agreed scope. VOLTRONIX’s supplied RTA certificate identifies street lighting works within the Infrastructure-Roads category.',
        'Send the road lighting layout, location, quantities and available specifications. Identify any new installation, replacement or upgrade requirements separately so the team can confirm what can be included in its quotation.',
      ],
      bullets: [
        'Road and street lighting enquiries within the certificate’s stated scope.',
        'Electrical and cable works assessed against the project drawings and site interfaces.',
        'RTA documentation and approval coordination responsibilities defined for the project.',
      ],
      sources: [certificateSource, companyProfileSource, approvalCoordinationSource],
    },
    {
      id: 'electrical-and-cable-works',
      heading: 'Electrical and cable works with documented experience',
      paragraphs: [
        'The company profile records electrical installation, earthing, panel works, and excavation and cable shifting projects in Dubai. This provides evidence of related electrical experience; it should not be read as a completed street lighting project record.',
        'DEWA’s public contractor record lists VOLTRONIX CONTRACTING L.L.C. in the Contractor–Electrical category, with the company’s matching telephone number, email address and P.O. Box. This corroborates its electrical contracting identity; the separate RTA certificate defines the documented road-lighting prequalification.',
        'For a lighting package, identify cable routes, supply connections, panel interfaces and any civil work in the enquiry. Pole foundations, equipment installation, testing, commissioning and maintenance responsibilities must be confirmed in the agreed project scope.',
      ],
      bullets: [],
      sources: [companyProfileSource, dewaContractorSource],
    },
    {
      id: 'approval-coordination',
      heading: 'RTA approval and NOC coordination',
      paragraphs: [
        'VOLTRONIX offers support with technical documentation, submissions and responses to authority comments. The required approvals depend on the proposed work, its location and the authorities involved.',
        'Contractor prequalification and a project’s NOCs serve different purposes. RTA provides separate NOC services for infrastructure design and construction within the right-of-way. Approval decisions remain with RTA and the other relevant service authorities.',
      ],
      bullets: [],
      sources: [approvalCoordinationSource, designNocSource, constructionNocSource],
    },
  ],
  qualification: {
    heading: 'Review the RTA prequalification',
    intro: 'The latest certificate supplied by VOLTRONIX records the following scope and conditions. Read the certificate alongside your project requirements before appointment.',
    company: 'VOLTRONIX CONTRACTING L.L.C',
    registration: 'A025-6513466',
    agency: 'Traffic & Roads Agency',
    department: 'Roads',
    category: 'Infrastructure-Roads',
    workScope: 'Street Lighting works',
    status: 'Conditionally Prequalified',
    valueLimitAED: 5000000,
    valueLimit: 'AED 5,000,000',
    expiryDate: '2029-10-20',
    expiryLabel: '20 October 2029',
    printedDate: '2026-10-22',
    printedLabel: '22 October 2026',
    conditions: 'Road lighting only; tunnel lighting is excluded.',
    conditionVerbatim: 'For Road Light only not include Tunnel Light',
    note: 'The certificate states that the qualification is conditional and may be withdrawn by RTA. Confirm its current status, scope and any project-specific requirements before awarding work. Prequalification does not replace a project’s permits or NOCs.',
    source: certificateSource,
    sources: [certificateSource, rtaPrequalificationSource],
  },
  buyerBrief: {
    heading: 'Prepare a useful street lighting enquiry',
    intro: 'This is a buyer’s scope checklist, not a universal RTA submission checklist. The final documents and responsibilities depend on the project.',
    steps: [
      {
        title: 'Describe the site and work',
        text: 'Provide the Dubai site location, client or main contractor details, proposed programme and whether the work is a new installation, an upgrade or an existing-system enquiry.',
      },
      {
        title: 'Share the available design information',
        text: 'Include layouts, specifications, quantities, supply details and a bill of quantities if available. Identify missing information and any access or utility constraints.',
      },
      {
        title: 'Check qualifications and responsibilities',
        text: 'Review the certificate’s status, expiry, value limit and road lighting restriction. Agree who handles design, submissions, civil work, installation, inspections and authority coordination.',
      },
      {
        title: 'Agree the quotation and handover scope',
        text: 'Request an itemised scope with exclusions, programme assumptions and deliverables. Include testing, commissioning, as-built records or maintenance only where these are expressly agreed.',
      },
    ],
  },
  relatedEvidence: {
    heading: 'Related electrical project experience',
    paragraphs: [
      'VOLTRONIX’s published Galadari Arab Bandac project describes substation and LV room electrical works and warehouse electrical socket panel installation in Dubai. It is evidence of related electrical infrastructure experience, rather than a street lighting case study.',
      'For appointment to a road lighting package, request project references relevant to that scope and any supporting completion or inspection records.',
    ],
    links: [
      {
        label: 'View the Galadari electrical infrastructure project',
        url: 'https://voltronix.ae/project-portfolio/galadari-arab-substation-warehouse-electrical-works/',
      },
      companyProfileSource,
    ],
  },
  faqs: [
    {
      question: 'Is VOLTRONIX an RTA approved street lighting contractor?',
      answer: 'The supplied RTA certificate lists Voltronix Contracting LLC as “Conditionally Prequalified” for street lighting works under Infrastructure-Roads. It specifies an AED 5 million value limit, an expiry date of 20 October 2029 and a road lighting scope that excludes tunnel lighting. This is a conditional, scope-specific qualification; confirm current status and project requirements before appointment.',
      sources: [certificateSource],
    },
    {
      question: 'How can I verify a contractor’s RTA street lighting qualification?',
      answer: 'Request the latest certificate and compare the legal company name, registration reference, work scope, status, value limit, expiry and conditions with your project. Ask for confirmation of current status from the contractor and RTA where needed. A corporate website claim alone does not establish the current qualification, and the certificate does not replace project-specific approvals.',
      sources: [certificateSource, rtaPrequalificationSource],
    },
    {
      question: 'Which permits or NOCs may a Dubai street lighting project need?',
      answer: 'The required approvals depend on the site and proposed works. RTA has separate design and construction NOC services for infrastructure within the right-of-way. Work involving a power supply from an existing street lighting network may fall under its special-nature NOC service. Confirm the applicable route and documents with the project consultant and relevant authorities; these examples are not an exhaustive permit list.',
      sources: [designNocSource, constructionNocSource, specialNatureNocSource],
    },
    {
      question: 'Can VOLTRONIX support RTA submissions and approval coordination?',
      answer: 'VOLTRONIX’s corporate service information describes document preparation, submissions and responses to RTA comments. Agree the responsibilities for your particular project before work starts. Requirements and decisions remain with the relevant authorities, so an approval outcome or completion date cannot be guaranteed.',
      sources: [approvalCoordinationSource, constructionNocSource],
    },
    {
      question: 'Can the enquiry include electrical cabling and infrastructure works?',
      answer: 'Yes. The company profile documents electrical installation, earthing, panel works, and excavation and cable shifting experience. Include cable routes, supply information, existing utility details and the interfaces with the lighting work so the team can confirm what is included in its quotation.',
      sources: [companyProfileSource],
    },
    {
      question: 'Are pole foundations, testing, commissioning and maintenance included?',
      answer: 'These items should be confirmed individually in the quotation. VOLTRONIX describes testing, commissioning and maintenance support for its broader MEP services, but the documents linked here do not establish a standard street lighting package covering every item. State your required deliverables and obtain written confirmation of the work, exclusions and responsibilities.',
      sources: [{ label: 'VOLTRONIX MEP and electrical services', url: 'https://voltronix.ae/' }],
    },
    {
      question: 'What information is needed for a street lighting quotation?',
      answer: 'Share the site location, a description of the proposed work, drawings, quantities, equipment specifications and expected programme. Add the electrical supply details, access restrictions, available approvals and bill of quantities where available. Identify any design or site information that is still outstanding.',
      sources: [],
    },
    {
      question: 'How should a developer or main contractor appoint a street lighting subcontractor?',
      answer: 'Match the required scope to the contractor’s current qualification and relevant project evidence. Then agree an itemised quotation, interfaces with other contractors, approval responsibilities, programme assumptions and required handover records. Obtain written confirmation of any testing, commissioning or maintenance obligations before appointment.',
      sources: [certificateSource, rtaPrequalificationSource],
    },
  ],
  cta: {
    heading: 'Discuss your Dubai street lighting project',
    text: 'Share your drawings, location and programme. Ask the team to review the required scope and provide a project quotation.',
    label: 'Talk to Our Team',
    href: '/?service=street-lighting#contact',
    whatsappMessage: 'Hello VOLTRONIX, I would like to discuss a street lighting project in Dubai.',
  },
};
