import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LiveDot, StatusBadge } from './StatusBadge'

describe('the status badge', () => {
  it('shows the run’s status', () => {
    render(<StatusBadge status="completed" />)
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  // A killed process leaves a run at "running" in the database forever.
  // Repeating that would tell somebody a run is progressing when nothing is
  // touching it.
  it('calls a run interrupted when nothing is running it', () => {
    render(<StatusBadge status="running" active={false} />)
    expect(screen.getByText('interrupted')).toBeInTheDocument()
  })

  it('leaves a genuinely running run alone', () => {
    render(<StatusBadge status="running" active={true} />)
    expect(screen.getByText('running')).toBeInTheDocument()
  })
})

describe('the live indicator', () => {
  it('says when the stream has dropped, rather than looking connected', () => {
    render(<LiveDot connected={false} />)
    expect(screen.getByText('reconnecting')).toBeInTheDocument()
  })
})
