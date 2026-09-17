import { describe, expect, it } from 'vitest'
import type { Build } from '../api/types'
import { describeBuild, reproduceCommand } from './provenance'

const commit = '9caaa12b934d2f03af94e79341e72d08bf230cf3'

describe('describing a build', () => {
  it('names a release and the commit it is', () => {
    expect(describeBuild({ version: '1.2.0', commit, modified: false, go_version: 'go1.24' }))
      .toBe('1.2.0 (9caaa12)')
  })

  // The commit is already in the parentheses; repeating it from the build
  // metadata only makes the label longer.
  it('drops the build metadata a development version repeats', () => {
    expect(describeBuild({ version: '1.2.1-dev.3+9caaa12', commit, modified: false, go_version: 'go1.24' }))
      .toBe('1.2.1-dev.3 (9caaa12)')
  })

  // A modified build cannot be rebuilt from its commit, and has to say so
  // wherever it is named, not only in a detail somewhere else.
  it('says when the build had changes its commit does not contain', () => {
    expect(describeBuild({ version: '1.2.1-dev.3+9caaa12.dirty', commit, modified: true, go_version: 'go1.24' }))
      .toBe('1.2.1-dev.3 (9caaa12, modified)')
  })

  it('says when it knows nothing', () => {
    expect(describeBuild({ version: '', commit: '', modified: false, go_version: 'go1.24' })).toBe('unknown build')
    expect(describeBuild(null)).toBe('unknown build')
  })

  it('names an unstamped build by its commit alone', () => {
    const build: Build = { version: '', commit, modified: false, go_version: 'go1.24' }
    expect(describeBuild(build)).toBe('9caaa12')
  })
})

describe('reproducing a run', () => {
  // The command a reader copies has to name the run exactly and nothing else;
  // a run id in a shell command is the whole instruction.
  it('is one command naming the run', () => {
    expect(reproduceCommand('run-w4fi4c2o-0sm7m5za')).toBe('make -C platform-experiments reproduce RUN=run-w4fi4c2o-0sm7m5za')
  })
})
