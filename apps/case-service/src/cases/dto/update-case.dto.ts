import { IsOptional, IsString, IsIn } from 'class-validator';
import { CaseStatus, CaseResolution } from '../case.types';

export class UpdateCaseDto {
  @IsOptional()
  @IsIn(['OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED'])
  status?: CaseStatus;

  @IsOptional()
  @IsString()
  assignedTo?: string | null;

  @IsOptional()
  @IsIn(['FRAUD', 'LEGITIMATE', 'INCONCLUSIVE'])
  resolution?: CaseResolution | null;

  @IsOptional()
  @IsString()
  resolutionNotes?: string | null;
}
