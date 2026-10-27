/**
 * International Phone Normalization and Privacy Masking Utilities.
 * Enforces E.164 standard formatting (+<country_code><number>) and PII protection.
 */

/**
 * Normalizes any user-entered mobile phone string into standard E.164 format.
 * Defaults to India (+91) when country prefix is omitted.
 */
export function normalizeToE164(input: string, defaultCountryCode = '91'): string {
  if (!input) return '';

  // Strip all non-digit characters except leading plus
  let cleaned = input.trim();
  const hasPlus = cleaned.startsWith('+');
  const digitsOnly = cleaned.replace(/[^0-9]/g, '');

  if (!digitsOnly) return '';

  if (hasPlus) {
    return `+${digitsOnly}`;
  }

  // Handle standard 10-digit Indian numbers without country prefix
  if (digitsOnly.length === 10 && defaultCountryCode === '91') {
    return `+91${digitsOnly}`;
  }

  // Handle 12-digit numbers starting with 91
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+${digitsOnly}`;
  }

  // Handle numbers with 0 prefix (e.g. 09876543210)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return `+${defaultCountryCode}${digitsOnly.slice(1)}`;
  }

  return `+${digitsOnly}`;
}

/**
 * Validates whether a phone number matches standard E.164 pattern.
 * Minimum 8 digits, maximum 15 digits according to ITU-T E.164.
 */
export function isValidE164(phone: string): boolean {
  if (!phone) return false;
  const e164Regex = /^\+[1-9]\d{7,14}$/;
  return e164Regex.test(phone);
}

/**
 * Masks a normalized phone number for privacy preservation in UI logs and views.
 * Example: +919876543210 -> +91 98*** **210
 */
export function maskPhone(phone: string): string {
  const normalized = normalizeToE164(phone);
  if (!normalized || normalized.length < 8) return '****';

  const prefix = normalized.slice(0, 3); // e.g. +91
  const remaining = normalized.slice(3);
  if (remaining.length <= 4) {
    return `${prefix} ****`;
  }

  const startDigits = remaining.slice(0, 2);
  const endDigits = remaining.slice(-3);
  return `${prefix} ${startDigits}*** **${endDigits}`;
}
