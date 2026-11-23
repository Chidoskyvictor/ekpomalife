'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, Mesh, ShaderMaterial, SphereGeometry, SRGBColorSpace, TextureLoader } from 'three'
import type { RideLook } from '@/components/travel/ride-environment'

/*
 * The drive's sky: real CC0 Poly Haven HDRIs (day, dusk and night, tone-mapped to small JPGs in
 * public/sky), laid over the hour's own gradient and turned so the sun sits where the light says.
 * Below the horizon it melts into the fog colour, so far buildings fade into the same haze the
 * sky ends in.
 */

const FILES = { day: '/sky/sky-day.jpg', dusk: '/sky/sky-dusk.jpg', night: '/sky/sky-night.jpg' }
/** Where the sun (or glow) sits in each picture, as an angle round the horizon (radians from the centre). */
const SUN_AT = { day: 0.75, dusk: 0.63, night: 0 }
const WEIGHT = { day: 0.92, dusk: 0.62, night: 0.45 }

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FRAG = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uHorizon; uniform vec3 uZenith; uniform float uYaw; uniform float uWeight; uniform float uShade;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec2 uv = vec2((atan(d.x, -d.z) - uYaw) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);
  vec3 tex = texture2D(uMap, uv).rgb * uShade;
  vec3 grad = mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.5));
  float up = smoothstep(0.0, 0.2, d.y);
  vec3 col = mix(uHorizon, mix(grad, tex, uWeight), up);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

export function StreetSky({ look }: { look: RideLook }) {
  const mesh = useRef<Mesh>(null)
  const camera = useThree((s) => s.camera)
  const geometry = useMemo(() => new SphereGeometry(420, 24, 12), [])
  const { material, map } = useMemo(() => {
    const level = look.level
    const map = new TextureLoader().load(FILES[level])
    map.colorSpace = SRGBColorSpace
    const sun = Math.atan2(look.discDir.x, -look.discDir.z)
    const material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uMap: { value: map },
        uHorizon: { value: look.horizon.clone() },
        uZenith: { value: look.zenith.clone() },
        uYaw: { value: level === 'night' ? 0 : sun - SUN_AT[level] },
        uWeight: { value: WEIGHT[level] },
        uShade: { value: level === 'night' ? 0.55 : 1 },
      },
    })
    return { material, map }
  }, [look])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
      map.dispose()
    },
    [geometry, material, map],
  )
  useFrame(() => mesh.current?.position.copy(camera.position))
  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={-10} frustumCulled={false} />
}
