import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { VerificationPayload, message } from './dto/verification.dto';

import { AuthService } from '../services/auth.service';
import { BaseGateway } from '../shared/base.gateway';
import { PresenceService } from '../shared/presence.service';
import { PublicWebSocket } from '../decorators/public.decorator';
import { Socket } from 'socket.io';
import { VerificationService } from './verification.service';

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
      const clientId = client.id;
      const namespace = 'verification';

      // Allow anonymous connection, but update userId/clientType if provided
      if (!userId && !clientType) {
        // user joined without providing the necessary credentials
        this.emitToClient(
          clientId,
          'message',
          'Missing necessary connection fields',
        );
        return {
          success: false,
          message:
            'No identification given - userId and clientType are required',
        };
      }

      // now that all is set, we proceed

      console.log('Processing join_room request for user:', userId);
      // define the room name
      const roomName: string = `verification_room_${userId}`;
      const roomExists = this.presenceService.roomExists(roomName); // check if room exist

      if (roomExists) {
        console.log('rooms exist');
        // room exist, now we proceed
        const isInRoom = client.rooms.has(roomName);
        const numberInRoom = this.presenceService.getRoomCount();

        // first we ensure user is not already in room
        // then we ensure the room is not at max capacity
        if (!isInRoom) {
          console.log('user not in room');
          // user is not in room
          if (numberInRoom < 2) {
            console.log('less than 2');
            // number in room is less than 2 and most likely greater than 1
            // Check if the current client type already exists in the room
            const clientTypeExistCheck =
              this.presenceService.hasClientTypeInRoom(
                roomName,
                payload.clientType,
              );
            if (!clientTypeExistCheck) {
              client.join(roomName);
              this.presenceService.addClientToRoom(roomName, {
                type: clientType,
                client: clientId,
                namespace,
              });
              this.emitToClient(clientId, 'joined', 'true');
              return {
                success: true,
                message: `Joined room ${roomName}`,
              };
            } else {
              this.emitToClient(
                clientId,
                'message',
                "You can't join this room",
              );
              return {
                success: false,
                message: `User can\'t join ${roomName}`,
              };
            }
          } else {
            // here we do something, and this is subject to further review
            // for lack of a better approach
            // we want to ensure for sake of the system not removing a disconnected
            // user from the room, we just replace the user based on type
            // this should only happen for the mobile clients
            console.log('more than 2 in room');
            if (clientType.toLocaleLowerCase() == 'mobile') {
              // remove the mobile client from the room
              this.presenceService.removeClientTypeFromRoom(
                roomName,
                payload.clientType,
              );
              // add the new mobile client to the room
              client.join(roomName);
              this.presenceService.addClientToRoom(roomName, {
                type: clientType,
                client: clientId,
                namespace,
              });
              this.emitToClient(clientId, 'message', 'Joined room');
              return {
                success: true,
                message: `Joined room ${roomName}`,
              };
            }
          }
        } else {
          return { success: false, message: `Already in room ${roomName}` };
        }
      } else {
        // room does not exist now we create the room and add the users
        // first we ensure only the web client can create rooms
        if (clientType.toLocaleLowerCase() == 'web') {
          console.log('creating new room');
          client.join(roomName);
          this.presenceService.addClientToRoom(roomName, {
            type: clientType,
            client: clientId,
            namespace,
          });
          this.emitToClient(clientId, 'message', 'Joined verification room');
          return {
            success: true,
            message: `Room created for as ${roomName}`,
          };
        } else {
          // emit to the current client that room does not exist
          this.emitToClient(
            clientId,
            'message',
            'Room does not exist, ensure you are scanning the right code',
          );
          return {
            success: false,
            message:
              'Room does not exist, ensure you are scanning the right code',
          };
        }
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

  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @MessageBody() payload: VerificationPayload,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { userId } = payload;
      const roomName = `verification_room_${userId}`;
      const roomExists = this.presenceService.roomExists(roomName);
      if (roomExists) {
        this.presenceService.removeClientFromRoom(roomName, client.id);
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
        console.log(`Could not leave room`, emitError);
      }
    }
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() data: message,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const clientData = this.getClientData(client.id);
      const roomName = clientData.roomName;
      const roomExists = this.presenceService.roomExists(roomName);
      console.log('User id: ', roomName);
      if (roomExists) {
        if (roomName) {
          this.emitToRoom(roomName, 'message', {
            sender: client.id,
            data: data.data,
          });
          return { success: true, message: 'Message sent' };
        } else {
          console.log('Not in any room');
        }
      } else {
        console.log('Room does not exist');
      }
    } catch (error) {
      console.error('Error in handleMessage:', error);
      this.emitToClient(client.id, 'error', {
        message: 'Internal server error',
      });
      return 'Internal server error';
    }
  }
}
