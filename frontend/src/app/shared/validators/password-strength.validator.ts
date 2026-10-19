import { AbstractControl, ValidationErrors } from '@angular/forms';

// Policy: 12+ chars, uppercase, lowercase, digit, special char.
export const PASSWORD_POLICY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/;

/**
 * Validates if the password meets the minimum strength requirements:
 * At least 12 characters, one uppercase, one lowercase, a digit, and a symbol.
 */
export function passwordStrengthValidator(
  control: AbstractControl
): ValidationErrors | null {
  if (!control.value) {
    return null;
  }

  const isValid = PASSWORD_POLICY_REGEX.test(control.value);

  return isValid ? null : { passwordStrength: true };
}
