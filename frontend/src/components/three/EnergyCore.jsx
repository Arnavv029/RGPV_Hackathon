import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sparkles, Torus } from '@react-three/drei';
import { useRef } from 'react';

/**
 * The landing-page hero: a pulsing "energy core" wrapped in three tilted
 * charging rings, drifting sparks, and a pointer-reactive camera sway.
 * Loaded lazily (see Landing.jsx) so three.js never blocks first paint.
 */

function Core() {
  const mesh = useRef();
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    mesh.current.rotation.y = t * 0.25;
    mesh.current.rotation.x = Math.sin(t * 0.3) * 0.2;
    const s = 1 + Math.sin(t * 2.2) * 0.035; // heartbeat
    mesh.current.scale.setScalar(s);
  });
  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.15, 12]} />
      <MeshDistortMaterial
        color="#f5ad3f"
        emissive="#e5941c"
        emissiveIntensity={0.55}
        roughness={0.15}
        metalness={0.65}
        distort={0.38}
        speed={2.2}
      />
    </mesh>
  );
}

function Ring({ radius, tilt, speed, color, thickness = 0.012 }) {
  const ref = useRef();
  useFrame((_, delta) => {
    ref.current.rotation.z += delta * speed;
  });
  return (
    <group rotation={tilt}>
      <Torus ref={ref} args={[radius, thickness, 16, 180]}>
        <meshBasicMaterial color={color} transparent opacity={0.75} toneMapped={false} />
      </Torus>
    </group>
  );
}

function Rig({ children }) {
  const group = useRef();
  useFrame(({ pointer }) => {
    // Ease toward the pointer so the scene tilts subtly with the cursor
    group.current.rotation.y += (pointer.x * 0.35 - group.current.rotation.y) * 0.04;
    group.current.rotation.x += (-pointer.y * 0.25 - group.current.rotation.x) * 0.04;
  });
  return <group ref={group}>{children}</group>;
}

export default function EnergyCore({ className = '' }) {
  return (
    <div className={className}>
      <Canvas camera={{ position: [0, 0, 5.2], fov: 45 }} dpr={[1, 1.8]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.35} />
        <pointLight position={[4, 3, 4]} intensity={40} color="#ffe2b0" />
        <pointLight position={[-4, -2, 2]} intensity={25} color="#bd7510" />
        <Rig>
          <Float speed={1.6} rotationIntensity={0.4} floatIntensity={0.9}>
            <Core />
            <Ring radius={1.75} tilt={[Math.PI / 2.3, 0, 0]} speed={0.6} color="#fcc97b" />
            <Ring radius={2.05} tilt={[Math.PI / 1.7, Math.PI / 6, 0]} speed={-0.4} color="#f5ad3f" />
            <Ring radius={2.4} tilt={[Math.PI / 2, -Math.PI / 5, 0]} speed={0.25} color="#e5941c" thickness={0.006} />
          </Float>
          <Sparkles count={70} scale={[6, 4, 4]} size={2.4} speed={0.5} color="#ffe2b0" />
        </Rig>
      </Canvas>
    </div>
  );
}
