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
    // Enhanced debugging
    // console.log('=== REQUEST TYPE DETECTION ===');
    // console.log('Method:', req.method);
    // console.log('URL:', req.originalUrl);
    // console.log('Content-Type:', req.headers['content-type']);
    // console.log(
    //   'Content-Type (lowercase):',
    //   req.headers['content-type']?.toString().toLowerCase(),
    // );
    // console.log('All headers:', JSON.stringify(req.headers, null, 2));
    // console.log('Body exists:', !!req.body);
    // console.log('Body type:', typeof req.body);
    // console.log('Body keys:', req.body ? Object.keys(req.body) : 'no body');
    // console.log('================================');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      console.log('Preflight request detected - returning unknown');
      return 'unknown';
    }

    // Check for content-type header (case insensitive)
    const contentType = (
      req.headers['content-type'] ||
      req.headers['Content-Type'] ||
      ''
    )
      .toString()
      .toLowerCase();

    if (contentType.includes('application/json')) {
      // console.log('Detected JSON request');
      return 'json';
    }

    if (contentType.includes('multipart/form-data')) {
      // console.log('Detected form-data request');
      return 'form-data';
    }

    // Fallback: Try to detect by body content
    if (req.body) {
      if (typeof req.body === 'object' && !Array.isArray(req.body)) {
        console.log('No content-type but body is object - treating as JSON');
        return 'json';
      }
    }

    console.log('Could not determine request type - returning unknown');
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
