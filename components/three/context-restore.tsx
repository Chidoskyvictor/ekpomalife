'use client'

import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

/**
 * Mobile browsers drop the WebGL context when the game is minimised. Without preventDefault the
 * context never comes back and the scene goes blank (players then reload). This keeps it
 * restorable: three.js re-uploads geometry and textures on "restored" and we redraw, so the
 * scene, player position and React state all stay as they were, with no page reload.
 */
export function ContextRestore() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const canvas = gl.domElement
    const lost = (e: Event) => e.preventDefault()
    const restored = () => {
      gl.resetState()
      invalidate()
    }
    canvas.addEventListener('webglcontextlost', lost, false)
    canvas.addEventListener('webglcontextrestored', restored, false)
    return () => {
      canvas.removeEventListener('webglcontextlost', lost, false)
      canvas.removeEventListener('webglcontextrestored', restored, false)
    }
  }, [gl, invalidate])
  return null
}
