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
  @IsString()
  @IsNotEmpty()
  merchantId!: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  sessionId!: string;

  @IsEnum(EventType)
  type!: EventType;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  pageUrl?: string;

  @IsOptional()
  @IsString()
  referrer?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}

export class CreateEventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventDto)
  events!: CreateEventDto[];
}
