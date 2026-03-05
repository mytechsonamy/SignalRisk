/**
 * SignalRisk Event Collector — Event DTOs
 *
 * class-validator decorated DTOs for incoming event validation.
 */

/**
 * SignalRisk Event Collector — Event DTOs
 *
 * class-validator decorated DTOs for incoming event validation.
 */

import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsObject,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIP,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EventType {
  PAGE_VIEW = 'PAGE_VIEW',
  CLICK = 'CLICK',
  FORM_SUBMIT = 'FORM_SUBMIT',
  LOGIN = 'LOGIN',
  SIGNUP = 'SIGNUP',
  PAYMENT = 'PAYMENT',
  CUSTOM = 'CUSTOM',
}

export class CreateEventDto {
  @ApiProperty({ example: 'merchant-001' })
  @IsString()
  @IsNotEmpty()
  merchantId!: string;

  @ApiProperty({ example: 'device-abc123' })
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @ApiProperty({ example: 'session-xyz789' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @ApiProperty({ enum: EventType, example: EventType.PAYMENT })
  @IsEnum(EventType)
  type!: EventType;

  @ApiProperty({ example: { amount: 99.99, currency: 'USD', msisdn: '+905551234567' } })
  @IsObject()
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({ example: '192.168.1.1' })
  @IsOptional()
  @IsString()
  @IsIP()
  ipAddress?: string;

  @ApiPropertyOptional({ example: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ example: 'https://shop.example.com/checkout' })
  @IsOptional()
  @IsString()
  pageUrl?: string;

  @ApiPropertyOptional({ example: 'https://shop.example.com/cart' })
  @IsOptional()
  @IsString()
  referrer?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-1234-5678-abcd-ef0123456789' })
  @IsOptional()
  @IsString()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({ example: '2026-03-06T12:00:00.000Z' })
  @IsOptional()
  @IsString()
  timestamp?: string;
}

export class CreateEventsDto {
  @ApiProperty({ type: [CreateEventDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventDto)
  events!: CreateEventDto[];
}
