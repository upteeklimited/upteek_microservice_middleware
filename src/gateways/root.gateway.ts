import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';

import { BaseGateway } from './shared/base.gateway';
import { PresenceService } from './shared/presence.service';
import { Server, Socket } from 'socket.io';
import { AuthService } from './services/auth.service';

@WebSocketGateway({ namespace: '/', cors: { origin: '*' } })
export class RootGateway
  extends BaseGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  protected server: Server;

  constructor(
    protected readonly presenceService: PresenceService,
    authService: AuthService,
  ) {
    super(presenceService, authService);
  }

  // handleConnection and handleDisconnect are inherited from BaseGateway

  @SubscribeMessage('authenticate')
  handleAuthenticate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId: string; clientType?: string },
  ) {
    this.updateClientAuth(client, payload.userId, payload.clientType);
    this.emitClientMessage(client.id, 'auth_success', {
      userId: payload.userId,
    });
    return { success: true, message: 'Authenticated' };
  }
}
