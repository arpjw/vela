'use client'

import { useRef, useEffect } from 'react'

const HEX_CHARS = '0123456789ABCDEF'
const CELL_W = 9.5
const CELL_H = 16

const GENESIS_HEX = `00000000 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 3B A3 ED FD 7A 7B 12 B2 7A C7 2C 3E 67 76 8F 61 7F C8 1B C3 88 8A 51 32 3A 9F B8 AA 4B 1E 5E 4A 29 AB 5F 49 FF FF 00 1D 1D AC 2B 7C 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 FF FF FF FF 4D 04 FF FF 00 1D 01 04 45 54 68 65 20 54 69 6D 65 73 20 30 33 2F 4A 61 6E 2F 32 30 30 39 20 43 68 61 6E 63 65 6C 6C 6F 72 20 6F 6E 20 62 72 69 6E 6B 20 6F 66 20 73 65 63 6F 6E 64 20 62 61 69 6C 6F 75 74 20 66 6F 72 20 62 61 6E 6B 73 FF FF FF FF 01 00 F2 05 2A 01 00 00 00 43 41 04 67 8A FD B0 FE 55 48 27 19 67 F1 A6 71 30 B7 10 5C D6 A8 28 E0 39 09 A6 79 62 E0 EA 1F 61 DE B6 49 F6 BC 3F 4C EF 38 C4 F3 55 04 E5 1E C1 12 DE 5C 38 4D F7 BA 0B 8D 57 8A 4C 70 2B 6B F1 1D 5F AC 00 00 00 00`

interface Cell {
  char: string
  originalChar: string
  scrambleTimer: number
  intensity: number
}

function randomHex(): string {
  return HEX_CHARS[Math.floor(Math.random() * HEX_CHARS.length)]
}

function buildCells(cols: number, rows: number): Cell[][] {
  const total = cols * rows
  const repeated = Array(Math.ceil(total / GENESIS_HEX.length) + 1).fill(GENESIS_HEX).join(' ')
  const cells: Cell[][] = []
  let idx = 0
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = []
    for (let c = 0; c < cols; c++) {
      const ch = repeated[idx++] ?? ' '
      row.push({ char: ch, originalChar: ch, scrambleTimer: 0, intensity: 0 })
    }
    cells.push(row)
  }
  return cells
}

export default function HexCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef<{ x: number; y: number } | null>(null)
  const cellsRef = useRef<Cell[][]>([])
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const parent = canvas.parentElement
    if (!parent) return

    function resize() {
      if (!canvas || !ctx || !parent) return
      const dpr = window.devicePixelRatio || 1
      const w = parent.clientWidth
      const h = parent.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cellsRef.current = buildCells(Math.ceil(w / CELL_W), Math.ceil(h / CELL_H))
    }

    function frame() {
      if (!canvas || !ctx) return
      const cells = cellsRef.current
      if (!cells.length) {
        timeoutRef.current = setTimeout(() => { frameRef.current = requestAnimationFrame(frame) }, 33)
        return
      }

      const dpr = window.devicePixelRatio || 1
      const logW = canvas.width / dpr
      const logH = canvas.height / dpr
      ctx.clearRect(0, 0, logW, logH)
      ctx.font = '10.5px "Courier New", monospace'
      ctx.textBaseline = 'top'

      const rows = cells.length
      const cols = cells[0].length
      const mouse = mouseRef.current
      const flickerCount = Math.max(1, Math.floor(rows * cols * 0.003))

      for (let i = 0; i < flickerCount; i++) {
        const r = Math.floor(Math.random() * rows)
        const c = Math.floor(Math.random() * cols)
        const cell = cells[r][c]
        if (cell.intensity < 0.1) {
          cell.char = randomHex()
          cell.scrambleTimer = 2 + Math.floor(Math.random() * 2)
        }
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = cells[r][c]
          const x = c * CELL_W
          const y = r * CELL_H

          if (mouse) {
            const dist = Math.sqrt((x + CELL_W / 2 - mouse.x) ** 2 + (y + CELL_H / 2 - mouse.y) ** 2)
            if (dist < 120) {
              const intensity = 1 - dist / 120
              cell.intensity = intensity
              if (Math.random() < intensity * 0.4) {
                cell.char = randomHex()
              }
            } else {
              cell.intensity = Math.max(0, cell.intensity - 0.05)
              if (cell.scrambleTimer > 0) {
                if (--cell.scrambleTimer === 0) cell.char = cell.originalChar
              } else {
                cell.char = cell.originalChar
              }
            }
          } else {
            cell.intensity = Math.max(0, cell.intensity - 0.05)
            if (cell.scrambleTimer > 0) {
              if (--cell.scrambleTimer === 0) cell.char = cell.originalChar
            } else if (cell.char !== cell.originalChar) {
              cell.char = cell.originalChar
            }
          }

          ctx.fillStyle = `rgba(232,228,216,${0.09 + cell.intensity * 0.15})`
          ctx.fillText(cell.char, x, y)
        }
      }

      timeoutRef.current = setTimeout(() => {
        frameRef.current = requestAnimationFrame(frame)
      }, 33)
    }

    function onMouseMove(e: MouseEvent) {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    function onMouseLeave() {
      mouseRef.current = null
    }

    const observer = new ResizeObserver(resize)
    observer.observe(parent)
    resize()
    frame()

    parent.addEventListener('mousemove', onMouseMove)
    parent.addEventListener('mouseleave', onMouseLeave)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      cancelAnimationFrame(frameRef.current)
      observer.disconnect()
      parent.removeEventListener('mousemove', onMouseMove)
      parent.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        display: 'block',
      }}
    />
  )
}
