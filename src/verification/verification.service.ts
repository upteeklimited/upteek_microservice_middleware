import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class VerificationService {
  disconnectRoom(server: Server, userId: string) {
    const room = server.sockets.adapter.rooms.get(userId);
    if (room) {
      room.forEach((clientId) => {
        const client = server.sockets.sockets.get(clientId);
        if (client) {
          client.leave(userId);
          client.disconnect(true); // Optionally force disconnect
        }
      });
      console.log(`Disconnected clients in room: ${userId}`);
    }
  }
}
