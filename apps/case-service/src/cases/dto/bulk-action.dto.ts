import { IsArray, IsString, IsIn, IsOptional, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkActionDto {
  @ApiProperty({ example: ['case-abc123', 'case-def456'], type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids: string[] = [];

  @ApiProperty({ enum: ['RESOLVE', 'ESCALATE', 'ASSIGN'], example: 'RESOLVE' })
  @IsIn(['RESOLVE', 'ESCALATE', 'ASSIGN'])
  action: 'RESOLVE' | 'ESCALATE' | 'ASSIGN' = 'RESOLVE';

  @ApiPropertyOptional({ example: 'analyst@acme.com' })
  @IsOptional()
  @IsString()
  assignedTo?: string;
}
