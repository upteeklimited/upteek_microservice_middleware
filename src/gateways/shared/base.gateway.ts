import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { PresenceService } from './presence.service';

export abstract class BaseGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  protected server: Server;

  constructor(protected readonly presenceService: PresenceService) {}

  /**
   * Handle client connection
   */
  handleConnection(client: Socket): void {
    console.log(`Socket connected: ${client.id}`);

    // Extract user information from handshake auth or query params
    const userId = this.extractUserId(client);
    const clientType = this.extractClientType(client);
    const namespace = this.extractNamespace(client);

    console.log(
      `Connection details - userId: ${userId}, clientType: ${clientType}, namespace: ${namespace}`,
    );

    // Register all clients, even without userId initially
    this.presenceService.registerClient(client.id, {
      userId: userId || 'anonymous', // Use 'anonymous' as placeholder
      clientType,
      namespace,
    });
    console.log(`Client ${client.id} registered successfully`);
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
    if (client.data?.authenticated && client.data?.user?.user?.id) {
      return client.data.user.user.id;
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
   * Override this method in subclasses for custom extraction logic
   */
  protected extractClientType(client: Socket): string | undefined {
    // First check if client has stored client type from authentication
    if (client.data?.clientType) {
      return client.data.clientType;
    }

    // Try to get from auth object first
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
}
