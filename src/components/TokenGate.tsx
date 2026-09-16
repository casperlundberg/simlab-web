import { useEffect, useState } from 'react'
import { getToken, onTokenRejected, setToken } from '../api/token'

/** Asks for the API token when the backend refuses the one we have.
 *
 *  The token is required because this API is reachable from the internet: the
 *  SPA's nginx proxies /api straight to a service that holds the autoscaler's
 *  credentials. It cannot be injected server-side, because nginx is the thing
 *  exposed.
 */
export function TokenGate({ children }: { children: React.ReactNode }) {
  const [needed, setNeeded] = useState(() => getToken() === '')
  const [value, setValue] = useState('')

  useEffect(() => onTokenRejected(() => setNeeded(getToken() === '')), [])

  if (!needed) return <>{children}</>

  return (
    <div className="token-gate">
      <form
        className="token-card"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = value.trim()
          if (!trimmed) return
          setToken(trimmed)
          setNeeded(false)
          // The views fetch on mount; a reload is the least surprising way to
          // get every one of them to try again with the new token.
          window.location.reload()
        }}
      >
        <h1>Simlab</h1>
        <p>
          This instance requires an API token. It is the value of
          <code> simlab-api.auth.token</code> in the chart, or the
          <code> simlab-api-token</code> key of the Secret it was installed
          with.
        </p>
        <label htmlFor="token">API token</label>
        <input
          id="token"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="paste the token"
          autoFocus
        />
        <button type="submit" disabled={!value.trim()}>Continue</button>
        <p className="token-note">
          Kept in this browser only, and sent as a bearer token to this origin.
        </p>
      </form>
    </div>
  )
}
