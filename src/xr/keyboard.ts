import * as THREE from 'three'

/**
 * Clavier virtuel en réalité augmentée, pour taper la phrase secrète du coffre à clés sans
 * quitter le casque (les pages web et le clavier du système ne sont pas visibles en RA).
 * On vise une touche avec la manette ou la main, puis gâchette ou pincement pour l'appuyer.
 */

export type KeyAction = { type: 'char'; value: string } | { type: 'shift' | 'back' | 'reveal' | 'cancel' | 'ok' }

export interface KeyboardRequest {
  title: string
  hint: string
  /** Renvoie un message d'erreur à afficher, ou null si c'est réussi (le clavier se ferme). */
  submit(text: string): Promise<string | null>
  cancel(): void
}

interface Key {
  label: string
  action: KeyAction
  x: number
  y: number
  w: number
  h: number
}

const W = 1024
const H = 900
const TOP = 250 // hauteur de l'en-tête (titre, champ, message)
const PAD = 20
const COLS = 10

const char = (c: string): [string, KeyAction, number] => [c, { type: 'char', value: c }, 1]
const ROWS: [string, KeyAction, number][][] = [
  [...'1234567890'].map(char),
  [...'azertyuiop'].map(char),
  [...'qsdfghjklm'].map(char),
  [['Maj', { type: 'shift' }, 1], ...[...'wxcvbnéè'].map(char), ['←', { type: 'back' }, 1]],
  [...[...'àç\'-'].map(char), ['espace', { type: 'char', value: ' ' }, 4], char('.'), ['Voir', { type: 'reveal' }, 1]],
  [
    ['Annuler', { type: 'cancel' }, 4],
    ['Valider', { type: 'ok' }, 6],
  ],
]

/** Disposition des touches sur la texture (en pixels). */
export function layoutKeys(): Key[] {
  const keys: Key[] = []
  const kw = (W - PAD * 2) / COLS
  const kh = (H - TOP - PAD) / ROWS.length
  ROWS.forEach((row, r) => {
    let col = 0
    for (const [label, action, span] of row) {
      keys.push({ label, action, x: PAD + col * kw + 4, y: TOP + r * kh + 4, w: span * kw - 8, h: kh - 8 })
      col += span
    }
  })
  return keys
}

/** Applique une touche au texte en cours de saisie. */
export function applyKey(text: string, action: KeyAction, shift: boolean): string {
  if (action.type === 'char') return text + (shift ? action.value.toLocaleUpperCase('fr') : action.value)
  if (action.type === 'back') return [...text].slice(0, -1).join('')
  return text
}

export class XRKeyboard {
  readonly mesh: THREE.Mesh
  private readonly canvas = document.createElement('canvas')
  private readonly texture: THREE.CanvasTexture
  private readonly keys = layoutKeys()
  private readonly raycaster = new THREE.Raycaster()
  private request: KeyboardRequest | null = null
  private text = ''
  private shift = false
  private reveal = false
  private error = ''
  private busy = false
  private hover: Key | null = null

  constructor() {
    this.canvas.width = W
    this.canvas.height = H
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    const width = 0.72
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, (width * H) / W),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, depthTest: false }),
    )
    this.mesh.renderOrder = 20
    this.mesh.visible = false
  }

  get isOpen(): boolean {
    return this.request !== null
  }

  open(request: KeyboardRequest): void {
    this.request = request
    this.text = ''
    this.shift = this.reveal = this.busy = false
    this.error = ''
    this.mesh.visible = true
    this.redraw()
  }

  close(): void {
    this.request = null
    this.mesh.visible = false
    this.text = '' // la phrase secrète ne reste pas en mémoire
  }

  /** Ferme le clavier comme le bouton « Annuler ». */
  cancel(): void {
    const req = this.request
    if (!req) return
    this.close()
    req.cancel()
  }

  /** Touche visée par un rayon, s'il y en a une. */
  hit(ray: THREE.Ray): Key | null {
    if (!this.mesh.visible) return null
    this.raycaster.set(ray.origin, ray.direction)
    const uv = this.raycaster.intersectObject(this.mesh, false)[0]?.uv
    if (!uv) return null
    const x = uv.x * W
    const y = (1 - uv.y) * H
    return this.keys.find((k) => x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) ?? null
  }

  /** Le rayon touche-t-il le clavier (même entre deux touches) ? */
  covers(ray: THREE.Ray): boolean {
    if (!this.mesh.visible) return false
    this.raycaster.set(ray.origin, ray.direction)
    return this.raycaster.intersectObject(this.mesh, false).length > 0
  }

  setHover(key: Key | null): void {
    if (key === this.hover) return
    this.hover = key
    this.redraw()
  }

  press(key: Key): void {
    const req = this.request
    if (!req || this.busy) return
    const a = key.action
    switch (a.type) {
      case 'shift':
        this.shift = !this.shift
        break
      case 'reveal':
        this.reveal = !this.reveal
        break
      case 'cancel':
        this.close()
        req.cancel()
        return
      case 'ok':
        if (!this.text.trim()) return
        this.busy = true
        this.error = ''
        this.redraw()
        void req.submit(this.text).then(
          (error) => this.done(req, error),
          (e: Error) => this.done(req, e.message),
        )
        return
      default:
        this.text = applyKey(this.text, a, this.shift)
        this.error = ''
    }
    this.redraw()
  }

  private done(req: KeyboardRequest, error: string | null): void {
    if (this.request !== req) return
    this.busy = false
    if (error === null) {
      this.close()
      return
    }
    this.error = error
    this.redraw()
  }

  private redraw(): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(16, 17, 32, 0.94)'
    rounded(ctx, 0, 0, W, H, 36)
    ctx.fill()
    ctx.strokeStyle = 'rgba(143, 123, 255, 0.7)'
    ctx.lineWidth = 4
    ctx.stroke()

    // En-tête : titre, champ masqué, message.
    ctx.fillStyle = '#f2f3fa'
    ctx.font = '600 38px system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(this.request?.title ?? '', PAD + 8, 44)
    ctx.fillStyle = '#a7abc4'
    ctx.font = '26px system-ui, sans-serif'
    ctx.fillText(this.request?.hint ?? '', PAD + 8, 88)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
    rounded(ctx, PAD, 116, W - PAD * 2, 74, 16)
    ctx.fill()
    ctx.strokeStyle = '#8f7bff'
    ctx.lineWidth = 3
    ctx.stroke()
    const shown = this.reveal ? this.text : '•'.repeat([...this.text].length)
    ctx.font = '36px system-ui, sans-serif'
    ctx.fillStyle = shown ? '#f2f3fa' : '#6c7090'
    let value = shown || 'Phrase secrète'
    while (ctx.measureText(value).width > W - PAD * 2 - 40 && value.length > 1) value = value.slice(1) // garde la fin visible
    ctx.fillText(value, PAD + 20, 153)

    ctx.font = '28px system-ui, sans-serif'
    if (this.busy) {
      ctx.fillStyle = '#ffc65c'
      ctx.fillText('Déchiffrement…', PAD + 8, 222)
    } else if (this.error) {
      ctx.fillStyle = '#ff8a8a'
      ctx.fillText(this.error, PAD + 8, 222)
    }

    // Touches.
    ctx.textAlign = 'center'
    for (const k of this.keys) {
      const a = k.action
      const active = (a.type === 'shift' && this.shift) || (a.type === 'reveal' && this.reveal)
      ctx.fillStyle =
        a.type === 'ok' ? (this.busy ? '#5b4fa8' : '#8f7bff') : active ? '#ff7eb6' : k === this.hover ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.12)'
      rounded(ctx, k.x, k.y, k.w, k.h, 14)
      ctx.fill()
      if (k === this.hover) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 3
        ctx.stroke()
      }
      ctx.fillStyle = '#ffffff'
      ctx.font = `${k.label.length > 1 ? '600 32px' : '40px'} system-ui, sans-serif`
      const label = a.type === 'char' && k.label.length === 1 && this.shift ? k.label.toLocaleUpperCase('fr') : k.label
      ctx.fillText(label, k.x + k.w / 2, k.y + k.h / 2 + 2)
    }
    this.texture.needsUpdate = true
  }
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
