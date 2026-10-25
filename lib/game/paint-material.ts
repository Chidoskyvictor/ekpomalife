import { Color, type Material, type MeshStandardMaterial } from 'three'

/*
 * Repainted copies of GLB materials. Several homes share one GLB (and useGLTF's cached
 * materials), so the originals are never touched: each (material, colour) pair gets one
 * clone, shared and reference-counted, and disposed when the last user lets go.
 *
 * Textured materials (Kenney colour-swatch atlases) only repaint the strongly coloured
 * texels, so grey glass, roof and trim on the same texture stay as they are.
 */

type Entry = { material: Material; users: number }

const cache = new Map<string, Entry>()
const keyOf = new WeakMap<Material, string>()

function paintedClone(source: Material, hex: string): Material {
  const material = source.clone() as MeshStandardMaterial
  if (!material.map) {
    material.color = new Color(hex)
    return material
  }
  const paint = new Color(hex)
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPaint = { value: paint }
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uPaint;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float hi = max( max( sampledDiffuseColor.r, sampledDiffuseColor.g ), sampledDiffuseColor.b );
  float lo = min( min( sampledDiffuseColor.r, sampledDiffuseColor.g ), sampledDiffuseColor.b );
  float sat = hi > 0.0 ? ( hi - lo ) / hi : 0.0;
  // Only coloured swatches take the paint, keeping their light/dark
  vec3 painted = uPaint * clamp( hi * 1.25, 0.6, 1.15 );
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, painted, smoothstep( 0.5, 0.6, sat ) );
  diffuseColor *= sampledDiffuseColor;
#endif`,
      )
  }
  material.customProgramCacheKey = () => 'paint'
  return material
}

/** A painted copy of `source` (shared per colour). Pair every call with releasePaint. */
export function paintOf(source: Material, hex: string): Material {
  const key = `${source.uuid}:${hex.toLowerCase()}`
  let entry = cache.get(key)
  if (!entry) {
    entry = { material: paintedClone(source, hex), users: 0 }
    cache.set(key, entry)
    keyOf.set(entry.material, key)
  }
  entry.users++
  return entry.material
}

/** Let go of a painted copy; the last user disposes it. */
export function releasePaint(material: Material) {
  const key = keyOf.get(material)
  const entry = key ? cache.get(key) : undefined
  if (!key || !entry) return
  entry.users--
  if (entry.users > 0) return
  cache.delete(key)
  material.dispose()
}

/** How many painted copies are alive (for tests). */
export function paintCacheSize() {
  return cache.size
}
