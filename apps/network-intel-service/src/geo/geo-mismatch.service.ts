/**
 * SignalRisk Network Intel — Geo Mismatch Service
 *
 * Compares IP country, MSISDN country, and billing country to produce
 * a mismatch score indicating potential fraud signals.
 */

import { Injectable } from '@nestjs/common';

export interface GeoMismatchResult {
  /** Number of detected mismatches (0, 1, or 2). */
  mismatchCount: number;
  /** Risk score: 0 = no mismatch, 30 = 1 mismatch, 70 = 2+ mismatches. */
  mismatchScore: number;
  /** Human-readable mismatch details. */
  details: string[];
}

export interface GeoMismatchParams {
  /** Country code derived from IP geolocation (e.g. 'TR'). */
  ipCountry?: string;
  /** Country code derived from MSISDN prefix (e.g. 'TR' for +90). */
  msisdnCountry?: string;
  /** Billing country code from the transaction. */
  billingCountry?: string;
}

@Injectable()
export class GeoMismatchService {
  /**
   * Calculate a geo mismatch score by comparing up to two country pairs:
   * - ipCountry vs msisdnCountry
   * - ipCountry vs billingCountry
   *
   * Comparison is case-insensitive. Missing values are skipped (no mismatch).
   */
  calculateMismatchScore(params: GeoMismatchParams): GeoMismatchResult {
    const details: string[] = [];
    let mismatchCount = 0;

    const { ipCountry, msisdnCountry, billingCountry } = params;

    // Compare IP country vs MSISDN country
    if (ipCountry && msisdnCountry) {
      if (ipCountry.toUpperCase() !== msisdnCountry.toUpperCase()) {
        mismatchCount++;
        details.push('ip_msisdn_mismatch');
      }
    }

    // Compare IP country vs billing country
    if (ipCountry && billingCountry) {
      if (ipCountry.toUpperCase() !== billingCountry.toUpperCase()) {
        mismatchCount++;
        details.push('billing_mismatch');
      }
    }

    const mismatchScore = this.scoreFromCount(mismatchCount);

    return {
      mismatchCount,
      mismatchScore,
      details,
    };
  }

  private scoreFromCount(count: number): number {
    if (count === 0) return 0;
    if (count === 1) return 30;
    return 70; // 2 or more
  }
}
