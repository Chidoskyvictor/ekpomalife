'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  CanvasTexture,
  Color,
  SRGBColorSpace,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type PointLight,
} from 'three'
import type { Spender } from '@/lib/game/venues-api'

/*
 * What makes the club feel alive, on top of the static GLB (blender build_club):
 * the light-up dance floor cycles colours on the beat, the disco ball spins, the DJ
 * screen shifts hue, three coloured lights wash the room, and the screen above VIP shows
 * tonight's biggest spenders ("shutting it down").
 * Mounted inside the home group, so positions are the GLB's own (game coords).
 */

const PALETTE = ['#ff3fb4', '#29e7ff', '#ffd23a', '#a65bff'].map((c) => new Color(c))
const BPM = 112

function drawSpenders(canvas: HTMLCanvasElement, clubName: string, top: Spender[]) {
  const ctx = canvas.getContext('2d')!
  const { width: w, height: h } = canvas
  const bg = ctx.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, '#160f3a')
  bg.addColorStop(1, '#2a0f3a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#ffd23a'
  ctx.font = '800 34px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('🍾 SHUTTING IT DOWN TONIGHT', 28, 40)
  ctx.fillStyle = '#ff9cf0'
  ctx.font = '600 20px system-ui, sans-serif'
  ctx.fillText(clubName.toUpperCase(), w - 28 - ctx.measureText(clubName.toUpperCase()).width, 40)
  if (!top.length) {
    ctx.fillStyle = '#c9c3ff'
    ctx.font = '600 26px system-ui, sans-serif'
    ctx.fillText('Nobody yet. Buy a round and take the top spot.', 28, h / 2 + 20)
    return
  }
  top.slice(0, 5).forEach((s, i) => {
    const y = 96 + i * 36
    ctx.fillStyle = i === 0 ? '#ffd23a' : '#ffffff'
    ctx.font = `${i === 0 ? 800 : 600} 26px system-ui, sans-serif`
    ctx.fillText(`${i + 1}. @${s.username}`, 28, y)
    const amount = `₦${s.spent.toLocaleString()}`
    ctx.fillStyle = '#29e7ff'
    ctx.fillText(amount, w - 28 - ctx.measureText(amount).width, y)
  })
}

export function ClubFx({ root, clubName, top }: { root: Object3D; clubName: string; top: Spender[] }) {
  const tiles = useRef<{ mat: MeshStandardMaterial; i: number; j: number }[]>([])
  const screen = useRef<MeshStandardMaterial | null>(null)
  const ball = useRef<Object3D | null>(null)
  const floorLight = useRef<PointLight>(null)

  // Own copies of the tile and screen materials (the GLB's shared ones stay untouched)
  useLayoutEffect(() => {
    const swapped: [Mesh, Material][] = []
    root.traverse((object) => {
      const mesh = object as Mesh
      if (object.name.startsWith('DiscoBall') && (object as Mesh).isMesh) ball.current = object
      if (!mesh.isMesh || Array.isArray(mesh.material)) return
      const name = mesh.material.name
      const tile = name.match(/^DanceTile(\d)(\d)$/)
      if (!tile && name !== 'ClubScreen') return
      const copy = mesh.material.clone() as MeshStandardMaterial
      swapped.push([mesh, mesh.material])
      mesh.material = copy
      if (tile) tiles.current.push({ mat: copy, i: Number(tile[1]), j: Number(tile[2]) })
      else screen.current = copy
    })
    return () => {
      for (const [mesh, original] of swapped) {
        ;(mesh.material as Material).dispose()
        mesh.material = original
      }
      tiles.current = []
      screen.current = null
      ball.current = null
    }
  }, [root])

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const beat = Math.floor((t * BPM) / 60)
    const pulse = 1 - ((t * BPM) / 60 - beat) // 1 on the beat, fading
    const pattern = Math.floor(beat / 8) % 3
    for (const { mat, i, j } of tiles.current) {
      const step = pattern === 0 ? i + j + beat : pattern === 1 ? (i % 2 === j % 2 ? beat : beat + 2) : Math.abs(i - 2.5) + Math.abs(j - 2.5) + beat
      const color = PALETTE[Math.floor(step) % PALETTE.length]
      mat.emissive.copy(color)
      mat.color.copy(color)
      mat.emissiveIntensity = 1.6 + pulse * 1.4
    }
    if (screen.current) screen.current.emissive.setHSL((0.8 + t * 0.03) % 1, 0.8, 0.6)
    if (ball.current) ball.current.rotation.y += delta * 0.8
    if (floorLight.current) {
      floorLight.current.color.copy(PALETTE[beat % PALETTE.length])
      floorLight.current.intensity = 5 + pulse * 3
    }
  })

  // Spender board: a canvas texture on a plane just in front of the SpendScreen panel
  const board = useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 300
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return { canvas, texture }
  }, [])
  useEffect(() => {
    if (!board) return
    drawSpenders(board.canvas, clubName, top)
    board.texture.needsUpdate = true
  }, [board, clubName, top])
  useEffect(() => () => board?.texture.dispose(), [board])

  return (
    <>
      <pointLight position={[-4.6, 2.8, 1]} color="#ff3fb4" intensity={6} distance={9} decay={1.2} />
      <pointLight position={[4.6, 2.8, 0]} color="#29e7ff" intensity={6} distance={9} decay={1.2} />
      <pointLight ref={floorLight} position={[0, 3.2, -0.5]} color="#a65bff" intensity={5} distance={10} decay={1.2} />
      {board ? (
        <mesh position={[5.79, 2.8, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[5.1, 1.5]} />
          <meshBasicMaterial map={board.texture} toneMapped={false} />
        </mesh>
      ) : null}
    </>
  )
}
