export const USER_KEY = 'analysis.current.user';
export const TOKEN_KEY = 'analysis.current.token';
export const SESSION_CHANGE_EVENT = 'analysis:session-changed';

function emitSessionChange(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT));
}

export function getStoredUserRaw(): string {
  return localStorage.getItem(USER_KEY) ?? '';
}

export function getStoredAccessToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function persistSession(user: unknown, accessToken: string): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(TOKEN_KEY, accessToken);
  emitSessionChange();
}

export function clearStoredSession(): void {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  emitSessionChange();
}
