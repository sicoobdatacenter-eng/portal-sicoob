export const DEFAULT_EMAIL_DOMAIN: string;
export const USERNAME_RE: RegExp;
export const PASSWORD_MIN: number;
export const PASSWORD_MAX: number;
export function normalizeUsername(value: unknown): string;
export function usernameError(value: unknown): string | null;
export function passwordError(value: unknown): string | null;
export function internalEmail(username: string, domain?: string): string;
