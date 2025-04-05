import {
  BadRequestException,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import { USERTYPES } from 'src/utils/constants';

@Injectable()
export class ValidateRequestMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestApi = req.headers['x-request-api'] as string;

    if (!requestApi) {
      throw new BadRequestException('Oops!, your request seams buggy');
    }

    if (!USERTYPES.includes(requestApi)) {
      throw new UnauthorizedException(
        'You must have us confused, please check your request',
      );
    }

    next();
  }
}
