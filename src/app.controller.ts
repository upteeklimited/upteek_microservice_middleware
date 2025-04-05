import { Controller, Get } from '@nestjs/common';

import { AppService } from './app.service';
import { Public } from './decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('ping')
  @Public()
  ping(): string {
    return 'Health ping';
  }

  @Get('keep_alive')
  @Public()
  keepAlive(): string {
    return 'Health ping';
  }
}
