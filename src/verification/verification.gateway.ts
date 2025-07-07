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
import { VerificationPayload } from './dto/verification.dto';

@WebSocketGateway({ namespace: '/verification', cors: true })
export class VerificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(private readonly verificationService: VerificationService) {}

  @WebSocketServer()
  server: Server;

  handleDisconnect() {
    throw new Error('Method not implemented.');
  }
  handleConnection(client: Socket) {
    console.log(`Socket connected: ${client.id}`);
  }
  @SubscribeMessage('register-web')
  handleWebRegistration(
    @MessageBody() payload: VerificationPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const { userId } = payload;
    client.join(userId);
    console.log(`Web client joined room: ${userId}`);
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
    this.verificationService.disconnectRoom(this.server, userId);
  }
}
