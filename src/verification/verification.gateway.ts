import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { VerificationService } from './verification.service';
import { Socket, Server } from 'socket.io';
import {
  message,
  VerificationPayload,
  // VerificationStatus,
} from './dto/verification.dto';

@WebSocketGateway()
export class VerificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private readonly verificationService: VerificationService) {}

  @WebSocketServer()
  server: Server;

  handleDisconnect(client: Socket) {
    console.log(`Socket disconnected: ${client.id}`);
    // throw new Error('Method not implemented.');
  }
  handleConnection(client: Socket) {
    console.log(`Socket connected: ${client.id}`);
  }

  private rooms: Map<string, string> = new Map(); // orderId -> roomId

  @SubscribeMessage('register-web')
  handleWebRegistration(
    @MessageBody() payload: VerificationPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { userId } = payload;
    // first and foremost check if required room for verification exist
    // if not, create the room and join room
    // if room exist and user not joined, join room
    // if room exist and a user is there, check if user is mobile
    // restrict only two participants to be in a verification room
    // participants are web and mobile
    const roomName = `verification_room_${userId}`;
    const roomExists = this.server.sockets.adapter.rooms.has(roomName);
    const isInRoom = client.rooms.has(roomName);

    if (!roomExists) {
      client.join(roomName);
      this.rooms.set(roomName, roomName);
      console.log(`Room created for verification ${userId} as ${roomName}`);
      this.server.to(roomName).emit('message', {
        sender: client.id,
        message: `Room created for verification ${userId} as ${roomName}`,
      });
      return {
        success: true,
        message: `Room created for verification ${userId} as ${roomName}`,
      };
    } else if (!isInRoom) {
      client.join(roomName);
      console.log(`Rejoined room for order ${roomName}`);
      return { success: true, message: `Rejoined room for order ${roomName}` };
    } else {
      console.log(`${client.id} is already in room ${roomName}`);
      return { success: false, message: `Already in room ${roomName}` };
    }
  }

  @SubscribeMessage('mobile-scan')
  handleMobileScan(
    @MessageBody() payload: VerificationPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { userId, data } = payload;
    console.log(`Mobile scanned QR for user: ${userId}`);

    // Emit feedback to web client
    client.to(userId).emit('handshake-success', { status: 'ok', data });

    // Optionally disconnect the web client after handshake
    // this.verificationService.disconnectRoom(this.server, userId);
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() data: message,
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `verification_room_${data.userId}`;
    const isInRoom = client.rooms.has(roomName);

    if (isInRoom) {
      this.server.to(roomName).emit('message', {
        sender: client.id,
        message: data.data,
      });
      console.log('sending to room with id ' + roomName);
      // Logger.i('sending to room with id ' + roomName);
      // Logger.d({
      //   orderId: data.orderId,
      //   riderId: data.riderId,
      //   sender: client.id,
      //   message: data.message,
      // });
      return { success: true, message: 'Message sent' };
    } else {
      // Logger.i('Not in any room');
    }
    return { success: false, message: 'Room not found' };
  }
}
