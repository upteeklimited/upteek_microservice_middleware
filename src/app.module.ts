import { APP_GUARD, Reflector } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuard } from './guards/auth-guard.guard';
import { ConfigModule } from '@nestjs/config';
import { KeepAliveService } from './keepalive/keepalive.service';
import { Module } from '@nestjs/common';
import { PingController } from './ping/ping.controller';
import { ProxyController } from './proxy/proxy.controller';
import { ProxyService } from './proxy/proxy.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController, ProxyController, PingController],
  providers: [
    AppService,
    ProxyService,
    Reflector,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    KeepAliveService,
  ],
})
export class AppModule {
  // configure(consumer: MiddlewareConsumer) {
  //   consumer.apply(ValidateRequestMiddleware).forRoutes('*'); // we apply the roles middleware for all routes
  // }
}
