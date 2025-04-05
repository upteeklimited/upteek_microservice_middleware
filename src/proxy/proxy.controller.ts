import { Controller, Req, Res, All, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from './proxy.service';

@Controller()
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @All('*') // Handle all HTTP methods
  async handleRequest(@Req() req: Request, @Res() res: Response) {
    try {
      const result = await this.proxyService.forwardRequest(req);

      // Set the response status and headers
      res.status(result.status);
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value as string);
      });

      // Send the response data
      res.send(result.data);
    } catch (error) {
      res
        .status(error.status || 500)
        .send(error.response || 'Internal Server Error');
    }
  }
}
