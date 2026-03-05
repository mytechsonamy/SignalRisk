/**
 * SignalRisk Telco Intel — Core Analysis Service
 *
 * Combines MSISDN prefix heuristics with Payguru enrichment data to produce
 * a TelcoResult. Payguru data takes priority over prefix heuristics for
 * line type determination.
 */

import { Injectable } from '@nestjs/common';
import { MsisdnLookupService } from '../msisdn/msisdn-lookup.service';

export interface TelcoAnalysisParams {
  msisdn: string;
  merchantId: string;
  isPorted?: boolean;
  portDate?: Date;
  payguruLineType?: 'prepaid' | 'postpaid';
}

export interface TelcoResult {
  msisdn: string;
  merchantId: string;
  operator?: string;
  lineType: 'prepaid' | 'postpaid' | 'unknown';
  isPorted: boolean;
  portDate?: Date;
  prepaidProbability: number;
  countryCode?: string;
}

@Injectable()
export class TelcoIntelService {
  constructor(private readonly msisdnLookupService: MsisdnLookupService) {}

  /**
   * Analyze a MSISDN and produce a TelcoResult.
   *
   * Line type resolution priority:
   * 1. Payguru enrichment data (most authoritative)
   * 2. MSISDN prefix heuristic
   * 3. 'unknown'
   */
  analyze(params: TelcoAnalysisParams): TelcoResult {
    const { msisdn, merchantId, isPorted, portDate, payguruLineType } = params;

    const msisdnInfo = this.msisdnLookupService.lookup(msisdn);

    // Resolve line type based on priority order
    let lineType: 'prepaid' | 'postpaid' | 'unknown';
    if (payguruLineType !== undefined) {
      // Priority 1: Payguru enrichment data
      lineType = payguruLineType;
    } else if (msisdnInfo !== null) {
      // Priority 2: MSISDN prefix heuristic
      lineType = msisdnInfo.lineType;
    } else {
      // Priority 3: Unknown
      lineType = 'unknown';
    }

    // Default prepaid probability if prefix lookup fails
    const prepaidProbability = msisdnInfo?.prepaidProbability ?? 0.5;

    const result: TelcoResult = {
      msisdn,
      merchantId,
      lineType,
      isPorted: isPorted ?? false,
      prepaidProbability,
    };

    if (msisdnInfo) {
      result.operator = msisdnInfo.operator;
      result.countryCode = msisdnInfo.countryCode;
    }

    if (portDate !== undefined) {
      result.portDate = portDate;
    }

    return result;
  }
}
