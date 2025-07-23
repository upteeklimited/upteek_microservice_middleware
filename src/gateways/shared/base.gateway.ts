import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { AuthService } from '../services/auth.service';
import { PresenceService } from './presence.service';

export abstract class BaseGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  protected server: Server;

  constructor(
    protected readonly presenceService: PresenceService,
    protected readonly authService: AuthService,
  ) {}

  /**
   * Handle client connection
   */
  handleConnection(client: Socket): void {
    // Extract userId and clientType if provided
    let userId = this.extractUserId(client) || client.id;
    const clientType = this.extractClientType(client);
    const namespace = this.extractNamespace(client);

    console.log(clientType);

    // if (clientType === undefined) {
    //   this.handleDisconnect(client);
    //   return;
    // }

    // Attempt to validate token if present
    const token = this.extractBearerToken(client);
    if (token && this.authService) {
      const userData = this.authService.verifyJwtToken(token);
      if (userData && userData.user && userData.user.id) {
        userId = userData.user.id;
        client.data.user = userData.user;
        client.data.authenticated = true;
        // Do not update clientType from token, as it's not present in UserData
      }
    }

    this.presenceService.registerClient(
      client.id,
      {
        userId,
        clientType,
        namespace,
      },
      this.server,
    );
    // eslint-disable-next-line no-console
    console.log(
      `Client ${client.id} registered as ${userId} in namespace ${namespace}`,
    );
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket): void {
    console.log(`Socket disconnected: ${client.id}`);

    // Check if client was registered before trying to unregister
    const clientData = this.presenceService.getClientData(client.id);
    if (clientData) {
      console.log(`Unregistering client ${client.id} with data:`, clientData);
      this.presenceService.unregisterClient(client.id);
    } else {
      console.log(
        `Client ${client.id} was not registered, skipping unregistration`,
      );
    }
  }

  /**
   * Extract user ID from client connection
   * Override this method in subclasses for custom extraction logic
   */
  protected extractUserId(client: Socket): string | undefined {
    // First check if client is authenticated and has user data
    if (client.data?.authenticated && client.data?.user?.id) {
      return client.data.user.id;
    }

    // Try to get from auth object first
    const auth = client.handshake.auth;
    if (auth?.userId) {
      return auth.userId;
    }

    // Try to get from query parameters
    const query = client.handshake.query;
    if (query?.userId) {
      return Array.isArray(query.userId) ? query.userId[0] : query.userId;
    }

    return undefined;
  }

  /**
   * Extract client type from client connection
   * Now only from x-client-type header, handshake auth, or query
   */
  protected extractClientType(client: Socket): string | undefined {
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

  /**
   * Extract namespace from client connection
   * Override this method in subclasses for custom extraction logic
   */
  protected extractNamespace(client: Socket): string | undefined {
    // Get namespace from the socket's namespace
    return client.nsp.name;
  }

  /**
   * Validate if client is authenticated
   */
  protected isAuthenticated(client: Socket): boolean {
    const userId = this.extractUserId(client);
    return !!userId;
  }

  /**
   * Get client data for a socket
   */
  protected getClientData(clientId: string) {
    return this.presenceService.getClientData(clientId);
  }

  /**
   * Update client data
   */
  protected updateClientData(clientId: string, updates: any): void {
    this.presenceService.updateClientData(clientId, updates);
  }

  /**
   * Emit message to a specific room
   */
  protected emitToRoom(roomName: string, event: string, data: any): void {
    this.server.to(roomName).emit(event, data);
  }

  /**
   * Emit message to a specific client
   */
  protected emitToClient(clientId: string, event: string, data: any): void {
    this.server.to(clientId).emit(event, data);
  }

  /**
   * Emit message to a specific client using PresenceService
   */
  protected emitClientMessage(
    clientId: string,
    message: string,
    data?: any,
  ): void {
    this.presenceService.emitClientMessage(
      this.server,
      clientId,
      message,
      data,
    );
  }

  /**
   * Broadcast message to all connected clients
   */
  protected broadcast(event: string, data: any): void {
    this.server.emit(event, data);
  }

  /**
   * Get connection statistics
   */
  protected getConnectionStats() {
    return this.presenceService.getStats();
  }

  /**
   * Get namespace-specific statistics
   */
  protected getNamespaceStats(namespace: string) {
    return this.presenceService.getNamespaceStats(namespace);
  }

  /**
   * Update client authentication data after verification
   */
  protected updateClientAuth(
    client: Socket,
    userId: string,
    clientType?: string,
  ): void {
    this.presenceService.updateClientData(client.id, {
      userId,
      clientType,
    });
    client.data.authenticated = true;
    client.data.userId = userId;
    if (clientType) client.data.clientType = clientType;
  }

  /**
   * Extract bearer token from headers, auth, or query
   */
  protected extractBearerToken(client: Socket): string | undefined {
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
