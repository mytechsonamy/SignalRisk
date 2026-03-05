import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CaseStatus, CaseResolution } from '../case.types';

export class UpdateCaseDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED'], example: 'RESOLVED' })
  @IsOptional()
  @IsIn(['OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED'])
  status?: CaseStatus;

  @ApiPropertyOptional({ example: 'analyst@acme.com', nullable: true })
  @IsOptional()
  @IsString()
  assignedTo?: string | null;

  @ApiPropertyOptional({ enum: ['FRAUD', 'LEGITIMATE', 'INCONCLUSIVE'], example: 'FRAUD', nullable: true })
  @IsOptional()
  @IsIn(['FRAUD', 'LEGITIMATE', 'INCONCLUSIVE'])
  resolution?: CaseResolution | null;

  @ApiPropertyOptional({ example: 'Verified fraudulent transaction via manual review', nullable: true })
  @IsOptional()
  @IsString()
  resolutionNotes?: string | null;
}
