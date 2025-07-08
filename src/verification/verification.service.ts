import { VerificationPayload, roomsData } from './dto/verification.dto';

import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class VerificationService {
  private clients = new Map<string, { userId: string; clientType?: string }>();
  private rooms: Map<string, Array<roomsData>> = new Map();

  disconnectRoom(server: Server, userId: string) {
    const room = server.sockets.adapter.rooms.get(userId);
    if (room) {
      room.forEach((clientId) => {
        const client = server.sockets.sockets.get(clientId);
        if (client) {
          client.leave(userId);
          this.clients.delete(client.id);
          client.disconnect(true); // Optionally force disconnect
        }
      });
      console.log(`Disconnected clients in room: ${userId}`);
    }
  }

  setClientsData(clientId: string, payload: VerificationPayload) {
    // store the set clients;
    this.clients.set(clientId, payload);
    console.log(this.rooms);
  }

  setRoomsData(roomName: string, data: roomsData) {
    const existing = this.rooms.get(roomName) || [];
    existing.push(data);
    this.rooms.set(roomName, existing);
    console.log(this.rooms);
  }

  getNumberInRooms() {
    // Return the number of entries in the rooms map
    return this.rooms.size;
  }

  checkForExpectedClientType(roomName: string, clientType: string): boolean {
    const roomData = this.rooms.get(roomName);
    if (!roomData) {
      return false;
    }
    return roomData.some((data) => data.type === clientType);
  }

  emitServerMessage(server: Server, message: string) {
    server.emit('message', {
      message: message,
    });
  }

  getRoomsData() {
    return this.rooms;
  }
}
