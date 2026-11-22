import { OrbitControls } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { RotateCcw } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"

const BASE_HEX: Record<string, string> = {
  A: "#4a6fa5",
  T: "#a35d3a",
  G: "#4e7b52",
  C: "#8a6a9e",
}

const GHOST = "#5c5c54"
const BOND = "#5c5c54"
const VERIFIED = "#1f6b4a"
const BP = 24
const TURNS = 2.4
const RADIUS = 1.45
const RISE = 0.245
const SUBSTEPS = 4

interface HelixData {
  first: THREE.Vector3[]
  second: THREE.Vector3[]
  bonds: Array<[THREE.Vector3, THREE.Vector3]>
  rungs: Array<{ a: THREE.Vector3; b: THREE.Vector3; base: string; index: number }>
}

function pointAt(t: number, offset: number): THREE.Vector3 {
  const angle = (t * Math.PI * 2 * TURNS) / (BP - 1) + offset
  const y = (t - (BP - 1) / 2) * RISE
  return new THREE.Vector3(Math.cos(angle) * RADIUS, y, Math.sin(angle) * RADIUS)
}

function buildHelix(sequence: string): HelixData {
  const first: THREE.Vector3[] = []
  const second: THREE.Vector3[] = []
  const bonds: Array<[THREE.Vector3, THREE.Vector3]> = []
  const rungs: HelixData["rungs"] = []

  const steps = (BP - 1) * SUBSTEPS
  for (let step = 0; step <= steps; step += 1) {
    const t = step / SUBSTEPS
    first.push(pointAt(t, 0))
    second.push(pointAt(t, Math.PI))
  }

  for (let i = 0; i < steps; i += 1) {
    bonds.push([first[i], first[i + 1]])
    bonds.push([second[i], second[i + 1]])
  }

  for (let i = 0; i < BP; i += 1) {
    const base = sequence[i]?.toUpperCase() ?? "A"
    rungs.push({
      a: pointAt(i, 0),
      b: pointAt(i, Math.PI),
      base: BASE_HEX[base] ? base : "A",
      index: i,
    })
  }

  return { first, second, bonds, rungs }
}

const UP = new THREE.Vector3(0, 1, 0)

function segmentMatrix(
  dummy: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  thickness: number,
): void {
  const direction = new THREE.Vector3().subVectors(b, a)
  const length = direction.length()
  dummy.position.copy(a).add(b).multiplyScalar(0.5)
  dummy.quaternion.setFromUnitVectors(UP, direction.normalize())
  dummy.scale.set(thickness, length, thickness)
  dummy.updateMatrix()
}

function HelixMesh({
  sequence,
  markPositions,
}: {
  sequence: string
  markPositions: number[]
}) {
  const data = useMemo(() => buildHelix(sequence), [sequence])
  const marks = useMemo(() => new Set(markPositions.filter((p) => p >= 0 && p < BP)), [
    markPositions,
  ])

  const nodeGeometry = useMemo(() => new THREE.SphereGeometry(0.017, 8, 6), [])
  const bondGeometry = useMemo(() => new THREE.CylinderGeometry(0.032, 0.032, 1, 6, 1), [])
  const rungGeometry = useMemo(() => new THREE.CylinderGeometry(0.018, 0.018, 1, 6, 1), [])

  const nodeMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: GHOST, roughness: 0.92, metalness: 0 }),
    [],
  )
  const bondMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: BOND, roughness: 0.95, metalness: 0 }),
    [],
  )
  const rungMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.9,
        metalness: 0,
      }),
    [],
  )

  useEffect(() => {
    return () => {
      nodeGeometry.dispose()
      bondGeometry.dispose()
      rungGeometry.dispose()
      nodeMaterial.dispose()
      bondMaterial.dispose()
      rungMaterial.dispose()
    }
  }, [nodeGeometry, bondGeometry, rungGeometry, nodeMaterial, bondMaterial, rungMaterial])

  const nodesRef = useRef<THREE.InstancedMesh | null>(null)
  const bondsRef = useRef<THREE.InstancedMesh | null>(null)
  const rungsRef = useRef<THREE.InstancedMesh | null>(null)

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D()

    const nodes = nodesRef.current
    if (nodes) {
      const points = [...data.first, ...data.second]
      points.forEach((point, index) => {
        dummy.position.copy(point)
        dummy.quaternion.identity()
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        nodes.setMatrixAt(index, dummy.matrix)
      })
      nodes.instanceMatrix.needsUpdate = true
    }

    const bonds = bondsRef.current
    if (bonds) {
      data.bonds.forEach(([a, b], index) => {
        segmentMatrix(dummy, a, b, 1)
        bonds.setMatrixAt(index, dummy.matrix)
      })
      bonds.instanceMatrix.needsUpdate = true
    }

    const rungs = rungsRef.current
    if (rungs) {
      data.rungs.forEach((rung, index) => {
        const marked = marks.has(rung.index)
        segmentMatrix(dummy, rung.a, rung.b, marked ? 2.2 : 1)
        rungs.setMatrixAt(index, dummy.matrix)
        rungs.setColorAt(
          index,
          new THREE.Color(marked ? VERIFIED : BASE_HEX[rung.base] ?? GHOST),
        )
      })
      rungs.instanceMatrix.needsUpdate = true
      if (rungs.instanceColor) rungs.instanceColor.needsUpdate = true
    }
  }, [data, marks])

  return (
    <>
      <instancedMesh
        ref={nodesRef}
        args={[nodeGeometry, nodeMaterial, data.first.length + data.second.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={bondsRef}
        args={[bondGeometry, bondMaterial, data.bonds.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={rungsRef}
        args={[rungGeometry, rungMaterial, data.rungs.length]}
        frustumCulled={false}
      />
    </>
  )
}

interface HelixPanelProps {
  sequence: string
  markPositions?: number[]
  className?: string
}

export function HelixPanel({ sequence, markPositions = [], className }: HelixPanelProps) {
  const [resetKey, setResetKey] = useState(0)
  const visible = sequence.length > 0

  return (
    <figure className={className}>
      <div className="relative h-[280px] w-full border border-rule bg-paper">
        {visible ? (
          <>
            <div aria-hidden="true" className="absolute inset-0">
              <Canvas
                key={resetKey}
                dpr={[1, 2]}
                frameloop="demand"
                gl={{ antialias: true, alpha: false }}
                camera={{ position: [0, 0.9, 12.6], fov: 34, near: 0.1, far: 100 }}
              >
                <color attach="background" args={["#fafaf8"]} />
                <ambientLight intensity={1.9} />
                <directionalLight position={[4, 6, 8]} intensity={1.15} />
                <directionalLight position={[-5, -3, -4]} intensity={0.35} />
                <HelixMesh sequence={sequence} markPositions={markPositions} />
                <OrbitControls
                  autoRotate={false}
                  enableDamping={false}
                  enablePan={false}
                  enableZoom={false}
                  rotateSpeed={0.55}
                  target={[0, 0, 0]}
                />
              </Canvas>
            </div>
            <button
              type="button"
              onClick={() => setResetKey((key) => key + 1)}
              aria-label="Reset view"
              title="Reset view"
              className="absolute top-2 right-2 inline-flex size-6 items-center justify-center border border-rule bg-paper text-ink-muted transition-colors hover:text-ink"
            >
              <RotateCcw size={12} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="label">No sequence in view</p>
          </div>
        )}
      </div>
      <figcaption className="mt-2 max-w-[360px] text-[10.5px] leading-relaxed text-ink-muted">
        Schematic double helix, 24 bp window. Base geometry and secondary structure are not
        modelled.
        <span className="mt-0.5 block">Drag to rotate; reset with the icon.</span>
      </figcaption>
    </figure>
  )
}
