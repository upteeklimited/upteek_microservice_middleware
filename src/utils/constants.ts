const USERTYPES: string[] = ['Admin', 'User', 'Bank'];

const SERVER_URLS = {
  admin: process.env.ADMIN || '',
  user: process.env.USERS || '',
  bank: process.env.BANK || '',
};

const UPLOAD_SIZE_LIMIT = 1 * 1024 * 1024; // 1MB in bytes
const PROXY_TIMEOUT_MS = 60 * 1000; // 30 seconds
const PROXY_MAX_BODY_SIZE = 10 * 1024 * 1024; // 20MB total body size

export {
  USERTYPES,
  SERVER_URLS,
  UPLOAD_SIZE_LIMIT,
  PROXY_TIMEOUT_MS,
  PROXY_MAX_BODY_SIZE,
};
