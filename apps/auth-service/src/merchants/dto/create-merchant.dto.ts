import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMerchantDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'https://acme.com/webhooks/signalrisk' })
  @IsString()
  @IsOptional()
  @IsUrl({}, { message: 'webhookUrl must be a valid URL' })
  webhookUrl?: string;

  @ApiPropertyOptional({ example: 1000, minimum: 1, maximum: 100000 })
  @IsInt()
  @Min(1)
  @Max(100_000)
  @IsOptional()
  rateLimitPerMinute?: number;

  @ApiPropertyOptional({ enum: ['default', 'burst'], example: 'default' })
  @IsEnum(['default', 'burst'])
  @IsOptional()
  tier?: 'default' | 'burst';

  // Legacy field kept for backwards compatibility with existing tests
  @ApiPropertyOptional({ example: ['merchant'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  roles?: string[];
}
