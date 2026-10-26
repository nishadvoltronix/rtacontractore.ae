import { streetLightingContent as content } from '../street-lighting-content.mjs';

// Use the shared visual system; all evidence and answers remain in static HTML.
export function streetLightingPage({ esc, photo, arrow, icon, faqs, serviceCard, services, site }) {
  const links = items => items?.length ? `<ul class="evidence-links">${items.map(item => `<li><a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.label)} ↗</a></li>`).join('')}</ul>` : '';
  const paragraphs = items => items.map(text => `<p>${esc(text)}</p>`).join('');
  const qualification = content.qualification;
  const facts = [
    ['Company', qualification.company],
    ['Registration', qualification.registration],
    ['Status', qualification.status],
    ['Category', `${qualification.agency} / ${qualification.department} / ${qualification.category}`],
    ['Work scope', qualification.workScope],
    ['Value limit', qualification.valueLimit],
    ['Expiry', qualification.expiryLabel],
    ['Certificate printed', qualification.printedLabel],
    ['Condition', qualification.conditions],
  ];
  const enquiry = '/?service=street-lighting#contact';
  return `<main id="main">
    <section class="service-hero"><div class="container">
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span aria-current="page">Street lighting</span></nav>
      <div class="service-hero-grid"><div><div class="eyebrow">ROAD LIGHTING / DUBAI</div>
        <h1>${esc(content.h1)}</h1><p class="service-answer">${esc(content.directAnswer)}</p>
        <a class="btn btn-primary" href="${enquiry}">${esc(content.cta.label)} ${arrow}</a>
        <a class="qualification-link" href="#rta-prequalification">Review the RTA qualification ↓</a>
      </div><div>${photo('dubai-road-light-trails.webp', 'loading="eager" fetchpriority="high"')}<p class="service-photo-note">Representative Dubai road imagery. See documented electrical experience below.</p></div></div>
    </div></section>
    <section class="section"><div class="container service-body">
      <div class="service-evidence">${content.sections.map(section => `<section id="${esc(section.id)}"><h2>${esc(section.heading)}</h2>${paragraphs(section.paragraphs)}${section.bullets.length ? `<ul class="scope-list">${section.bullets.map(text => `<li>${icon('check')}<span>${esc(text)}</span></li>`).join('')}</ul>` : ''}${links(section.sources)}</section>`).join('')}
        <p>Explore related <a href="/services/underground-cabling/">underground cabling</a>, <a href="/services/electrical-infrastructure/">electrical infrastructure</a> and <a href="/services/lighting-maintenance/">maintenance enquiry requirements</a>.</p>
      </div>
      <aside class="service-aside qualification" id="rta-prequalification" aria-labelledby="qualification-title">
        <div class="eyebrow">QUALIFICATION EVIDENCE</div><h2 id="qualification-title">${esc(qualification.heading)}</h2><p>${esc(qualification.intro)}</p>
        <dl>${facts.map(([label,value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
        <p>${esc(qualification.note)}</p>${links(qualification.sources)}
        <p class="evidence-reviewed">Latest record confirmed by VOLTRONIX on 24 October 2026. Current RTA portal status has not been independently checked.</p>
        <a class="text-link" href="tel:${site.phoneLink}">${site.phone} ${arrow}</a>
      </aside>
    </div></section>
    <section class="section service-brief"><div class="container"><div class="section-top"><div><div class="eyebrow">BEFORE APPOINTMENT</div><h2>${esc(content.buyerBrief.heading)}</h2></div><p>${esc(content.buyerBrief.intro)}</p></div>
      <ol class="process-grid buyer-steps">${content.buyerBrief.steps.map((step,index) => `<li class="process-item"><span>0${index + 1} / PROJECT BRIEF</span><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></li>`).join('')}</ol>
    </div></section>
    <section class="section"><div class="container service-body"><div class="service-evidence"><div class="eyebrow">COMPANY PROJECT RECORDS</div><h2>${esc(content.relatedEvidence.heading)}</h2>${paragraphs(content.relatedEvidence.paragraphs)}${links(content.relatedEvidence.links)}</div>
      <aside class="service-aside"><h3>A Dubai-based team</h3><p>${esc(site.legalName)}<br>${esc(site.address)}</p><p>P.O. Box ${esc(site.postOfficeBoxNumber)}</p><a class="text-link" href="mailto:${site.email}">${site.email} ${arrow}</a><a class="text-link" href="https://voltronix.ae/contact-us/" target="_blank" rel="noopener">Company contact details ${arrow}</a></aside>
    </div></section>
    <section class="section faq-section"><div class="container faq-layout"><div class="faq-intro"><div class="eyebrow">BEFORE YOU BEGIN</div><h2>Dubai street lighting questions.</h2><p>Practical guidance for checking qualifications, scoping works and discussing project approvals. Formal requirements and decisions remain with the relevant authorities.</p></div>${faqs(content.faqs)}</div></section>
    <section class="section service-related"><div class="container"><div class="eyebrow">CONNECTED EXPERTISE</div><h2>The wider picture.</h2><div class="service-related-grid">${services.filter(service => ['underground-cabling','electrical-infrastructure','lighting-maintenance'].includes(service.slug)).map(service => serviceCard(service,services.indexOf(service),true)).join('')}</div></div></section>
    <section class="section service-brief"><div class="container service-closing"><h2>${esc(content.cta.heading)}</h2><p>${esc(content.cta.text)}</p><a class="btn btn-primary" href="${enquiry}">${esc(content.cta.label)} ${arrow}</a></div></section>
  </main>`;
}
