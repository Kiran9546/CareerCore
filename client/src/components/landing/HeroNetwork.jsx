import { useEffect, useRef } from "react";
import Icon from "../ui/Icon";

/**
 * The landing hero's real-time 3D layer: how a placement season connects,
 * rendered with WebGL behind the drive card.
 *
 * Six hubs (students, skills, career paths, drives, rounds, offers) rest
 * exactly where the static map's labels sit, each at its own depth, with a
 * few small nodes around it standing for individual records. On load the
 * network turns into place and the pipeline from students to offers draws
 * itself in; after that it holds still and only turns a little towards the
 * mouse, which shows the depth as parallax.
 *
 * Deliberately small: plain WebGL with one shader, about sixty points and
 * a hundred line segments, positions projected on the CPU. No 3D library.
 *
 * Frames are drawn only while something is moving (the intro, or easing after
 * a pointer move); otherwise nothing runs. Rendering pauses while the hero
 * is off screen, and the GL context is released on unmount.
 *
 * Loaded lazily by the landing page, only where WebGL works, motion is
 * allowed and the device is not low-powered; everywhere else the static map
 * in Landing.jsx stays. Calls onReady after the first frame and onFail if
 * WebGL is lost, so the page can swap between the two.
 */

// Colours per hub, from the app palette; depth (z) per hub gives parallax.
const STYLE = {
  students: { color: [14, 165, 233], z: 0.35 },
  skills: { color: [16, 185, 129], z: -0.25 },
  paths: { color: [245, 158, 11], z: -0.45 },
  drives: { color: [79, 70, 229], z: 0.2 },
  rounds: { color: [100, 116, 139], z: -0.15 },
  offers: { color: [5, 150, 105], z: 0.45 },
};
const DIST = 3.1;
const K = 0.86;
const SATELLITES = 7;

/** Deterministic pseudo-random numbers, so the layout is the same every visit. */
const rng = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** Small record nodes around each hub, as offsets from it. */
const buildSatellites = (count) => {
  const rand = rng(20261116);
  const sats = [];
  for (let hi = 0; hi < count; hi++) {
    for (let k = 0; k < SATELLITES; k++) {
      const r = 0.1 + rand() * 0.13;
      const u = rand() * Math.PI * 2;
      const v = (rand() - 0.5) * Math.PI;
      sats.push({
        hub: hi,
        o: [Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r, Math.sin(u) * Math.cos(v) * r],
        size: 3.2 + rand() * 2.2,
      });
    }
  }
  return sats;
};

/**
 * World positions for the hubs such that, seen straight on, each projects to
 * its label position in the static map (percentages of the scene).
 */
const placeHubs = (nodes, aspect) =>
  nodes.map((n) => {
    const st = STYLE[n.id];
    const s = DIST / (DIST + st.z);
    const X = n.x / 50 - 1;
    const Y = 1 - n.y / 50;
    return { ...n, color: st.color, p: [X / (K * s), Y / (K * s * aspect), st.z] };
  });

const VERT = `
attribute vec2 a_pos;
attribute vec4 a_color;
attribute float a_size;
varying vec4 v_color;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`;
const FRAG = `
precision mediump float;
uniform float u_points;
varying vec4 v_color;
void main() {
  float a = v_color.a;
  if (u_points > 0.5) {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    a *= smoothstep(0.5, 0.36, d);
  }
  gl_FragColor = vec4(v_color.rgb, a);
}`;

const compile = (gl, type, src) => {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
};

const easeOut = (k) => 1 - (1 - k) ** 3;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export default function HeroNetwork({ nodes, links, onReady, onFail }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const labels = useRef([]);

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    const area = box?.closest("section");
    if (!el || !box) return undefined;

    const gl = el.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) {
      onFail?.();
      return undefined;
    }

    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    } catch {
      onFail?.();
      return undefined;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const STRIDE = 7 * 4; // x, y, r, g, b, a, size
    const aPos = gl.getAttribLocation(prog, "a_pos");
    const aColor = gl.getAttribLocation(prog, "a_color");
    const aSize = gl.getAttribLocation(prog, "a_size");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, STRIDE, 8);
    gl.enableVertexAttribArray(aSize);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, STRIDE, 24);
    const uPoints = gl.getUniformLocation(prog, "u_points");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const sats = buildSatellites(nodes.length);
    const index = Object.fromEntries(nodes.map((n, i) => [n.id, i]));
    const pipeline = links.map(([a, b]) => [index[a], index[b]]);
    let hubs = placeHubs(nodes, 1);
    const data = new Float32Array((pipeline.length * 2 + sats.length * 2 + nodes.length + sats.length) * 7);

    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;
    let running = false;
    let visible = true;
    let ready = false;
    let introStart = 0;
    // Current and target view angles (yaw, pitch).
    const view = { yaw: -0.55, pitch: 0.12, tYaw: 0, tPitch: 0 };

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, box.clientWidth);
      height = Math.max(1, box.clientHeight);
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      gl.viewport(0, 0, el.width, el.height);
      hubs = placeHubs(nodes, width / height);
    };

    // Rotate by yaw and pitch, then perspective-project into clip space.
    const project = (p) => {
      const cy = Math.cos(view.yaw);
      const sy = Math.sin(view.yaw);
      const cp = Math.cos(view.pitch);
      const sp = Math.sin(view.pitch);
      const x1 = p[0] * cy - p[2] * sy;
      const z1 = p[0] * sy + p[2] * cy;
      const y2 = p[1] * cp - z1 * sp;
      const z2 = p[1] * sp + z1 * cp;
      const s = DIST / (DIST + z2);
      return { x: x1 * s * K, y: y2 * s * K * (width / height), depth: clamp01((1 - z2) / 2), s };
    };

    let n = 0;
    const put = (x, y, c, a, size) => {
      const o = n * 7;
      data[o] = x;
      data[o + 1] = y;
      data[o + 2] = c[0] / 255;
      data[o + 3] = c[1] / 255;
      data[o + 4] = c[2] / 255;
      data[o + 5] = a;
      data[o + 6] = size;
      n++;
    };

    const draw = (now) => {
      const t = introStart ? (now - introStart) / 1000 : 99;
      const appear = easeOut(clamp01(t / 1.4));
      // Ease the view towards its target (intro turn, then the pointer).
      view.yaw += (view.tYaw - view.yaw) * 0.08;
      view.pitch += (view.tPitch - view.pitch) * 0.08;

      const hubP = hubs.map((h) => project(h.p));
      const satP = sats.map((s) => {
        const h = hubs[s.hub].p;
        return project([h[0] + s.o[0], h[1] + s.o[1], h[2] + s.o[2]]);
      });
      const line = [148, 163, 184];
      n = 0;
      // Record links: each hub to its own nodes.
      sats.forEach((s, i) => {
        const a = hubP[s.hub];
        const b = satP[i];
        const alpha = 0.32 * appear * (0.35 + 0.65 * Math.min(a.depth, b.depth));
        put(a.x, a.y, line, alpha, 1);
        put(b.x, b.y, line, alpha, 1);
      });
      // The season's pipeline, drawn in one link after another.
      pipeline.forEach(([i, j], k) => {
        const a = hubP[i];
        const b = hubP[j];
        const p = easeOut(clamp01((t - 0.5 - k * 0.32) / 0.7));
        const c = hubs[j].color;
        put(a.x, a.y, c, 0.7 * p * (0.4 + 0.6 * Math.min(a.depth, b.depth)), 1);
        put(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, c, 0.7 * p * (0.4 + 0.6 * Math.min(a.depth, b.depth)), 1);
      });
      const lineCount = n;
      sats.forEach((s, i) => {
        const q = satP[i];
        put(q.x, q.y, hubs[s.hub].color, appear * (0.35 + 0.5 * q.depth), s.size * q.s * dpr);
      });
      hubs.forEach((h, i) => {
        const q = hubP[i];
        put(q.x, q.y, h.color, appear * (0.6 + 0.4 * q.depth), 9 * q.s * dpr);
      });

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * 7), gl.DYNAMIC_DRAW);
      gl.uniform1f(uPoints, 0);
      gl.drawArrays(gl.LINES, 0, lineCount);
      gl.uniform1f(uPoints, 1);
      gl.drawArrays(gl.POINTS, lineCount, n - lineCount);

      // Hub labels follow their hubs, dimming as they turn away.
      hubP.forEach((q, i) => {
        const lab = labels.current[i];
        if (!lab) return;
        const px = ((q.x + 1) / 2) * width;
        const py = ((1 - q.y) / 2) * height;
        lab.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%)`;
        lab.style.opacity = (appear * (0.7 + 0.3 * q.depth)).toFixed(2);
      });

      if (!ready) {
        ready = true;
        onReady?.();
      }
      const settling = t < 3.4 || Math.abs(view.tYaw - view.yaw) > 0.0008 || Math.abs(view.tPitch - view.pitch) > 0.0008;
      if (settling && visible) {
        frame = requestAnimationFrame(draw);
      } else {
        running = false;
      }
    };
    const kick = () => {
      if (running || !visible || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(draw);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      kick();
    });
    ro.observe(box);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !introStart) introStart = performance.now();
      if (visible) kick();
    });
    io.observe(box);

    const onMove = (e) => {
      if (e.pointerType !== "mouse" || !area) return;
      const r = area.getBoundingClientRect();
      view.tYaw = ((e.clientX - r.left) / r.width - 0.5) * 0.45;
      view.tPitch = ((e.clientY - r.top) / r.height - 0.5) * 0.2;
      kick();
    };
    const onLeave = () => {
      view.tYaw = 0;
      view.tPitch = 0;
      kick();
    };
    const lost = (e) => {
      e.preventDefault();
      cancelAnimationFrame(frame);
      onFail?.();
    };
    el.addEventListener("webglcontextlost", lost);
    area?.addEventListener("pointermove", onMove);
    area?.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("webglcontextlost", lost);
      area?.removeEventListener("pointermove", onMove);
      area?.removeEventListener("pointerleave", onLeave);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // onReady/onFail are stable callbacks from the page; the scene is built once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrap} className="absolute inset-0">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      {nodes.map((h, i) => (
        <span
          key={h.id}
          ref={(n) => {
            labels.current[i] = n;
          }}
          className="absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-(--cc-shadow-rest) ring-1 ring-slate-200"
          style={{ opacity: 0, willChange: "transform, opacity" }}
        >
          <Icon name={h.icon} className="h-3.5 w-3.5 text-indigo-600" />
          {h.label}
        </span>
      ))}
    </div>
  );
}
