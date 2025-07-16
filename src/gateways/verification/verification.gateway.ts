import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

import { BaseGateway } from '../shared/base.gateway';
import { PresenceService } from '../shared/presence.service';
import { VerificationService } from './verification.service';
import { message, VerificationPayload } from './dto/verification.dto';
import { PublicWebSocket } from '../decorators/public.decorator';
import { AuthService } from '../services/auth.service';

@WebSocketGateway({
  namespace: 'verification',
  cors: {
    origin: '*',
  },
})
@PublicWebSocket()
export class VerificationGateway extends BaseGateway {
  constructor(
    presenceService: PresenceService,
    authService: AuthService,
    private readonly verificationService: VerificationService,
  ) {
    super(presenceService, authService);
  }

  @SubscribeMessage('join_room')
  handleWebRegistration(
    @MessageBody() payload: VerificationPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { userId, clientType } = payload;
      // Allow anonymous connection, but update userId/clientType if provided
      if (userId && clientType) {
        this.updateClientAuth(client, userId, clientType);
      } else {
        // If not provided, keep as anonymous and notify
        if (this.presenceService.isClientConnected(this.server, client.id)) {
          try {
            this.presenceService.emitClientMessage(
              this.server,
              client.id,
              'No identification given - userId and clientType are required',
            );
          } catch (emitError) {
            // eslint-disable-next-line no-console
            console.log(
              `Could not emit error message to client ${client.id}:`,
              emitError,
            );
          }
        } else {
          // eslint-disable-next-line no-console
          console.log(
            `Client ${client.id} is no longer connected, skipping message emission`,
          );
        }
        return {
          success: false,
          message:
            'No identification given - userId and clientType are required',
        };
      }

      console.log('Processing join_room request for user:', userId);

      // Update client data with the provided userId and clientType
      this.presenceService.updateClientData(client.id, {
        userId,
        clientType,
      });

      const roomName = `verification_room_${userId}`;
      const roomExists = this.presenceService.roomExists(roomName);
      const isInRoom = client.rooms.has(roomName);
      const numberInRoom = this.presenceService.getRoomCount();
      const namespace = this.extractNamespace(client);

      if (!roomExists) {
        // Create new room and join
        client.join(roomName);
        this.presenceService.addClientToRoom(roomName, {
          type: clientType,
          client: client.id,
          namespace,
        });

        console.log(`Room created for verification ${userId} as ${roomName}`);
        this.emitToRoom(roomName, 'message', {
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

          // Check if the current client type already exists in the room
          const clientExistCheck = this.presenceService.hasClientTypeInRoom(
            roomName,
            payload.clientType,
          );

          console.log('check: ', clientExistCheck);
          if (!clientExistCheck) {
            console.log('good to go');
            client.join(roomName);
            this.presenceService.addClientToRoom(roomName, {
              type: clientType,
              client: client.id,
              namespace,
            });

            console.log('rooms Data: ', this.presenceService.getAllRoomsData());
            return {
              success: true,
              message: `Rejoined room ${roomName}`,
            };
          } else {
            console.log('room count: ', this.presenceService.getRoomCount());
            console.log(
              'room data: ',
              this.presenceService.getRoomData(roomName),
            );
            this.presenceService.emitServerMessage(
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
    } catch (error) {
      console.error('Error in handleWebRegistration:', error);
      try {
        this.presenceService.emitClientMessage(
          this.server,
          client.id,
          'Internal server error',
        );
      } catch (emitError) {
        console.log(
          `Could not emit error message to client ${client.id}:`,
          emitError,
        );
      }
      return { success: false, message: 'Internal server error' };
    }
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() data: message,
    @ConnectedSocket() client: Socket,
  ) {
    const roomName = `verification_room_${data.userId}`;
    const isInRoom = client.rooms.has(roomName);

    if (isInRoom) {
      this.emitToRoom(roomName, 'message', {
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
