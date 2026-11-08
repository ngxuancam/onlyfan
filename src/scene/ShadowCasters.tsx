"use client";
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/**
 * Turns on shadow casting for every opaque mesh in the scene, about once a second, so
 * objects added later (toggled sources, presets) are covered without wiring each one.
 * Point clouds, lines and transparent overlays are left alone.
 */
export function ShadowCasters() {
  const last = useRef(-1);
  useFrame(({ scene, clock }) => {
    const t = clock.elapsedTime;
    if (t - last.current < 1) return;
    last.current = t;
    const visit = (o: THREE.Object3D) => {
      // whole subtrees can opt out (stage dressing, ceiling fixtures)
      if (o.userData.noShadow) return;
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = m.material as THREE.Material;
        if (mat && !mat.transparent && !(mat as THREE.ShaderMaterial).isShaderMaterial && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      }
      for (const c of o.children) visit(c);
    };
    visit(scene);
  });
  return null;
}

/** Re-renders the shadow map only every `every` frames (it is the costliest pass after smoke). */
export function ShadowThrottle({ every }: { every: number }) {
  const n = useRef(0);
  useFrame(({ gl }) => {
    gl.shadowMap.autoUpdate = false;
    if (n.current++ % every === 0) gl.shadowMap.needsUpdate = true;
  });
  return null;
}
