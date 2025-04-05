import { Controller, Get } from '@nestjs/common';

import { Public } from 'src/decorators/public.decorator';

@Controller('ping')
@Public()
export class PingController {
  @Get()
  getHello(): string {
    return 'Hello';
  }
}
