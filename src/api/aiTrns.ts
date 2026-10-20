import { AI_TRNS_API } from '../consts';
import { getToken, kc } from './UserManager';

// A request to ai-trns with the user's Keycloak token. Nobody logged in: off to the login page.
export async function aiTrnsFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken().catch(() => null);
  if (!token) {
    void kc.login({ redirectUri: window.location.href });
    throw new Error('יש להתחבר');
  }
  const url = new URL(`${AI_TRNS_API}${path}`, window.location.href);
  try {
    return await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error('השרת אינו זמין');
  }
}
