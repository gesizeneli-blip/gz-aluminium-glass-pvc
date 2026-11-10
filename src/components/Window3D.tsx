import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { computeGeometry, isSash } from '../engine/geometry';
import type { Layout, ShapeDef, ShutterDef } from '../types';
import { insetPolygon, isShaped, outline } from '../engine/shapes';

/** Real 3D model generated from actual dimensions, frame/sash depth and glass thickness. */
export function Window3D({
  W, H, layout, params, colorHex, glassThickness, shape, shutter, nets, lowered = 0.3
}: {
  W: number;
  H: number;
  layout: Layout;
  params: Record<string, number>;
  colorHex: string;
  glassThickness: number;
  shape?: ShapeDef;
  shutter?: ShutterDef;
  nets?: Record<string, boolean>;
  /** how far the roller shutter curtain is pulled down, 0..1 */
  lowered?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !(W > 0 && H > 0)) return;
    const s = 1 / 1000;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe5ee);
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.05, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 1.1);
    dl.position.set(2, 3, 4);
    scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dl2.position.set(-3, -1, -3);
    scene.add(dl2);

    const frameMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.55, metalness: 0.15 });
    const sashMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex).multiplyScalar(0.96), roughness: 0.5, metalness: 0.15 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x9fd0ee, transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0, side: THREE.DoubleSide
    });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.8, roughness: 0.3 });

    const g = computeGeometry(W, H, layout, params);
    const fw = params.frameW ?? 60;
    const sw = params.sashW ?? 70;
    const mw = params.mullionW ?? 60;
    const fd = params.frameDepth ?? 70;
    const sd = params.sashDepth ?? Math.max(10, fd - 10);
    const gt = glassThickness > 0 ? Math.min(glassThickness, sd - 4) : 24;
    const group = new THREE.Group();
    const edge = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });

    // x,y measured from top-left; convert to centered coordinates (y up)
    const add = (x: number, y: number, w: number, h: number, d: number, zc: number, mat: THREE.Material) => {
      const geo = new THREE.BoxGeometry(w * s, h * s, d * s);
      const m = new THREE.Mesh(geo, mat);
      m.position.set((x + w / 2 - W / 2) * s, (H / 2 - (y + h / 2)) * s, zc * s);
      group.add(m);
      if (mat !== glassMat) {
        const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge);
        l.position.copy(m.position);
        group.add(l);
      }
    };

    if (isShaped(shape)) {
      const toShape = (pts: { x: number; y: number }[]) =>
        new THREE.Shape(pts.map((p) => new THREE.Vector2((p.x - W / 2) * s, (H / 2 - p.y) * s)));
      const out = outline(W, H, shape);
      const inn = insetPolygon(out, fw);
      const frameShape = toShape(out);
      frameShape.holes.push(new THREE.Path(inn.map((p) => new THREE.Vector2((p.x - W / 2) * s, (H / 2 - p.y) * s))));
      const fgeo = new THREE.ExtrudeGeometry(frameShape, { depth: fd * s, bevelEnabled: false, curveSegments: 1 });
      fgeo.translate(0, 0, (-fd / 2) * s);
      const fm = new THREE.Mesh(fgeo, frameMat);
      group.add(fm);
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(fgeo, 30), edge));
      const ggeo = new THREE.ExtrudeGeometry(toShape(inn), { depth: gt * s, bevelEnabled: false, curveSegments: 1 });
      ggeo.translate(0, 0, (-gt / 2) * s);
      group.add(new THREE.Mesh(ggeo, glassMat));
    } else {
    // outer frame
    add(0, 0, W, fw, fd, 0, frameMat);
    add(0, H - fw, W, fw, fd, 0, frameMat);
    add(0, fw, fw, H - 2 * fw, fd, 0, frameMat);
    add(W - fw, fw, fw, H - 2 * fw, fd, 0, frameMat);
    for (const m of g.mullV) add(m.x, m.y, mw, m.len, fd * 0.9, 0, frameMat);
    for (const m of g.mullH) add(m.x, m.y, m.len, mw, fd * 0.9, 0, frameMat);

    for (const c of g.cells) {
      if (isSash(c.open)) {
        const sdz = sd;
        const zc = (fd - sd) / 2 * 0.6;
        const s2 = Math.min(sw, c.cw / 3, c.ch / 3);
        add(c.x, c.y, c.cw, s2, sdz, zc, sashMat);
        add(c.x, c.y + c.ch - s2, c.cw, s2, sdz, zc, sashMat);
        add(c.x, c.y + s2, s2, c.ch - 2 * s2, sdz, zc, sashMat);
        add(c.x + c.cw - s2, c.y + s2, s2, c.ch - 2 * s2, sdz, zc, sashMat);
        add(c.x + s2 - 4, c.y + s2 - 4, c.cw - 2 * s2 + 8, c.ch - 2 * s2 + 8, gt, zc, glassMat);
        if (c.open !== 'tilt') {
          const left = c.open.endsWith('left');
          const hx = left ? c.x + c.cw - s2 / 2 - 8 : c.x + s2 / 2 - 8;
          add(hx, c.y + c.ch / 2 - 60, 16, 120, 18, zc + sdz / 2 + 14, handleMat);
        }
      } else {
        add(c.x - 6, c.y - 6, c.cw + 12, c.ch + 12, gt, 0, glassMat);
      }
    }
    }
    const extraMats: THREE.Material[] = [];
    if (shutter?.enabled && shutter.boxH > 0) {
      const bh = shutter.boxH;
      const slatMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex).multiplyScalar(0.92), roughness: 0.45, metalness: 0.25 });
      const motorMat = new THREE.MeshStandardMaterial({ color: 0x2f343a, metalness: 0.7, roughness: 0.4 });
      extraMats.push(slatMat, motorMat);
      const boxD = fd + 40;
      add(0, -bh, W, bh, boxD, 0, frameMat);
      // guide rails in front of the window sides
      const railZ = fd / 2 + 14;
      add(0, 0, 36, H, 24, railZ, frameMat);
      add(W - 36, 0, 36, H, 24, railZ, frameMat);
      // curtain (slats) pulled down by `lowered`
      const drop = Math.max(0, Math.min(1, lowered)) * H;
      const slat = 40;
      for (let y = 0; y < drop - 1; y += slat) add(36, y, W - 72, Math.min(slat - 2, drop - y), 8, railZ, slatMat);
      if (shutter.motor) add(W - 90, -bh / 2 - 40, 80, 80, boxD + 30, 0, motorMat);
    }
    if (nets) {
      const netMat = new THREE.MeshBasicMaterial({ color: 0x66707c, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
      extraMats.push(netMat);
      for (const c of g.cells) if (nets[c.key]) add(c.x, c.y, c.cw, c.ch, 2, -fd / 2 - 4, netMat);
    }
    scene.add(group);

    const size = Math.max(W, H) * s;
    camera.position.set(size * 0.9, size * 0.5, size * 1.9);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    const onResize = () => {
      if (!el.clientWidth) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      [frameMat, sashMat, glassMat, handleMat, edge, ...extraMats].forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, [W, H, layout, params, colorHex, glassThickness, shape, shutter, nets, lowered]);

  return <div ref={ref} className="three" />;
}
