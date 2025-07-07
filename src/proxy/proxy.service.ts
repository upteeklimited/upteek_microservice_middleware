import { BadRequestException, Injectable } from '@nestjs/common';

import { Request } from 'express';

@Injectable()
export class ProxyService {
  logRequest(req: Request) {
    return {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
      query: req.query,
      params: req.params,
    };
  }

  detectRequestType(req: Request): 'json' | 'form-data' | 'unknown' {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      return 'json';
    }
    if (contentType.includes('multipart/form-data')) {
      return 'form-data';
    }
    return 'unknown';
  }

  getTargetUrl(req: Request): { targetUrl: string; userType: string } {
    const userTypeHeader = req.headers['x-client-type'] as string;
    if (!userTypeHeader) {
      throw new BadRequestException('Missing x-client-type header');
    }
    const SERVER_URLS = {
      admin: process.env.ADMIN || '',
      user: process.env.USERS || '',
      bank: process.env.BANK || '',
    };
    const userType = userTypeHeader.toLowerCase();
    if (!Object.keys(SERVER_URLS).includes(userType)) {
      throw new BadRequestException('Invalid x-client-type header');
    }
    const baseUrl = SERVER_URLS[userType];
    // Remove only /api from the path, keep everything after
    let path = req.originalUrl;
    if (path.startsWith('/api')) {
      path = path.replace(/^\/api/, '');
    }
    // Ensure no double slashes
    const targetUrl = baseUrl.replace(/\/$/, '') + path;
    console.log(targetUrl);
    return { targetUrl, userType };
  }
}
