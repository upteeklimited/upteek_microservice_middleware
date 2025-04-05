const USERTYPES: string[] = ['Admin', 'Customer', 'Business', 'Bank', 'Rider'];

const SERVER_URLS = {
  admin: process.env.ADMIN ?? '',
  bank: process.env.BANK ?? '',
  merchant: process.env.MERCHANT ?? '',
  customer: process.env.CUSTOMER ?? '',
  rider: process.env.RIDER ?? '',
};

export { USERTYPES, SERVER_URLS };
