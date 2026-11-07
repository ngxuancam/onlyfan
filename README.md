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

- **Fan**: speed (off, 1, 2, 3, or a slider), **swing** (oscillation) on or off, sweep angle, direction
  (the slider follows the swinging head live), head tilt and height. Drag the fan to move it.
- **Exhaust fan**: a boxed extractor you can put behind the car. With the blower in front it pulls the
  air off the tail, wind-tunnel style, as if the car were driving.
- **Obstacles**: car, house (walls with windows, a door, an interior partition and a gable roof),
  tree and shrub (porous foliage that bleeds speed instead of blocking it), and a paper-tag rig. Drag
  them in the scene or rotate them from the panel.
- **Scenarios**: playground, wind tunnel, cross ventilation, tree & shrub shelter.
- **Layers**
  - *Smoke gun*: puffs from a nozzle rake in front of the guard, advected through the field (true
    streaklines) and spreading as they age.
  - *Wind load on objects*: the static pressure of the air touching each surface. Red is where the
    wind hits, blue is suction (lee side, roof). Surface flow streaks run along the near-wall velocity.
  - *Streamlines*: speed-coloured, CFD-post-processor style, seeded on the blade disc.
  - *Ground wind-speed map*, and *x-ray* walls and roof to see the flow inside the house.
- **2D mode**: a plan-view slice through the same 3D solution at a height you choose. Dense flow
  streaks, the true cross-section of every body, and the pressure force on each one split into
  drag **D** (along the oncoming wind) and side force **S**.

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

Next.js 16 (App Router) · React 19 · three.js 0.187 · @react-three/fiber 9 · drei 10 · zustand ·
Vercel Speed Insights.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start
```

## License

[Apache-2.0](LICENSE) © Nguyen Xuan Cam
