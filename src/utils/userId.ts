const STORAGE_KEY = 'builddrop_user_id';

export function getOrCreateUserId(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'user_default';
  }
  let userId = localStorage.getItem(STORAGE_KEY);
  if (!userId) {
    const randomStr = Math.random().toString(36).substring(2, 10);
    userId = `user_${Date.now().toString(36)}_${randomStr}`;
    localStorage.setItem(STORAGE_KEY, userId);
  }
  return userId;
}
