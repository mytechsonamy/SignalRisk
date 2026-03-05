import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class UpdateMerchantDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @IsUrl({}, { message: 'webhookUrl must be a valid URL' })
  webhookUrl?: string;

  @IsInt()
  @Min(1)
  @Max(100_000)
  @IsOptional()
  rateLimitPerMinute?: number;

  @IsEnum(['default', 'burst'])
  @IsOptional()
  tier?: 'default' | 'burst';

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
