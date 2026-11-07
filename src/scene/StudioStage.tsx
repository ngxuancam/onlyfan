"use client";
import { useMemo } from "react";
import * as THREE from "three";

/**
 * Automotive photo studio: a dark graded cyclorama (sky dome with a soft horizon glow)
 * and two big overhead softboxes, which also show up as long highlights in the paint.
 */
export function StudioStage() {
  const dome = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color("#0b0c0f") },
          uHorizon: { value: new THREE.Color("#2a2e35") },
          uBottom: { value: new THREE.Color("#121418") },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          uniform vec3 uBottom;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.75, h), 0.7)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.2, h));
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  return (
    <group userData={{ noShadow: true }}>
      <mesh material={dome} position={[5, 0, 0]} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[95, 48, 24]} />
      </mesh>
      {/* overhead softboxes */}
      {[-2.6, 2.6].map((z) => (
        <group key={z} position={[4, 8.6, z]}>
          <mesh rotation-x={Math.PI / 2}>
            <planeGeometry args={[16, 2.2]} />
            <meshBasicMaterial color="#f2f6ff" toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position-y={0.06}>
            <boxGeometry args={[16.3, 0.1, 2.5]} />
            <meshStandardMaterial color="#0e0f12" metalness={0.6} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
