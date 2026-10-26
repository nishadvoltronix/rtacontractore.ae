/**
 * Existing enquiry scopes; specialist availability must be confirmed in a quote.
 * Three documented categories have Service schema. Unverified specialisms retain
 * their useful enquiry pages without asserting a verified service entity.
 */
import { streetLightingContent } from './street-lighting-content.mjs';
export const services = [
  {
    slug: 'street-lighting',
    title: 'Street lighting',
    shortTitle: 'Street lighting',
    verifiedService: true,
    description: 'Road lighting and electrical cabling enquiries in Dubai, supported by conditional RTA prequalification and project-specific approval coordination.',
    intro: streetLightingContent.directAnswer,
    scope: streetLightingContent.sections[0].bullets,
    considerations: 'The right scope starts with the intended use of the road or space. Mounting height, pole spacing, pedestrian activity, nearby properties and access for future maintenance all influence the installation. Share the consultant drawings and project specifications to establish a practical starting point.',
    faqs: [
      {
        question: 'What information is useful for a street lighting quotation?',
        answer: 'Provide the site location, lighting layout, pole and luminaire specifications, quantities, available electrical supply and proposed programme. Include a bill of quantities if one is available, plus any access restrictions or interfaces with other contractors.',
      },
      {
        question: 'Can the scope cover both new roads and existing developments?',
        answer: 'New installations and upgrades have different requirements. For an existing development, the condition of the poles, foundations, cabling and controls needs to be understood before defining what can be retained or replaced.',
      },
      {
        question: 'What should be included in a lighting handover?',
        answer: 'Agree the deliverables at the start of the project. Depending on the contract, these may include inspection and test records, as-built drawings, equipment information and a maintenance schedule.',
      },
    ],
  },
  {
    slug: 'underground-cabling',
    verifiedService: true,
    title: 'Underground cabling',
    shortTitle: 'Underground cabling',
    description: 'Underground electrical cabling and LV network installation for Dubai infrastructure, including cable routes, ducts, terminations and testing.',
    intro: 'A dependable electrical network begins below the surface. Coordinate cable routes, duct systems, cable installation and terminations with the wider civil works, so every connection has a clear route from supply to final load.',
    scope: [
      'Review of cable routes and available utility information',
      'Coordination of trenching, ducting and draw pits',
      'Cable pulling, identification and termination',
      'Interfaces with lighting panels and distribution equipment',
      'Cable testing and installation records',
    ],
    considerations: 'Existing services, ground conditions, crossing points and reinstatement requirements can change the scope substantially. Current utility information and a coordinated route drawing help identify these interfaces before installation. Cable selection and protection should follow the project design and applicable requirements.',
    faqs: [
      {
        question: 'Is excavation included with underground cabling?',
        answer: 'Excavation, duct installation, cable work and surface reinstatement should each be identified in the quotation. Some projects package them together; others split responsibility between civil and electrical contractors.',
      },
      {
        question: 'What drawings are needed to review a cable installation?',
        answer: 'Useful documents include the route layout, cable schedule, single-line diagram, duct details and available utility records. The location of supply points, crossings and equipment connections should also be shown.',
      },
      {
        question: 'Can an existing underground cable network be extended?',
        answer: 'An extension depends on the existing network condition, capacity and route availability. Review the current drawings and test information alongside the proposed new loads before deciding the extent of the work.',
      },
    ],
  },
  {
    slug: 'high-mast-area-lighting',
    verifiedService: false,
    title: 'High-mast & area lighting',
    shortTitle: 'High-mast lighting',
    description: 'Prepare a high-mast or area lighting enquiry for a Dubai site. Discuss design, access and equipment requirements, and confirm specialist scope with VOLTRONIX.',
    intro: 'Large outdoor spaces need considered light distribution. Define a coordinated lighting installation for car parks, logistics yards, sports areas and open spaces, with attention to visibility, neighbouring areas and long-term access.',
    scope: [
      'Review of area layouts and lighting design requirements',
      'Mast, pole and foundation coordination',
      'Floodlight installation and aiming',
      'Power distribution and lighting control connections',
      'Testing, commissioning and maintenance access planning',
    ],
    considerations: 'Coverage alone is only part of the brief. The activities taking place, surrounding buildings, glare, operating hours and the method of maintaining elevated equipment all matter. A lighting calculation and an agreed equipment specification help translate the brief into an installation scope.',
    faqs: [
      {
        question: 'Where is high-mast lighting typically used?',
        answer: 'High-mast systems are used where a large area needs coverage from a limited number of mounting locations, such as logistics yards and extensive car parks. The choice between high masts and smaller poles depends on the design, site constraints and maintenance approach.',
      },
      {
        question: 'How are mounting height and light positions selected?',
        answer: 'These should be established through the lighting design, taking account of the task, dimensions of the site, obstructions and surrounding properties. Installation follows the agreed layout and equipment specification.',
      },
      {
        question: 'What should be considered for future maintenance?',
        answer: 'Allow for safe access to luminaires and controls, equipment clearances, isolation arrangements and the intended lifting or lowering method. These requirements are easier to resolve during design than after the installation is complete.',
      },
    ],
  },
  {
    slug: 'led-solar-lighting',
    verifiedService: false,
    title: 'LED & solar lighting',
    shortTitle: 'LED & solar lighting',
    description: 'Prepare an LED upgrade or solar lighting enquiry in Dubai. Review site conditions, controls and maintenance needs, then confirm the available project scope.',
    intro: 'Choose lighting around the way a place is used. From an LED luminaire upgrade to a standalone solar installation, assess the existing infrastructure, operating hours and site conditions before defining the right equipment and controls.',
    scope: [
      'Review of existing luminaires and lighting requirements',
      'LED replacement and retrofit installation scopes',
      'Solar luminaire, panel and battery installation coordination',
      'Timers, sensors and compatible control interfaces',
      'Commissioning and equipment handover information',
    ],
    considerations: 'For an LED upgrade, compare the required light distribution and control compatibility as well as power consumption. Solar lighting also needs a site-specific assessment of shading, operating duration, battery capacity and maintenance access. Performance and savings depend on the selected system and actual conditions.',
    faqs: [
      {
        question: 'Can LED luminaires be fitted to existing lighting poles?',
        answer: 'A retrofit depends on the condition and suitability of the poles, brackets, wiring and controls. The replacement luminaire also needs to meet the lighting design. An equipment review helps establish whether a direct replacement or a wider upgrade is needed.',
      },
      {
        question: 'Is solar lighting suitable for every site?',
        answer: 'Suitability depends on available sunlight, shading, the lighting schedule, battery requirements and the intended application. Share the site layout and operating brief so these factors can be reviewed before selecting a system.',
      },
      {
        question: 'How can potential energy savings be assessed?',
        answer: 'Compare the existing and proposed equipment ratings, operating hours and control strategy while maintaining the required lighting performance. A useful estimate states these assumptions clearly instead of relying on a general savings percentage.',
      },
    ],
  },
  {
    slug: 'lighting-maintenance',
    verifiedService: false,
    title: 'Lighting maintenance',
    shortTitle: 'Lighting maintenance',
    description: 'Discuss a lighting maintenance enquiry in Dubai with VOLTRONIX. Share asset details and faults to confirm the scope, access needs and service availability.',
    intro: 'Keep lighting assets serviceable with a maintenance plan that reflects their condition and use. Combine routine inspections with a clear approach to faults, replacement components and records, whether for a single development or a wider lighting network.',
    scope: [
      'Visual inspections of lighting assets and accessible equipment',
      'Luminaire, driver and control component replacement',
      'Investigation of cable and electrical supply faults',
      'Pole and equipment condition reporting',
      'Planned maintenance schedules and work records',
    ],
    considerations: 'A useful maintenance scope defines the asset list, inspection frequency, access arrangements, exclusions and reporting requirements. Response expectations and spare-parts responsibilities should also be agreed explicitly, especially where work affects occupied sites or active roads.',
    faqs: [
      {
        question: 'What is the difference between planned maintenance and fault repair?',
        answer: 'Planned maintenance is scheduled work intended to inspect and maintain the lighting system. Fault repair responds to a specific problem, such as an outage or a failed control component. A maintenance agreement can define both elements separately.',
      },
      {
        question: 'What information helps with a lighting fault enquiry?',
        answer: 'Include the location, affected asset references, a description of the fault and when it occurs. Existing drawings, recent maintenance records and safely taken photographs can also help define the investigation.',
      },
      {
        question: 'What should a maintenance quotation specify?',
        answer: 'Look for a clear asset schedule, visit frequency, scope of inspections, parts policy, access responsibilities and reporting format. Any response times or out-of-hours arrangements should be stated in the agreed contract.',
      },
    ],
  },
  {
    slug: 'electrical-infrastructure',
    verifiedService: true,
    title: 'Electrical infrastructure',
    shortTitle: 'Electrical infrastructure',
    description: 'Electrical infrastructure installation scopes for Dubai and UAE developments, including LV distribution, lighting panels, earthing and testing.',
    intro: 'Connect the individual elements of a development into a coordinated electrical installation. Align distribution equipment, lighting panels, cable containment and earthing with the project drawings, civil programme and final handover requirements.',
    scope: [
      'Review of electrical layouts and scope interfaces',
      'LV distribution and lighting control panel installation',
      'Cable containment and equipment connections',
      'Earthing and bonding installation',
      'Inspection, testing and as-built documentation',
    ],
    considerations: 'Clear interfaces between the designer, civil contractor, electrical installer and equipment suppliers support an orderly installation. Confirm the supply arrangement, connected loads, installation boundaries and required test records before work begins. The applicable project specifications govern the final scope.',
    faqs: [
      {
        question: 'What documents support an electrical infrastructure enquiry?',
        answer: 'Share the single-line diagram, load schedule, electrical layouts, equipment specifications and bill of quantities where available. Include the project location and programme so site interfaces can be considered.',
      },
      {
        question: 'Can the scope include earthing and bonding?',
        answer: 'Earthing and bonding can be defined as part of the electrical installation scope. The design, material requirements, interfaces and testing deliverables should be identified in the project specification and quotation.',
      },
      {
        question: 'How are responsibilities between contractors defined?',
        answer: 'Use a scope matrix or clearly itemised quotation to identify who supplies, installs, connects, tests and documents each element. This is particularly helpful for foundations, trenching, panels, utility connections and final reinstatement.',
      },
    ],
  },
];

export const generalFaqs = [
  {
    question: 'What types of projects can I enquire about?',
    answer: 'Send enquiries for street lighting, underground cabling, high-mast and area lighting, LED and solar installations, lighting maintenance and electrical infrastructure. Include whether the requirement is a new installation, an upgrade or maintenance work.',
  },
  {
    question: 'What should I include in a project brief?',
    answer: 'Start with the site location, a short description of the work and your expected programme. Drawings, specifications, a bill of quantities and existing asset information make the brief more useful. If some details are still being developed, identify what is available.',
  },
  {
    question: 'Can I enquire about a project outside Dubai?',
    answer: 'Include the emirate and exact site location in your enquiry. Location, access, project scope and programme are all relevant when reviewing work elsewhere in the UAE.',
  },
  {
    question: 'How are project requirements and approvals handled?',
    answer: 'Identify the relevant client, consultant and authority requirements during scoping. Responsibility for design, submissions, permits and inspections should be agreed before work starts and clearly recorded in the project scope.',
  },
  {
    question: 'Can an existing lighting system be reviewed for an upgrade?',
    answer: 'An upgrade brief should describe the current installation and what needs to improve, such as light distribution, equipment condition or operating costs. Existing drawings, equipment details and maintenance history help establish the scope of a review.',
  },
];
