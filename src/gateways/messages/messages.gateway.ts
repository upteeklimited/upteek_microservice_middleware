import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Socket } from 'socket.io';

import { BaseGateway } from '../shared/base.gateway';
import { PresenceService } from '../shared/presence.service';
import { MessagesService } from './messages.service';
import { WebSocketAuthGuard } from '../guards/websocket-auth.guard';
import { AuthService } from '../services/auth.service';

interface JoinChatPayload {
  clientType: string;
  client_a: string;
  client_b: string;
}

interface chatPayload {
  message?: string;
  media?: string[];
}

@WebSocketGateway({
  namespace: 'messages',
  cors: {
    origin: '*',
    credentials: true,
  },
})
@UseGuards(WebSocketAuthGuard)
export class MessagesGateway extends BaseGateway {
  constructor(
    presenceService: PresenceService,
    authService: AuthService,
    private readonly messagesService: MessagesService,
  ) {
    super(presenceService, authService);
  }

  /**
   * Sorter method to create consistent room names
   * Ensures that room names are always in the same order regardless of who joins first
   */
  private sortClientsForRoom(
    client_a: string,
    client_b: string,
  ): {
    first: string;
    second: string;
  } {
    // Sort clients alphabetically to ensure consistent room names
    const sorted = [client_a, client_b].sort();
    return {
      first: sorted[0],
      second: sorted[1],
    };
  }

  /**
   * Create consistent room name from two client IDs
   */
  private createRoomName(client_a: string, client_b: string): string {
    const { first, second } = this.sortClientsForRoom(client_a, client_b);
    return `chat_room_${first}_${second}`;
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: chatPayload,
  ): Promise<string> {
    try {
      // Check if client is authenticated
      if (!this.isAuthenticated(client)) {
        this.emitToClient(client.id, 'error', {
          message: 'Authentication required',
        });
        return 'Authentication required';
      }

      // Get client data
      const clientData = this.getClientData(client.id);
      if (!clientData) {
        this.emitToClient(client.id, 'error', {
          message: 'Client data not found',
        });
        return 'Client data not found';
      }

      // If client has anonymous userId, try to update it
      if (clientData.userId === 'anonymous') {
        const userId = this.extractUserId(client);
        if (userId) {
          this.presenceService.updateClientData(client.id, { userId });
          clientData.userId = userId;
        }
      }

      // Check if client is in a room
      if (!clientData.roomName) {
        this.emitToClient(client.id, 'error', {
          message: 'You must join a chat room before sending messages',
        });
        return 'Not in a chat room';
      }

      // Peer notification logic moved here
      const currentUserId = this.extractUserId(client).toString();
      const roomName = clientData.roomName;
      const roomParts = roomName.replace('chat_room_', '').split('_');
      const [userIdA, userIdB] = roomParts;
      let otherUserId: string | undefined;
      if (currentUserId === userIdA) {
        otherUserId = userIdB;
      } else if (currentUserId === userIdB) {
        otherUserId = userIdA;
      }
      const res = this.presenceService.getConnectedClientByUserId(otherUserId);
      console.log(res);
      if (res.length > 0) {
        this.emitToClient(res[0].clientId, 'peer_joined', {
          message: `Your chat partner has sent a message in room: ${roomName}`,
          roomName,
          peerUserId: currentUserId,
          timestamp: new Date().toISOString(),
        });
      }

      // Process message using the messages service
      const token = client.handshake.headers['authorization'];

      console.log(payload);

      const result = await this.messagesService.processMessage(
        payload.message,
        otherUserId,
        clientData,
        payload.media,
        token,
      );

      // Send message to the room (P2P chat - only 2 users)
      this.emitToRoom(clientData.roomName, 'message', {
        sender: clientData.userId,
        message: result,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      console.error('Error in handleMessage:', error);
      this.emitToClient(client.id, 'error', {
        message: 'Internal server error',
      });
      return 'Internal server error';
    }
  }

  @SubscribeMessage('join_chat')
  handleJoinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinChatPayload,
  ) {
    try {
      console.log('join chat payload: ' + JSON.stringify(payload));
      // Allow anonymous connection, but require authentication for protected actions
      if (!this.isAuthenticated(client)) {
        // Optionally, check for token and update userId if provided
        const userId = this.extractUserId(client);
        const clientType = this.extractClientType(client);
        if (userId) {
          this.updateClientAuth(client, userId, clientType);
        } else {
          this.emitToClient(client.id, 'error', {
            message: 'Authentication required',
          });
          return { success: false, message: 'Authentication required' };
        }
      }

      // console.log('validated auth');

      // Validate required payload fields
      const { clientType, client_a, client_b } = payload;

      if (!clientType || !client_a || !client_b) {
        this.emitToClient(client.id, 'error', {
          message: 'Missing required fields: clientType, Sender, Receiver',
        });
        return {
          success: false,
          message: 'Missing required fields: clientType, Sender, Receiver',
        };
      }

      // console.log('validated client fields');

      // Validate client type
      const validClientTypes = ['web', 'mobile'];
      if (!validClientTypes.includes(clientType.toLowerCase())) {
        this.emitToClient(client.id, 'error', {
          message: 'Invalid client type.',
        });
        return {
          success: false,
          message: 'Invalid client type.',
        };
      }

      // console.log('validated type');

      // Create consistent room name using sorter method
      const roomName = this.createRoomName(client_a, client_b);
      const namespace = this.extractNamespace(client);
      const currentUserId = this.extractUserId(client).toString();

      // Check if room already exists
      const existingRoom = this.presenceService.getRoomData(roomName);

      const roomParts = roomName.replace('chat_room_', '').split('_');

      if (!existingRoom) {
        this.joinRoom(client, roomName, namespace);
        console.log('first person joined');
        // Emit appropriate event based on whether this is first or second person
        this.emitToRoom(roomName, 'room_created', {
          roomName,
          client_a,
          client_b,
          createdBy: currentUserId,
          timestamp: new Date().toISOString(),
        });
      } else {
        // now here before we join the second user to this room,
        // we need to check if the user trying to join has permission to
        // so first check existing clients in the room
        // next check joining user's id
        // then compare both ids to the room name, if it matches then the
        // joining user can join

        if (existingRoom.length >= 2) {
          console.log('room is full');
          const existingClients = this.presenceService.getRoomData(roomName);
          console.log(existingClients);
          console.log('current user id', currentUserId);
          // first we check if the user has permission to join the room
          // by checking the requesting user's id is based on the room parts
          if (roomParts.includes(currentUserId)) {
            // user's id is based on the part,
            // now this means the user is trying to rejoin the room but did not leave
            // initially
            const res =
              this.presenceService.getConnectedClientByUserId(currentUserId);
            this.presenceService.removeClientFromRoom(
              roomName,
              res[0].clientId,
            );
            this.joinRoom(client, roomName, namespace);
            console.log('rejoined room');
            this.emitToRoom(roomName, 'user_joined', {
              roomName,
              userId: currentUserId,
              clientType,
              timestamp: new Date().toISOString(),
            });
          } else {
            // we kick the user out immediately
            this.emitToClient(client.id, 'error', {
              message: 'Wrong channel',
            });
          }
        } else {
          // here we check since the room is not full, we check if the
          // requesting user's id is based on the room parts
          if (roomParts.includes(currentUserId)) {
            // good to join the room
            this.joinRoom(client, roomName, namespace);
            console.log('second person joined');
            this.emitToRoom(roomName, 'user_joined', {
              roomName,
              userId: currentUserId,
              clientType,
              timestamp: new Date().toISOString(),
            });
          } else {
            this.emitToClient(client.id, 'error', {
              message: '',
            });
          }
        }
      }

      // broadcast the two ids for the receiver to get notified of the chat
    } catch (error) {
      console.error('Error in handleJoinChat:', error);
      this.emitToClient(client.id, 'error', {
        message: 'Internal server error',
      });
      return { success: false, message: 'Internal server error' };
    }
  }

  @SubscribeMessage('leave_chat')
  handleLeaveChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { client_a: string; client_b: string },
  ) {
    try {
      const { client_a, client_b } = payload;
      const roomName = this.createRoomName(client_a, client_b);

      // Leave the chat room
      client.leave(roomName);

      // Remove from room participation
      this.presenceService.removeClientFromRoom(roomName, client.id);

      this.emitToRoom(roomName, 'user_left', {
        userId: this.extractUserId(client),
        roomName,
        timestamp: new Date().toISOString(),
      });

      return { success: true, message: `Left chat room: ${roomName}` };
    } catch (error) {
      console.error('Error in handleLeaveChat:', error);
      this.emitToClient(client.id, 'error', {
        message: 'Internal server error',
      });
      return { success: false, message: 'Internal server error' };
    }
  }

  @SubscribeMessage('is_typing')
  handleIsTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: boolean,
  ) {
    // Check if client is authenticated
    if (!this.isAuthenticated(client)) {
      this.emitToClient(client.id, 'error', {
        message: 'Authentication required',
      });
      return 'Authentication required';
    }

    // Get client data
    const clientData = this.getClientData(client.id);
    if (!clientData) {
      this.emitToClient(client.id, 'error', {
        message: 'Client data not found',
      });
      return 'Client data not found';
    }

    // If client has anonymous userId, try to update it
    if (clientData.userId === 'anonymous') {
      const userId = this.extractUserId(client);
      if (userId) {
        this.presenceService.updateClientData(client.id, { userId });
        clientData.userId = userId;
      }
    }

    // Check if client is in a room
    if (!clientData.roomName) {
      this.emitToClient(client.id, 'error', {
        message: 'You must join a chat room before sending messages',
      });
      return 'Not in a chat room';
    }

    // Send message to the room (P2P chat - only 2 users)
    this.emitToRoom(clientData.roomName, 'is_typing', {
      sender: clientData.userId,
      message: payload,
      timestamp: new Date().toISOString(),
    });
  }

  joinRoom(client: Socket, roomName: string, namespace: string) {
    // new user in the room
    client.join(roomName); // Join the chat room
    // Register room participation
    this.presenceService.addClientToRoom(roomName, {
      type: 'chat',
      client: client.id,
      namespace,
    });
    console.log('client added to room');
  }
}
