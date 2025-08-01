import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';

@Catch()
export class WebSocketExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToWs();
    const client = ctx.getClient<Socket>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof WsException) {
      message = exception.getError() as string;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;
    } else if (typeof exception === 'string') {
      message = exception;
    }

    // Emit error to the client
    ctx.getClient().emit('error', {
      message,
      status,
      timestamp: new Date().toISOString(),
    });

    // Log the error for debugging
    console.error('WebSocket Exception:', {
      clientId: client.id,
      exception:
        exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });
  }
}
