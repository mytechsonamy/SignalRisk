import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  IsIn,
} from 'class-validator';

/**
 * DTO for POST /v1/devices/identify
 */
export class IdentifyDeviceDto {
  @IsString()
  @IsNotEmpty()
  merchantId!: string;

  @IsString()
  @IsNotEmpty()
  screenResolution!: string;

  @IsString()
  @IsNotEmpty()
  gpuRenderer!: string;

  @IsString()
  @IsNotEmpty()
  timezone!: string;

  @IsString()
  @IsNotEmpty()
  language!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fonts?: string[];

  @IsString()
  @IsNotEmpty()
  webglHash!: string;

  @IsString()
  @IsNotEmpty()
  canvasHash!: string;

  @IsOptional()
  @IsString()
  audioHash?: string;

  @IsOptional()
  @IsString()
  androidId?: string;

  @IsOptional()
  @IsString()
  playIntegrityToken?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  sensorNoise?: number[];

  @IsIn(['web', 'android'])
  platform!: 'web' | 'android';
}
