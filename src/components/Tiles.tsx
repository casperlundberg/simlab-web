import type { ReactNode } from 'react'

interface TileProps {
  label: string
  value: ReactNode
  unit?: string
  tone?: 'good' | 'bad'
}

export function Tile({ label, value, unit, tone }: TileProps) {
  return (
    <div className={`tile${tone ? ` ${tone}` : ''}`}>
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </div>
    </div>
  )
}

export function Tiles({ children }: { children: ReactNode }) {
  return <div className="tiles">{children}</div>
}
