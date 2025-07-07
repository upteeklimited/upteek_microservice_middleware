import { APP_GUARD, Reflector } from '@nestjs/core';
import { MiddlewareConsumer, Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuard } from './guards/auth-guard.guard';
import { ConfigModule } from '@nestjs/config';
import { KeepAliveService } from './keepalive/keepalive.service';
import { PingController } from './ping/ping.controller';
import { ProxyController } from './proxy/proxy.controller';
import { ProxyService } from './proxy/proxy.service';
import { SanitizeMiddleware } from './middlewares/sanitize.middleware';
import { ScheduleModule } from '@nestjs/schedule';
import { ValidateRequestMiddleware } from './middlewares/validate-request.middleware';
import { VerificationGateway } from './verification/verification.gateway';
import { VerificationService } from './verification/verification.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
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
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // consumer.apply(SanitizeMiddleware).forRoutes('*');
    consumer.apply(ValidateRequestMiddleware).forRoutes('*'); // we apply the roles middleware for all routes
  }
}
