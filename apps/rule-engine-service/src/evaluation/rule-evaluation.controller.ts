import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { RuleEvaluationService, RuleEvaluationSummary } from './rule-evaluation.service';
import { SignalContext } from '../dsl/evaluator';

class EvaluateRequestDto {
  @IsObject()
  @IsOptional()
  context!: SignalContext;

  @IsString()
  merchantId!: string;
}

@Controller('v1/rules')
export class RuleEvaluationController {
  constructor(private readonly evaluationService: RuleEvaluationService) {}

  /**
   * POST /v1/rules/evaluate
   *
   * Accepts a SignalContext + merchantId, returns a RuleEvaluationSummary.
   */
  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  evaluate(@Body() dto: EvaluateRequestDto): RuleEvaluationSummary {
    return this.evaluationService.evaluate(dto.context ?? {}, dto.merchantId);
  }
}
