/**
 * SignalRisk Telco Intel — MSISDN Lookup Service
 *
 * Performs MSISDN prefix → operator/country lookup using in-memory data.
 * Supports Turkish operators (Turkcell, Vodafone, Turk Telekom).
 *
 * MSISDN normalization handles:
 *  - International format: +905421234567
 *  - Local format:         05421234567
 *  - E.164 without plus:  905421234567
 */

import { Injectable } from '@nestjs/common';

export interface MsisdnInfo {
  operator: string;
  countryCode: string;         // ISO 3166-1 alpha-2, e.g. 'TR'
  lineType: 'prepaid' | 'postpaid' | 'unknown';
  prepaidProbability: number;  // 0-1 based on operator/prefix heuristics
}

interface PrefixData {
  operator: string;
  prepaidProbability: number;
}

// Turkish operator prefixes (3-digit subscriber prefix after country code 90)
const TR_PREFIXES: Record<string, PrefixData> = {
  '905': { operator: 'Turkcell', prepaidProbability: 0.4 },
  '906': { operator: 'Turkcell', prepaidProbability: 0.7 }, // prepaid prefix
  '541': { operator: 'Turkcell', prepaidProbability: 0.6 },
  '542': { operator: 'Turkcell', prepaidProbability: 0.5 },
  '543': { operator: 'Turkcell', prepaidProbability: 0.5 },
  '544': { operator: 'Turkcell', prepaidProbability: 0.5 },
  '545': { operator: 'Turkcell', prepaidProbability: 0.5 },
  '546': { operator: 'Vodafone', prepaidProbability: 0.5 },
  '547': { operator: 'Vodafone', prepaidProbability: 0.5 },
  '548': { operator: 'Vodafone', prepaidProbability: 0.5 },
  '549': { operator: 'Vodafone', prepaidProbability: 0.5 },
  '551': { operator: 'Turk Telekom', prepaidProbability: 0.45 },
  '552': { operator: 'Turk Telekom', prepaidProbability: 0.45 },
  '553': { operator: 'Turk Telekom', prepaidProbability: 0.45 },
  '554': { operator: 'Turk Telekom', prepaidProbability: 0.45 },
  '555': { operator: 'Turk Telekom', prepaidProbability: 0.45 },
  '559': { operator: 'Turk Telekom', prepaidProbability: 0.5 },
};

// Turkey country code
const TR_COUNTRY_CODE = '90';

@Injectable()
export class MsisdnLookupService {
  /**
   * Normalize an MSISDN to a standard E.164-style digits-only string (no plus).
   * Handles:
   *  - +905421234567 → 905421234567
   *  - 00905421234567 → 905421234567
   *  - 05421234567 → 905421234567 (assumes TR if starts with 0)
   *  - 905421234567 → 905421234567
   * Returns null for empty/invalid input.
   */
  normalize(msisdn: string): string | null {
    if (!msisdn || msisdn.trim().length === 0) {
      return null;
    }

    // Strip whitespace
    let digits = msisdn.trim();

    // Remove leading +
    if (digits.startsWith('+')) {
      digits = digits.slice(1);
    }

    // Remove leading 00 (international dialing prefix)
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    }

    // If starts with 0, assume Turkish local format (05XX...) → prepend country code
    if (digits.startsWith('0')) {
      digits = TR_COUNTRY_CODE + digits.slice(1);
    }

    // Must be all digits
    if (!/^\d+$/.test(digits)) {
      return null;
    }

    return digits;
  }

  /**
   * Look up MSISDN info by prefix.
   * Returns null if the number is unknown or not in the prefix table.
   */
  lookup(msisdn: string): MsisdnInfo | null {
    const normalized = this.normalize(msisdn);
    if (!normalized) {
      return null;
    }

    // Check if it starts with TR country code (90)
    if (normalized.startsWith(TR_COUNTRY_CODE)) {
      // Extract 3-digit subscriber prefix (digits after country code 90)
      const subscriberPart = normalized.slice(TR_COUNTRY_CODE.length);
      const prefix3 = subscriberPart.slice(0, 3);

      const prefixData = TR_PREFIXES[prefix3];
      if (prefixData) {
        const prepaidProbability = prefixData.prepaidProbability;
        // Determine lineType heuristic based on probability threshold
        const lineType: 'prepaid' | 'postpaid' | 'unknown' =
          prepaidProbability >= 0.6
            ? 'prepaid'
            : prepaidProbability <= 0.4
            ? 'postpaid'
            : 'unknown';

        return {
          operator: prefixData.operator,
          countryCode: 'TR',
          lineType,
          prepaidProbability,
        };
      }
    }

    // Not in known prefix table
    return null;
  }

  /**
   * Get ISO 3166-1 alpha-2 country code for an MSISDN.
   * Returns null if unknown.
   */
  getCountryCode(msisdn: string): string | null {
    const info = this.lookup(msisdn);
    return info?.countryCode ?? null;
  }
}
