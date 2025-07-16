import { AuthService } from '../services/auth.service';
import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { RootGateway } from '../root.gateway';
import { WebSocketAuthGuard } from '../guards/websocket-auth.guard';
import { WebSocketExceptionFilter } from './websocket-exception.filter';

@Module({
  providers: [
    PresenceService,
    WebSocketExceptionFilter,
    AuthService,
    WebSocketAuthGuard,
    RootGateway,
  ],
  exports: [
    PresenceService,
    WebSocketExceptionFilter,
    AuthService,
    WebSocketAuthGuard,
  ],
})
export class SharedGatewayModule {}
