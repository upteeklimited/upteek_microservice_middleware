import { APP_GUARD, Reflector } from '@nestjs/core';
import { MiddlewareConsumer, Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuard } from './guards/auth-guard.guard';
import { ConfigModule } from '@nestjs/config';
import { PingController } from './ping/ping.controller';
import { ProxyController } from './proxy/proxy.controller';
import { ProxyService } from './proxy/proxy.service';

// import { ValidateRequestMiddleware } from './middlewares/validate-request.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
  ],
})
export class AppModule {
  // configure(consumer: MiddlewareConsumer) {
  //   consumer.apply(ValidateRequestMiddleware).forRoutes('*'); // we apply the roles middleware for all routes
  // }
}
