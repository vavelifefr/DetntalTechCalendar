import { useMemo } from 'react'
import { FDI_PERMANENT_MAP } from './odontogram-map-layout'

interface OdontogramProps {
  selectedCodes: readonly string[]
  onChange: (codes: string[]) => void
}

function quadrantName(code: string): string {
  const names: Record<string, string> = {
    '1': 'верхний правый',
    '2': 'верхний левый',
    '3': 'нижний левый',
    '4': 'нижний правый',
  }
  return names[code[0]] ?? ''
}

function percentage(value: number, total: number): string {
  return `${(value / total) * 100}%`
}

export function Odontogram({ selectedCodes, onChange }: OdontogramProps) {
  const toothBounds = useMemo(
    () => new Map(FDI_PERMANENT_MAP.toothBounds.map((bounds) => [bounds.code, bounds])),
    [],
  )

  function toggle(code: string) {
    const selected = new Set(selectedCodes)
    if (selected.has(code)) selected.delete(code)
    else selected.add(code)
    onChange([...selected])
  }

  return (
    <section className="odontogram" aria-label="Карта постоянных зубов FDI">
      <div className="odontogram-heading">
        <div>
          <strong>Зубы · FDI</strong>
          <span>Выбрано: {selectedCodes.length}</span>
        </div>
        <button
          className="odontogram-clear"
          disabled={selectedCodes.length === 0}
          onClick={() => onChange([])}
          type="button"
        >
          Снять выбор
        </button>
      </div>
      <p className="odontogram-side-note">Слева на экране — правая сторона пациента</p>
      <div className="odontogram-map" aria-label="Нажмите на номер зуба, чтобы выбрать его">
        <img alt="" aria-hidden="true" className="odontogram-map-artwork" src={FDI_PERMANENT_MAP.artwork} />
        {selectedCodes.map((code) => {
          const bounds = toothBounds.get(code)
          if (!bounds) return null
          return (
            <svg
              aria-hidden="true"
              className="odontogram-selected-tooth"
              key={code}
              preserveAspectRatio="none"
              style={{
                height: percentage(bounds.height, FDI_PERMANENT_MAP.height),
                left: percentage(bounds.x, FDI_PERMANENT_MAP.width),
                top: percentage(bounds.y, FDI_PERMANENT_MAP.height),
                width: percentage(bounds.width, FDI_PERMANENT_MAP.width),
              }}
              viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
            >
              <image
                href={FDI_PERMANENT_MAP.artwork}
                height={FDI_PERMANENT_MAP.height}
                width={FDI_PERMANENT_MAP.width}
                x="0"
                y="0"
              />
            </svg>
          )
        })}
        {FDI_PERMANENT_MAP.buttons.map(({ code, centerX, centerY }) => (
          <button
            aria-label={`${quadrantName(code)} квадрант, постоянный зуб FDI ${code}`}
            aria-pressed={selectedCodes.includes(code)}
            className="odontogram-map-button"
            key={code}
            onClick={() => toggle(code)}
            style={{
              left: percentage(centerX, FDI_PERMANENT_MAP.width),
              top: percentage(centerY, FDI_PERMANENT_MAP.height),
            }}
            type="button"
          >
            {code}
          </button>
        ))}
      </div>
    </section>
  )
}
