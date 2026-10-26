const configuredUrl = new URL(process.env.SITE_URL || 'https://rtacontractor.ae');
if (configuredUrl.protocol !== 'https:' || configuredUrl.username || configuredUrl.password || configuredUrl.pathname !== '/' || configuredUrl.search || configuredUrl.hash) {
  throw new Error('SITE_URL must be an HTTPS origin without credentials, a path, query or fragment.');
}
const streetAddress = 'Shed 06, Aber Warehouse, Dubai Investment Park 02';

export const site = {
  name: 'VOLTRONIX',
  legalName: 'Voltronix Contracting LLC',
  url: configuredUrl.origin,
  corporateUrl: 'https://voltronix.ae/',
  email: 'info@voltronix.ae',
  phone: '+971 4 824 0002',
  phoneLink: '+97148240002',
  mobile: '+971 50 242 0957',
  whatsapp: '971502420957',
  address: `${streetAddress}, Dubai, UAE`,
  streetAddress,
  locality: 'Dubai',
  countryCode: 'AE',
  postOfficeBoxNumber: '414345',
  since: '2009',
};
