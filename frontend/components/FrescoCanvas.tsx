'use client'

import { useEffect, useRef } from 'react'

const COLORS = ['#C41E3A', '#E8829A', '#8B0F22', '#D4607A', '#6B1525', '#4A1520']
const COUNT = 120
const MOUSE_RADIUS = 120

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  opacity: number
  phase: number
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function makeParticle(w: number, h: number): Particle {
  return {
    x: rand(0, w),
    y: rand(0, h),
    vx: rand(-0.15, 0.15),
    vy: rand(-0.15, 0.15),
    size: rand(1.5, 4),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    opacity: rand(0.15, 0.45),
    phase: rand(0, Math.PI * 2),
  }
}

export default function FrescoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let prefersReduced = false
    try {
      prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {}

    let w = window.innerWidth
    let h = window.innerHeight
    canvas.width = w
    canvas.height = h

    let particles: Particle[] = Array.from({ length: COUNT }, () => makeParticle(w, h))
    let mouse = { x: -999, y: -999 }
    let rafId = 0
    let time = 0

    function onResize() {
      w = window.innerWidth
      h = window.innerHeight
      canvas!.width = w
      canvas!.height = h
      particles = Array.from({ length: COUNT }, () => makeParticle(w, h))
    }

    function onMouseMove(e: MouseEvent) {
      mouse = { x: e.clientX, y: e.clientY }
    }

    function draw() {
      if (prefersReduced) return
      rafId = requestAnimationFrame(draw)
      time += 0.016

      ctx!.fillStyle = 'rgba(255, 255, 255, 0.15)'
      ctx!.fillRect(0, 0, w, h)

      for (const p of particles) {
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MOUSE_RADIUS && dist > 0) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS * 0.4
          p.x += (dx / dist) * force
          p.y += (dy / dist) * force
        }

        p.x += p.vx
        p.y += p.vy + Math.sin(time + p.phase) * 0.3

        if (p.x < -p.size) p.x = w + p.size
        if (p.x > w + p.size) p.x = -p.size
        if (p.y < -p.size) p.y = h + p.size
        if (p.y > h + p.size) p.y = -p.size

        ctx!.save()
        ctx!.globalAlpha = p.opacity
        ctx!.fillStyle = p.color
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx!.fill()
        ctx!.restore()
      }
    }

    window.addEventListener('resize', onResize)
    window.addEventListener('mousemove', onMouseMove)
    draw()

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  )
}
