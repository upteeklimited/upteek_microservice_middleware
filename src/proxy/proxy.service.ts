import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios, { AxiosHeaders } from 'axios';

const SERVER_URLS = {
  admin: process.env.ADMIN,
  bank: process.env.BANK,
  merchant: process.env.MERCHANT,
  customer: process.env.CUSTOMER,
  rider: process.env.RIDER,
};

@Injectable()
export class ProxyService {
  async forwardRequest(req: any): Promise<any> {
    const requestApi = req.headers['x-request-api'] as string;

    const SERVER_URLS = {
      admin: process.env.ADMIN,
      bank: process.env.BANK,
      merchant: process.env.MERCHANT,
      customer: process.env.CUSTOMER,
      rider: process.env.RIDER,
    };

    // Get the target server URL based on the x-request-api value
    const targetUrl = SERVER_URLS[requestApi.toLowerCase()];
    if (!targetUrl) {
      throw new HttpException(
        'You must have us confused',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Forward the request to the target server
      const response = await axios({
        method: req.method,
        url: `${targetUrl}${req.originalUrl.replace('/api/', '')}`,
        headers: this.cleanHeaders(req.headers),
        data: req.body,
        params: req.query,
        timeout: 10000, // Timeout to avoid hanging requests
      });

      return {
        status: response.status,
        headers: response.headers,
        data: response.data,
      };
    } catch (err) {
      console.error('Error forwarding request:', err);

      // Handle cases where the error response might not exist
      const status = err.response?.status || HttpStatus.BAD_GATEWAY;
      const message = err.response?.data || 'Error forwarding request';

      throw new HttpException(message, status);
    }
  }

  private cleanHeaders(headers: Record<string, any>): AxiosHeaders {
    const axiosHeaders = new AxiosHeaders();

    // Remove headers that should not be forwarded
    const {
      host,
      connection,
      'content-length': contentLength,
      ...rest
    } = headers;

    // Add sanitized headers to AxiosHeaders instance
    for (const [key, value] of Object.entries(rest)) {
      if (value) {
        axiosHeaders.set(key, Array.isArray(value) ? value.join(',') : value);
      }
    }

    return axiosHeaders;
  }
}
