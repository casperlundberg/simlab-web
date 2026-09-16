/** The API token this browser sends with every request.
 *
 *  The backend requires one, and the browser is the only place it can come
 *  from: nginx proxying /api cannot inject it, because nginx is the thing
 *  exposed — a token added there would authenticate the whole internet.
 *
 *  Kept in localStorage, which is per-browser and never leaves it except as
 *  the Authorization header on requests to this same origin.
 */
const KEY = 'simlab.token'

let listeners: Array<() => void> = []

export function getToken(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    // Private windows and blocked site data both throw rather than return
    // null. An unreadable store is an absent token, not a crash.
    return ''
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  } catch {
    // Nothing useful to do: the session still works, it just will not be
    // remembered past a reload.
  }
  listeners.forEach((l) => l())
}

/** Called when the backend refuses the token we have, so the app can ask for
 *  another one instead of showing an error the user cannot act on. */
export function onTokenRejected(listener: () => void): () => void {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

export function notifyTokenRejected(): void {
  listeners.forEach((l) => l())
}
