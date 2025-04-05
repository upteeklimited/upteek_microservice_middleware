import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { USERTYPES } from 'src/utils/constants';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // 💡 See this condition
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Oops!, your request seams buggy');
    }
    if (!USERTYPES.includes(token)) {
      throw new UnauthorizedException(
        'You must have us confused, please check your request',
      );
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const requestApi = request.headers['x-request-api'] as string;
    return requestApi ? requestApi : undefined;
  }
}
