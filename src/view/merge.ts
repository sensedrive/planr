import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bakes the direct child meshes of `group` into one mesh per material (and attribute layout).
 * Nested groups – animated parts like control surfaces or levers – are left untouched.
 * Saves draw calls in the main and the shadow pass.
 */
export function mergeChildMeshes(group: THREE.Object3D): void {
  group.updateMatrix();
  const buckets = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[] }>();
  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || Array.isArray(child.material) || child.userData.keep) continue;
    const geo = child.geometry as THREE.BufferGeometry;
    const layout = Object.keys(geo.attributes).sort().join(',');
    const key = `${child.material.uuid}|${layout}|${child.renderOrder}`;
    const b = buckets.get(key) ?? { material: child.material as THREE.Material, meshes: [] as THREE.Mesh[] };
    b.meshes.push(child);
    buckets.set(key, b);
  }
  for (const { material, meshes } of buckets.values()) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      m.updateMatrix();
      const g = (m.geometry as THREE.BufferGeometry).clone().applyMatrix4(m.matrix);
      return g.index ? g.toNonIndexed() : g;
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.renderOrder = meshes[0].renderOrder;
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
    for (const m of meshes) group.remove(m);
    group.add(mesh);
  }
}
