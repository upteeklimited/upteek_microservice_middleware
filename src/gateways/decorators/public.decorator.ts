import { SetMetadata } from '@nestjs/common';
import { WebSocketAuthOptions } from '../guards/websocket-auth.guard';

export const PUBLIC_WEBSOCKET = 'websocket:public';
export const WEBSOCKET_AUTH = 'websocket:auth';

/**
 * Decorator to mark a WebSocket gateway as public (no authentication required)
 */
export const PublicWebSocket = () => SetMetadata(PUBLIC_WEBSOCKET, true);

/**
 * Decorator to configure WebSocket authentication options
 */
export const WebSocketAuth = (options: WebSocketAuthOptions) =>
  SetMetadata(WEBSOCKET_AUTH, options);
