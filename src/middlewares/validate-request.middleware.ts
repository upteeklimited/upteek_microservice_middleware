import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import { Reflector } from '@nestjs/core';
import { USERTYPES } from 'src/utils/constants';

@Injectable()
export class ValidateRequestMiddleware implements NestMiddleware {
  constructor(private readonly reflector: Reflector) {}

  use(req: Request, res: Response, next: NextFunction) {
    const requestApi = req.headers['x-client-type'] as string;

    if (!requestApi) {
      throw new ForbiddenException('Oops!, your request seams buggy');
    }

    if (!USERTYPES.includes(requestApi)) {
      throw new UnauthorizedException(
        'You must have us confused, please check your request',
      );
    }

    next();
  }
}
