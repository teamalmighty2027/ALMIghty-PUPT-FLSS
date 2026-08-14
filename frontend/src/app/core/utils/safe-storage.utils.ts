// Utility wrapper for localStorage access.
// Prevents exceptions in Private Browsing / Incognito mode (e.g., Safari DOMExceptions).

export class SafeStorage {

  // Safely get item from localStorage.
  static getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`Storage read blocked for key "${key}":`, e);
      return null;
    }
  }

  // Safely set item in localStorage.
  static setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`Storage write blocked for key "${key}":`, e);
    }
  }

  // Safely remove item from localStorage.
  static removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`Storage delete blocked for key "${key}":`, e);
    }
  }

}
