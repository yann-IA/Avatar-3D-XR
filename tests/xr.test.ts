import { describe, expect, it } from 'vitest'
import { wrap } from '../src/xr/ar'

// Mesure simplifiée : 10 px par caractère.
const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) }

describe('wrap (texte du panneau en réalité augmentée)', () => {
  it('coupe aux espaces sans dépasser la largeur', () => {
    expect(wrap(ctx, 'Bonjour à toi mon ami', 100, 5)).toEqual(['Bonjour à', 'toi mon', 'ami'])
  })
  it('limite le nombre de lignes et termine par une ellipse', () => {
    const lines = wrap(ctx, 'un deux trois quatre cinq six sept huit', 60, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
  })
  it('gère le texte vide', () => {
    expect(wrap(ctx, '', 100, 3)).toEqual([])
  })
})
