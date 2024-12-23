import { Module } from '@nestjs/common';
import { FilesModule } from './files/files.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { File } from './files/entities/file.entity';
import { join } from 'path';
import { ConfigModule } from '@nestjs/config';
import { config } from 'dotenv';
config();

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: join(__dirname, '..', '.env'),
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'db',
      port: +process.env.POSTGRES_PORT,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      entities: [File],
      synchronize: true,
    }),
    FilesModule,
  ],
})
export class AppModule {}
