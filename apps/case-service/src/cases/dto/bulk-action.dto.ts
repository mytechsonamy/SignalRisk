import { IsArray, IsString, IsIn, IsOptional, ArrayMinSize } from 'class-validator';

export class BulkActionDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids: string[] = [];

  @IsIn(['RESOLVE', 'ESCALATE', 'ASSIGN'])
  action: 'RESOLVE' | 'ESCALATE' | 'ASSIGN' = 'RESOLVE';

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
