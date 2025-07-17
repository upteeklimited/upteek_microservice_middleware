import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

export interface ClientData {
  userId: string;
  clientType?: string;
  roomName?: string;
  namespace?: string;
  connectedAt: Date;
}

export interface RoomData {
  type: string;
  client: string;
  namespace?: string;
  joinedAt: Date;
}

@Injectable()
export class PresenceService {
  private clients = new Map<string, ClientData>();
  private rooms: Map<string, Array<RoomData>> = new Map();
  private userSocketMap = new Map<string, Set<string>>();
  private namespaceClients = new Map<string, Set<string>>();

  /**
   * Register a client connection
   */
  registerClient(
    clientId: string,
    data: Omit<ClientData, 'connectedAt'>,
    server?: Server,
  ): void {
    const userIdKey = String(data.userId);

    // Disconnect and unregister all existing sockets for this user
    const existingSockets = this.userSocketMap.get(userIdKey);
    if (existingSockets) {
      for (const existingClientId of existingSockets) {
        this.unregisterClient(existingClientId);
        if (server && server.sockets && server.sockets.sockets) {
          const socket = server.sockets.sockets.get(existingClientId);
          if (socket) {
            socket.disconnect(true);
          }
        }
      }
    }

    this.clients.set(clientId, {
      ...data,
      connectedAt: new Date(),
    });

    if (!this.userSocketMap.has(userIdKey)) {
      this.userSocketMap.set(userIdKey, new Set());
    }
    this.userSocketMap.get(userIdKey)!.add(clientId);

    // Update namespace-socket mapping
    if (data.namespace) {
      if (!this.namespaceClients.has(data.namespace)) {
        this.namespaceClients.set(data.namespace, new Set());
      }
      this.namespaceClients.get(data.namespace)!.add(clientId);
    }

    console.log(
      `Client registered: ${clientId} for user: ${data.userId} in namespace: ${data.namespace}`,
    );
  }

  /**
   * Unregister a client connection
   */
  unregisterClient(clientId: string): void {
    console.log('unregistering client: ' + clientId);
    const clientData = this.clients.get(clientId);
    console.log(clientData);
    if (clientData) {
      console.log('is client');
      // Remove from user-socket mapping
      if (clientData.userId) {
        const userIdKey = String(clientData.userId);
        const userSockets = this.userSocketMap.get(userIdKey);
        if (userSockets) {
          userSockets.delete(clientId);
          if (userSockets.size === 0) {
            this.userSocketMap.delete(userIdKey);
          }
        }
      }

      // Remove from namespace-socket mapping
      if (clientData.namespace) {
        const namespaceSockets = this.namespaceClients.get(
          clientData.namespace,
        );
        if (namespaceSockets) {
          namespaceSockets.delete(clientId);
          if (namespaceSockets.size === 0) {
            this.namespaceClients.delete(clientData.namespace);
          }
        }
      }

      console.log(`clients room: ${clientData.roomName}`);

      // Remove from rooms
      if (clientData.roomName) {
        console.log(`removing from room ${clientData.roomName}`);
        this.removeClientFromRoom(clientData.roomName, clientId);
      }

      this.clients.delete(clientId);
      console.log(`Client unregistered: ${clientId}`);
    }
  }

  /**
   * Add client to a room
   */
  addClientToRoom(roomName: string, data: Omit<RoomData, 'joinedAt'>): void {
    const existing = this.rooms.get(roomName) || [];
    existing.push({
      ...data,
      joinedAt: new Date(),
    });
    this.rooms.set(roomName, existing);

    // Update client data with room name
    const clientData = this.clients.get(data.client);
    if (clientData) {
      clientData.roomName = roomName;
    }

    console.log(`Client ${data.client} added to room: ${roomName}`);
  }

  /**
   * Remove client from a room
   */
  removeClientFromRoom(roomName: string, clientId: string): void {
    const roomData = this.rooms.get(roomName);
    console.log(`to be removed ${clientId} ${roomName}`);
    console.log(`room data ${roomData}`);
    if (roomData) {
      const updatedRoomData = roomData.filter(
        (data) => data.client !== clientId,
      );
      if (updatedRoomData.length === 0) {
        console.log('removing room');
        this.rooms.delete(roomName);
      } else {
        console.log('removing only client ' + updatedRoomData);
        this.rooms.set(roomName, updatedRoomData);
      }
    }
  }

  /**
   * Check if room exists
   */
  roomExists(roomName: string): boolean {
    return this.rooms.has(roomName);
  }

  /**
   * Get number of rooms
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Check if client type already exists in room
   */
  hasClientTypeInRoom(roomName: string, clientType: string): boolean {
    const roomData = this.rooms.get(roomName);
    if (!roomData) {
      return false;
    }
    return roomData.some((data) => data.type === clientType);
  }

  /**
   * Remove all clients of a given clientType from a room
   */
  removeClientTypeFromRoom(roomName: string, clientType: string): void {
    const roomData = this.rooms.get(roomName);
    if (!roomData) return;
    // Find all clients in the room with the specified clientType
    const clientsToRemove = roomData.filter((data) => data.type === clientType);
    for (const client of clientsToRemove) {
      this.removeClientFromRoom(roomName, client.client);
    }
  }

  /**
   * Get all clients for a user
   */
  getUserSockets(userId: string): Set<string> | undefined {
    return this.userSocketMap.get(userId);
  }

  /**
   * Get all clients for a namespace
   */
  getNamespaceClients(namespace: string): Set<string> | undefined {
    return this.namespaceClients.get(namespace);
  }

  /**
   * Get client data
   */
  getClientData(clientId: string): ClientData | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get room data
   */
  getRoomData(roomName: string): RoomData[] | undefined {
    return this.rooms.get(roomName);
  }

  /**
   * Get all rooms data
   */
  getAllRoomsData(): Map<string, RoomData[]> {
    return this.rooms;
  }

  /**
   * Get rooms for a specific namespace
   */
  getNamespaceRooms(namespace: string): Map<string, RoomData[]> {
    const namespaceRooms = new Map<string, RoomData[]>();

    for (const [roomName, roomData] of this.rooms) {
      const hasNamespaceClient = roomData.some(
        (data) => data.namespace === namespace,
      );
      if (hasNamespaceClient) {
        namespaceRooms.set(roomName, roomData);
      }
    }

    return namespaceRooms;
  }

  /**
   * Disconnect all clients in a room
   */
  disconnectRoom(server: Server, roomName: string): void {
    const roomData = this.rooms.get(roomName);
    if (roomData) {
      roomData.forEach((data) => {
        const client = server.sockets.sockets.get(data.client);
        if (client) {
          client.leave(roomName);
          this.unregisterClient(data.client);
          client.disconnect(true);
        }
      });
      this.rooms.delete(roomName);
      console.log(`Disconnected all clients in room: ${roomName}`);
    }
  }

  /**
   * Emit message to all connected clients
   */
  emitServerMessage(server: Server, message: string, data?: any): void {
    server.emit('message', {
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if a client is still connected
   */
  isClientConnected(server: Server, clientId: string): boolean {
    try {
      if (!server || !server.sockets || !server.sockets.sockets) {
        return false;
      }
      return server.sockets.sockets.has(clientId);
    } catch (error) {
      console.error(
        `Error checking if client ${clientId} is connected:`,
        error,
      );
      return false;
    }
  }

  /**
   * Emit message to a specific client
   */
  emitClientMessage(
    server: Server,
    clientId: string,
    message: string,
    data?: any,
  ): void {
    try {
      // Check if server and sockets are available
      if (!server || !server.sockets || !server.sockets.sockets) {
        console.log(`Server or sockets not available for client ${clientId}`);
        return;
      }

      const client = server.sockets.sockets.get(clientId);
      if (client) {
        client.emit('message', {
          message,
          data,
          timestamp: new Date().toISOString(),
        });
        console.log(`Message sent to client ${clientId}:`, message);
      } else {
        console.log(
          `Client ${clientId} not found in server sockets collection`,
        );

        // Check if client exists in our tracking
        const clientData = this.getClientData(clientId);
        if (clientData) {
          console.log(
            `Client ${clientId} exists in our tracking but not in server sockets`,
          );
          // Remove from our tracking since it's not in server sockets
          this.unregisterClient(clientId);
        } else {
          console.log(`Client ${clientId} not found in our tracking either`);
        }
      }
    } catch (error) {
      console.error(`Error emitting message to client ${clientId}:`, error);
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalClients: number;
    totalRooms: number;
    totalUsers: number;
    totalNamespaces: number;
  } {
    return {
      totalClients: this.clients.size,
      totalRooms: this.rooms.size,
      totalUsers: this.userSocketMap.size,
      totalNamespaces: this.namespaceClients.size,
    };
  }

  /**
   * Get namespace-specific statistics
   */
  getNamespaceStats(namespace: string): {
    clients: number;
    rooms: number;
  } {
    const namespaceClients = this.namespaceClients.get(namespace);
    const namespaceRooms = this.getNamespaceRooms(namespace);

    return {
      clients: namespaceClients?.size || 0,
      rooms: namespaceRooms.size,
    };
  }

  /**
   * Update client data (e.g., when userId becomes available after initial connection)
   */
  updateClientData(clientId: string, updates: Partial<ClientData>): void {
    const existingData = this.clients.get(clientId);
    if (existingData) {
      const updatedData = { ...existingData, ...updates };
      this.clients.set(clientId, updatedData);

      // Update user-socket mapping if userId changed
      if (updates.userId && updates.userId !== existingData.userId) {
        // Remove from old user mapping
        if (existingData.userId && existingData.userId !== 'anonymous') {
          const oldUserSockets = this.userSocketMap.get(
            String(existingData.userId),
          );
          if (oldUserSockets) {
            oldUserSockets.delete(clientId);
            if (oldUserSockets.size === 0) {
              this.userSocketMap.delete(String(existingData.userId));
            }
          }
        }

        // Add to new user mapping
        if (updates.userId !== 'anonymous') {
          if (!this.userSocketMap.has(String(updates.userId))) {
            this.userSocketMap.set(String(updates.userId), new Set());
          }
          this.userSocketMap.get(String(updates.userId))!.add(clientId);
        }
      }

      console.log(`Client ${clientId} data updated:`, updates);
    } else {
      console.log(`Client ${clientId} not found for update`);
    }
  }

  /**
   * Get all connected clients (with clientId)
   */
  getAllConnectedClients(): Array<{ clientId: string; data: ClientData }> {
    return Array.from(this.clients.entries()).map(([clientId, data]) => ({
      clientId,
      data,
    }));
  }

  /**
   * Get all connected clients with their IDs (alias for getAllConnectedClients)
   */
  getAllConnectedClientsWithIds(): Array<{
    clientId: string;
    data: ClientData;
  }> {
    return this.getAllConnectedClients();
  }

  /**
   * Get all connected clients for a given userId (with clientId)
   */
  getConnectedClientByUserId(
    userId: string,
  ): Array<{ clientId: string; data: ClientData }> {
    const userIdKey = String(userId);
    const clientIds = this.userSocketMap.get(userIdKey);
    if (!clientIds) return [];
    return Array.from(clientIds)
      .map((clientId) => {
        const data = this.clients.get(clientId);
        if (data) {
          return { clientId, data };
        }
        return undefined;
      })
      .filter(Boolean) as Array<{ clientId: string; data: ClientData }>;
  }
}
