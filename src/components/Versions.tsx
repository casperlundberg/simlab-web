import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { describeBuild } from './provenance'

/** Which code is running: this bundle, the backend, and the autoscaler making
 *  the decisions. What a run started now would record as its provenance. */
export function Versions() {
  const versions = useQuery({ queryKey: ['versions'], queryFn: api.versions, staleTime: 5 * 60_000 })
  const web = __SIMLAB_WEB_BUILD__

  return (
    <dl className="versions" aria-label="Versions">
      <dt>web</dt>
      <dd title={web.commit}>{describeBuild({ ...web, modified: web.version.endsWith('.dirty'), go_version: '' })}</dd>
      <dt>api</dt>
      <dd title={versions.data?.simlab_api.commit}>{versions.data ? describeBuild(versions.data.simlab_api) : '…'}</dd>
      <dt>autoscaler</dt>
      <dd title={versions.data?.autoscaler?.commit ?? versions.data?.autoscaler_error}>
        {versions.data ? describeBuild(versions.data.autoscaler) : '…'}
      </dd>
    </dl>
  )
}
