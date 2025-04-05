import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import { IS_PUBLIC_KEY } from 'src/decorators/public.decorator';
import { Reflector } from '@nestjs/core';
import { USERTYPES } from 'src/utils/constants';

@Injectable()
export class ValidateRequestMiddleware implements NestMiddleware {
  constructor(private readonly reflector: Reflector) {}

  use(req: Request, res: Response, next: NextFunction) {
    const requestApi = req.headers['x-request-api'] as string;

    // Check if the request is marked as bypassed
    // this is used by applying guard to an endpoint
    // see ping endpoint
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      req.route,
    );
    if (isPublic) {
      return next(); // Skip validation
    }

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
