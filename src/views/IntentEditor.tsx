import type { EntityKind, IntentClass, IntentSettings, RiskLevel } from '../api/types'
import { CLASSES, KINDS, toggled, type IntentDraft } from './intent'

const KIND_WORDS: Record<EntityKind, string> = {
  person: 'People on foot',
  'crewed-vehicle': 'Crewed vehicles',
  'autonomous-vehicle': 'Autonomous vehicles',
}

const CLASS_WORDS: Record<IntentClass, string> = {
  decayed: 'Decayed work',
  promoted: 'Promoted work',
  restored: 'Restored work',
}

const LEVELS: RiskLevel[] = ['moderate', 'high', 'very-high']

/**
 * The fields of an intent document. Controlled: the page owns the draft, and
 * turns it into a patch with `intentPatch`, which is tested.
 *
 * The hints say what each setting costs, not only what it does, because every
 * one of them trades something — and the sweeps in platform-experiments are
 * where the trade was measured.
 */
export function IntentEditor({ draft, onChange, disabled, idPrefix = 'intent' }: {
  draft: IntentDraft
  onChange: (draft: IntentDraft) => void
  disabled?: boolean
  idPrefix?: string
}) {
  const set = <K extends keyof IntentDraft>(key: K, value: IntentDraft[K]) => onChange({ ...draft, [key]: value })
  const id = (name: string) => `${idPrefix}-${name}`
  const off = draft.mode === 'off'
  const decays = draft.mode === 'decay' || draft.mode === 'both'
  const promotes = draft.mode === 'promote' || draft.mode === 'both'

  return (
    <fieldset className="intent-editor" disabled={disabled}>
      <div className="field-row">
        <div className="field">
          <label htmlFor={id('mode')}>Mode</label>
          <select id={id('mode')} value={draft.mode} onChange={(e) => set('mode', e.target.value as IntentSettings['mode'])}>
            <option value="off">Off — every job keeps its submitted priority</option>
            <option value="decay">Decay — relax work that threatens nobody</option>
            <option value="promote">Promote — raise work that puts someone at risk</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={id('knowledge')}>Judged from</label>
          <select id={id('knowledge')} value={draft.knowledge} disabled={off}
            onChange={(e) => set('knowledge', e.target.value as IntentSettings['knowledge'])}>
            <option value="estimate">The mine's own locations</option>
            <option value="truth">The truth — an oracle no mine has</option>
          </select>
        </div>
      </div>

      <div className="field">
        <span className="label">Protect</span>
        <div className="row wrap">
          {KINDS.map((kind) => (
            <label key={kind} className="row check" htmlFor={id(`protect-${kind}`)}>
              <input id={id(`protect-${kind}`)} type="checkbox" disabled={off}
                checked={draft.protect.includes(kind)}
                onChange={(e) => set('protect', toggled(draft.protect, kind, e.target.checked, KINDS))} />
              {KIND_WORDS[kind]}
            </label>
          ))}
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={id('lookahead')}>Lookahead along routes (s)</label>
          <input id={id('lookahead')} type="number" min="0" disabled={off} value={draft.lookahead_seconds}
            onChange={(e) => set('lookahead_seconds', e.target.value)} />
          <div className="hint">0 protects where things are; more protects where they are heading.</div>
        </div>
        <div className="field">
          <label htmlFor={id('uncertainty')}>Allowance for location error (m)</label>
          <input id={id('uncertainty')} type="number" min="0" disabled={off} value={draft.location_uncertainty_m}
            onChange={(e) => set('location_uncertainty_m', e.target.value)} />
          <div className="hint">Widens every zone. Re-entry practice allows 50 m.</div>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={id('protect-level')}>Keep work reaching someone at</label>
          <select id={id('protect-level')} value={draft.protect_level} disabled={!decays}
            onChange={(e) => set('protect_level', e.target.value as RiskLevel)}>
            {LEVELS.map((level) => <option key={level} value={level}>{level} ground motion</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={id('promote-level')}>Promote work reaching someone at</label>
          <select id={id('promote-level')} value={draft.promote_level} disabled={!promotes}
            onChange={(e) => set('promote_level', e.target.value as RiskLevel)}>
            {LEVELS.map((level) => <option key={level} value={level}>{level} ground motion</option>)}
          </select>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={id('decay-to')}>Decay to priority</label>
          <input id={id('decay-to')} type="number" disabled={!decays} value={draft.decay_to}
            onChange={(e) => set('decay_to', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={id('promote-to')}>Promote to priority</label>
          <input id={id('promote-to')} type="number" disabled={!promotes} value={draft.promote_to}
            onChange={(e) => set('promote_to', e.target.value)} />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={id('deadline')}>A moved job's deadline runs from</label>
          <select id={id('deadline')} value={draft.deadline_from} disabled={off}
            onChange={(e) => set('deadline_from', e.target.value as IntentSettings['deadline_from'])}>
            <option value="arrival">Its arrival — a move never hides a wait</option>
            <option value="change">The change — a fresh deadline at its new level</option>
          </select>
          <div className="hint">From arrival, work promoted or restored late is a breach at once, and scales hard unless exempt.</div>
        </div>
        <div className="field">
          <span className="label">Restore</span>
          <label className="row check" htmlFor={id('restore')}>
            <input id={id('restore')} type="checkbox" disabled={!decays} checked={draft.restore}
              onChange={(e) => set('restore', e.target.checked)} />
            Restore decayed work when someone heads towards its event
          </label>
          <div className="hint">Off makes decay final: a pure relaxation, blind to anyone arriving later.</div>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <span className="label">Before a location exists</span>
          <label className="row check" htmlFor={id('pre-location')}>
            <input id={id('pre-location')} type="checkbox" disabled={off || draft.knowledge === 'truth'}
              checked={draft.pre_location} onChange={(e) => set('pre_location', e.target.checked)} />
            Judge from the first sensor to trigger
          </label>
        </div>
        <div className="field">
          <label htmlFor={id('pre-magnitude')}>Assumed magnitude before one is estimated</label>
          <input id={id('pre-magnitude')} type="number" step="0.1" value={draft.pre_location_magnitude}
            disabled={off || !draft.pre_location} onChange={(e) => set('pre_location_magnitude', e.target.value)} />
        </div>
      </div>

      <div className="field">
        <span className="label">Exempt from cloud burst</span>
        <div className="row wrap">
          {CLASSES.map((cls) => (
            <label key={cls} className="row check" htmlFor={id(`exempt-${cls}`)}>
              <input id={id(`exempt-${cls}`)} type="checkbox" disabled={off}
                checked={draft.burst_exempt.includes(cls)}
                onChange={(e) => set('burst_exempt', toggled(draft.burst_exempt, cls, e.target.checked, CLASSES))} />
              {CLASS_WORDS[cls]}
            </label>
          ))}
        </div>
        <div className="hint">
          Exempt work is still served and still counted when late, but is never the reason cloud capacity is bought.
        </div>
      </div>

      <div className="field">
        <label htmlFor={id('margin')}>Extra margin (m)</label>
        <input id={id('margin')} type="number" min="0" disabled={off} value={draft.margin_m}
          onChange={(e) => set('margin_m', e.target.value)} />
      </div>
    </fieldset>
  )
}
