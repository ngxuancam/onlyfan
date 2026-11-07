<div align="center">

# OnlyFan — 3D wind lab

**A stand fan, a live 3D fluid solver, and the air around a car, a house and a tree.**<br/>
[onlyfan.nguyenxuancam.com](https://onlyfan.nguyenxuancam.com)

</div>

OnlyFan is a browser wind simulator. The airflow is computed, not animated: an oscillating stand fan
pushes momentum into a real 3D incompressible-flow solver, the obstacles are voxelised into the
same grid, and every visual (smoke, streamlines, surface load, plan view, swinging tags, forces) reads
from that one velocity / pressure field.

## What you can do

The UI is laid out like a 3D editor: a scene **outliner** on the left (eye icons switch
sources and bodies on and off), an **inspector** on the right for whatever is selected (or
scene settings when nothing is), a toolbar on top and a perspective / orthographic switch
with an axis gizmo at the bottom.

- **Wind sources**
  - *Stand fan*: speed (off, 1, 2, 3 or a slider), **swing** on or off, sweep, a live
    direction read-out that follows the swinging head, tilt and height, plus a smoke rake.
  - *Industrial blower*: a motor-driven drum fan on a cart, a wider and stronger jet that you can tilt.
  - *Exhaust fan*: a boxed extractor that pulls air off the tail of the car, wind-tunnel style.
  - *Smoke machine*: a fog nozzle you can place anywhere, with output, jet and height controls.
- **Bodies**: car, house (windows, a door, an interior partition and a gable roof), tree, shrub
  and a paper-tag rig. Drag them in the viewport. The tree **sheds leaves** that fall, get carried
  by the solver's wind, settle on the floor, roofs or the car, and get picked up again by strong gusts.
- **Scenarios**: playground, wind tunnel (blower, exhaust fan and smoke at the nose of the car),
  cross ventilation, and tree & shrub shelter.
- **Visualisation**
  - *Wind load on objects*: the static pressure of the air touching each surface, laid over
    real PBR materials. It shows only where the load is significant: red where the wind hits,
    blue where it sucks (lee side, roof). Surface flow streaks follow the near-wall velocity.
  - *Smoke*: puffs advected through the field (true streaklines). They collide with the exact
    body shapes, so they slide over the car instead of passing through it.
  - *Streamlines*, a ground wind-speed map, and x-ray walls and roof.
- **2D mode**: a plan-view slice at a height you choose, with dense flow streaks, true cross-sections
  and the pressure force on each body split into drag **D** and side force **S**.
- **Stages**: a dark automotive photo *studio* (cyclorama, overhead softboxes, polished concrete)
  or a vehicle aero & safety *test hall*.
- **Solver controls**: pause, resetting to still air, and orthographic or perspective cameras.

## Rendering

The car is lofted from cross-sections (clearcoat paint, glass, rubber tyres and five-spoke
rims). Materials are `MeshPhysicalMaterial` with the wind-load map injected through
`onBeforeCompile`. A soft shadow map comes from the key light, and foliage is made of
instanced leaf cards. On desktop a post-processing pass adds the AgX tone curve, bloom,
a vignette and SMAA; phones skip it.

## How the simulation works

`src/sim/solver.ts` is a collocated-grid *stable fluids* solver (Stam 1999), run in a Web Worker:

1. **Fan forcing**: a thin momentum disc in front of the blades (annular jet profile and swirl).
   The exhaust fan is a second disc.
2. **Advection**: semi-Lagrangian, trilinear back-trace.
3. **Porous drag** for foliage, plus a tiny global damping.
4. **Vorticity confinement** to restore eddies the coarse grid smears out.
5. **Projection**: red-black SOR Poisson solve with solid (Neumann) obstacles, a solid ground,
   and open sides and top.

The grid is 80×24×40 cells of 0.3 m on desktop, or 60×18×30 of 0.4 m on phones (override with
`?q=high` or `?q=low`). The worker packs speed, smoothed pressure, foliage drag, solid mask and
velocity direction into two RGBA8 3D textures that the shaders sample. The main thread gets the
velocity field to advect smoke and tags, and the per-object pressure forces (F = −∮ p n dA).

It is a teaching-grade approximation: no turbulence model, a coarse grid and an under-resolved
stagnation pressure. Treat colours as relative, not as engineering data.

## Stack

Next.js 16 (App Router) · React 19 · three.js 0.187 · @react-three/fiber 9 · drei 10 ·
@react-three/postprocessing · zustand ·
Vercel Speed Insights.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start
```

## License

[Apache-2.0](LICENSE) © Nguyen Xuan Cam
