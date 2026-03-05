import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMerchantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  roles?: string[];
}
