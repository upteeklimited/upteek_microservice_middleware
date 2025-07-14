import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import {
  PUBLIC_WEBSOCKET,
  WEBSOCKET_AUTH,
} from '../decorators/public.decorator';

import { AuthService } from '../services/auth.service';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';

export interface WebSocketAuthOptions {
  public?: boolean; // If true, authentication is not required
  requireClientType?: boolean; // If true, x-client-type header is required
}

@Injectable()
export class WebSocketAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const options: WebSocketAuthOptions = this.getAuthOptions(context);

    // If namespace is public, allow connection
    if (options.public) {
      console.log(`Public namespace access granted for client ${client.id}`);
      return true;
    }

    try {
      // Extract and validate client type header
      if (options.requireClientType !== false) {
        this.validateClientType(client);
      }

      // Extract and validate bearer token
      const token = this.extractBearerToken(client);
      if (!token) {
        throw new WsException('Bearer token is required');
      }

      // Get client type for auth verification
      const clientType = this.extractClientType(client);
      if (!clientType) {
        throw new WsException('client header is required for authentication');
      }

      // Verify token with auth service (synchronous for guard)
      const userData = this.authService.verifyJwtToken(token);
      if (!userData) {
        throw new WsException('Invalid or expired token');
      }

      // Store user data in socket for later use
      client.data.user = userData;
      client.data.authenticated = true;

      return true;
    } catch (error) {
      console.error(
        `Authentication failed for client ${client.id}:`,
        error.message,
      );
      throw new WsException(error.message || 'Authentication failed');
    }
  }

  private getAuthOptions(context: ExecutionContext): WebSocketAuthOptions {
    // Get the gateway class to determine auth options
    const gatewayClass = context.getClass();

    // Check if gateway is marked as public
    const isPublic = Reflect.getMetadata(PUBLIC_WEBSOCKET, gatewayClass);
    if (isPublic) {
      return { public: true, requireClientType: false };
    }

    // Check if gateway has auth options metadata
    const authOptions = Reflect.getMetadata(WEBSOCKET_AUTH, gatewayClass);

    return authOptions || { public: false, requireClientType: true };
  }

  private validateClientType(client: Socket): void {
    const clientType = this.extractClientType(client);
    if (!clientType) {
      throw new WsException('client header is required');
    }

    // Validate client type format using the same types as ProxyService
    const validClientTypes = ['admin', 'user', 'bank'];
    if (!validClientTypes.includes(clientType.toLowerCase())) {
      throw new WsException(`Invalid client type`);
    }

    // Store client type in socket data
    client.data.clientType = clientType.toLowerCase();
  }

  private extractClientType(client: Socket): string | undefined {
    // Try to get from headers first
    const headers = client.handshake.headers;
    if (headers['x-client-type']) {
      return Array.isArray(headers['x-client-type'])
        ? headers['x-client-type'][0]
        : headers['x-client-type'];
    }

    // Try to get from auth object
    const auth = client.handshake.auth;
    if (auth?.clientType) {
      return auth.clientType;
    }

    // Try to get from query parameters
    const query = client.handshake.query;
    if (query?.clientType) {
      return Array.isArray(query.clientType)
        ? query.clientType[0]
        : query.clientType;
    }

    return undefined;
  }

  private extractBearerToken(client: Socket): string | undefined {
    // Try to get from headers first
    const headers = client.handshake.headers;
    const authHeader = headers.authorization || headers.Authorization;

    if (authHeader) {
      const token = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      if (token.startsWith('Bearer ')) {
        return token.substring(7);
      }
    }

    // Try to get from auth object
    const auth = client.handshake.auth;
    if (auth?.token) {
      return auth.token;
    }

    // Try to get from query parameters
    const query = client.handshake.query;
    if (query?.token) {
      return Array.isArray(query.token) ? query.token[0] : query.token;
    }

    return undefined;
  }
}
