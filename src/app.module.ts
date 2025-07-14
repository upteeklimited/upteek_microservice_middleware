import { MiddlewareConsumer, Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { MessagesGateway } from './gateways/messages/messages.gateway';
import { MessagesService } from './gateways/messages/messages.service';
import { PingController } from './ping/ping.controller';
import { ProxyController } from './proxy/proxy.controller';
import { ProxyService } from './proxy/proxy.service';
import { Reflector } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { SharedGatewayModule } from './gateways/shared/shared.module';
import { ValidateRequestMiddleware } from './middlewares/validate-request.middleware';
import { VerificationGateway } from './gateways/verification/verification.gateway';
import { VerificationService } from './gateways/verification/verification.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    SharedGatewayModule,
  ],
  controllers: [AppController, PingController, ProxyController],
  providers: [
    AppService,
    Reflector,
    // {
    //   provide: APP_GUARD,
    //   useClass: AuthGuard,
    // },
    // KeepAliveService,
    ProxyService,
    VerificationGateway,
    VerificationService,
    MessagesGateway,
    MessagesService,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // consumer.apply(SanitizeMiddleware).forRoutes('*');
    consumer.apply(ValidateRequestMiddleware).forRoutes('*'); // we apply the roles middleware for all routes
  }
}
