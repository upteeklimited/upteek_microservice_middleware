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

  @SubscribeMessage('join_room')
  handleWebRegistration(
    @MessageBody() payload: VerificationPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { userId, clientType } = payload;
    // first and foremost check if required room for verification exist
    // if not, create the room and join room
    // if room exist and user not joined, join room
    // if room exist and a user is there, check if user is mobile
    // restrict only two participants to be in a verification room
    // participants are web and mobile

    // first get if the client is a mobile or web
    const roomName = `verification_room_${userId}`;
    const roomExists = this.server.sockets.adapter.rooms.has(roomName);
    const isInRoom = client.rooms.has(roomName);
    const numberInRoom = this.verificationService.getNumberInRooms();

    if (userId !== undefined && clientType !== undefined) {
      if (!roomExists) {
        // first we check
        client.join(roomName);
        this.verificationService.setClientsData(client.id, payload);
        this.verificationService.setRoomsData(roomName, {
          type: clientType,
          client: client.id,
        });
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
        console.log('room exist');
        if (numberInRoom < 2) {
          console.log('less than 2');
          // check if the current client type already is connected to the list
          const clientExistCheck =
            this.verificationService.checkForExpectedClientType(
              roomName,
              payload.clientType,
            );
          console.log('check: ', clientExistCheck);
          if (!clientExistCheck) {
            console.log('good to go');
            client.join(roomName);
            this.verificationService.setClientsData(client.id, payload);
            this.verificationService.setRoomsData(roomName, {
              type: clientType,
              client: client.id,
            });
            console.log(
              'rooms Data: ',
              this.verificationService.getRoomsData(),
            );
            return {
              success: true,
              message: `Rejoined room ${roomName}`,
            };
          } else {
            this.verificationService.emitServerMessage(
              this.server,
              `A ${clientType} already exist `,
            );
            return {
              success: false,
              message: `A ${clientType} already exist `,
            };
          }
        }
      } else {
        console.log(`${client.id} is already in room ${roomName}`);
        return { success: false, message: `Already in room ${roomName}` };
      }
    } else {
      this.verificationService.emitServerMessage(
        this.server,
        'No identification given',
      );
      console.log('No identification given');
      client.disconnect(true); // true = force disconnect
      return { success: false, message: 'No identification given' };
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
      console.log(
        `message: ${data.data} : User: ${data.userId} in Room ${roomName}`,
      );
      return { success: true, message: 'Message sent' };
    } else {
      console.log('Not in any room');
    }
    return { success: false, message: 'Room not found' };
  }
}
