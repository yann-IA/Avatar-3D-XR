import { describe, expect, it } from 'vitest'
import { applyKey, layoutKeys } from '../src/xr/keyboard'

describe('clavier de réalité augmentée', () => {
  it('saisit, met en majuscule et efface', () => {
    let t = ''
    t = applyKey(t, { type: 'char', value: 'é' }, true)
    t = applyKey(t, { type: 'char', value: 't' }, false)
    t = applyKey(t, { type: 'char', value: ' ' }, false)
    expect(t).toBe('Ét ')
    expect(applyKey(t, { type: 'back' }, false)).toBe('Ét')
    expect(applyKey('', { type: 'back' }, false)).toBe('')
  })

  it('dispose toutes les touches sans chevauchement', () => {
    const keys = layoutKeys()
    expect(keys.find((k) => k.action.type === 'ok')).toBeTruthy()
    expect(keys.find((k) => k.action.type === 'char' && k.action.value === ' ')).toBeTruthy()
    for (const a of keys)
      for (const b of keys)
        if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true)
  })
})
