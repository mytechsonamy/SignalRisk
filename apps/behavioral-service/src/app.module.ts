import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BehavioralModule } from './behavioral/behavioral.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BehavioralModule,
  ],
})
export class AppModule {}
