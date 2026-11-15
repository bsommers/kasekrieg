// KÄSEKRIEG ray tracer — GLSL ES 3.00 sources (ARCHITECTURE §9). Owned by render-core.
//
// One full-screen fragment shader traces the whole frame: a 2D DDA through the cell grid (X east, Y up, Z south)
// with walls, floors/ceilings, door slabs, moving pushwalls and sprite billboards, then shades the hit at the
// centre of its texel (texel-locked), fires shadow rays at the per-cell light list, and follows one reflection
// bounce. Rules that keep it portable (ANGLE/D3D, Metal, SwiftShader):
//   - only texelFetch (no implicit-derivative sampling), so loops never have to be unrolled;
//   - all loops have small constant bounds and break early;
//   - integer data lives in RGBA32UI textures, float data in an RGBA32F texture (both NEAREST, texelFetch).
//
// Data layout (written by renderer.js `createPacker`):
//   uMap   RGBA32UI 64×64, one texel per cell
//          R: wallTex (bits 0-15) | floorTex (16-31)
//          G: ceilTex (0-15, 0xFFFF = sky) | kind (16-17: 0 open, 1 solid, 2 door) | door vertical (18) | door open 0..4095 (19-30)
//          B: sprite count (0-4) | light count (8-12)
//          A: solid-neighbour mask (0-7: N,E,S,W,NE,SE,SW,NW) | moon may reach (8) | open sky (9)
//   uLists RGBA32UI 128×64: texel (2cx, cy) = 16 sprite indices (one byte each), texel (2cx+1, cy) = 16 light indices
//   uData  RGBA32F 128×4: row 0 sprite (x, h, z, size) · row 1 sprite (layer, flipX, glow, alpha)
//                         row 2 light (x, h, z, radius) · row 3 light (r, g, b, 0)

export const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const f = (v) => { const s = String(+v); return s.includes('.') || s.includes('e') ? s : s + '.0'; };

/** Fragment source for one quality preset: { lights, reflLights, reflMinGloss, steps, shadowSteps, reflSteps }. */
export function traceFrag(q) {
  return `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
precision highp sampler2DArray;

#define MAX_LIGHTS ${q.lights | 0}
#define REFL_LIGHTS ${q.reflLights | 0}
#define REFL_MIN_GLOSS ${f(q.reflMinGloss)}
#define MAX_STEPS ${q.steps | 0}
#define REFL_STEPS ${q.reflSteps | 0}
#define SHADOW_STEPS ${q.shadowSteps | 0}

#define K_VOID 0
#define K_SKY 1
#define K_TILE 2
#define K_SPRITE 3

const float INF = 1e20;
const float DOOR_HALF = 0.03125;      // door slab half thickness (2 texels)
const float EMIT_GAIN = 3.2;          // emissive texel → HDR
const float GLOW_GAIN = 1.5;          // sprite.glow → HDR
const float FILL = 0.07;             // unshadowed bounce-light stand-in
const float AO_R = 0.30;
const float AO_K = 0.50;

uniform vec2 uRes;
uniform vec3 uCamPos, uCamF, uCamR, uCamU;
uniform vec2 uCamFwd2;
uniform float uTime, uPixAngle;
uniform ivec2 uMapSize;
uniform usampler2D uMap, uLists;
uniform sampler2D uData;
uniform sampler2DArray uTileAlb, uTileMat, uSprAlb, uSprMat;
uniform vec3 uAmbient, uSkyAmb;
uniform vec4 uFog;
uniform vec3 uMoonDir, uMoonCol;
uniform vec4 uMoonShow;               // xyz: direction the moon disc is drawn at, w: angular radius (0 = no sky art)
uniform int uMoverCount;
uniform vec4 uMoverBox[4];
uniform int uMoverTex[4];
uniform int uBeamCount;
uniform vec4 uBeamA[4], uBeamB[4], uBeamC[4];
uniform int uJambTex;
uniform vec4 uOpt;                    // x reflections 0..1, y shadows 0/1, z ambient occlusion 0..1, w glints 0..2
uniform vec4 uOpt2;                   // x texel lock 0/1, y lod bias, z specular 0..2, w unused
uniform int uDebug;

out vec4 fragColor;

struct Hit {
  float t;
  int kind;
  int layer;
  vec2 uv;
  vec3 n;
  vec3 dpdu, dpdv;                    // world delta per unit of u / v
  ivec2 cell;                         // open cell whose light list shades this point
  int sprite;                         // sprite index, -1 otherwise
  float glow;
  int ao;                             // 0 none, 1 floor/ceiling, 2 wall, 3 thin slab (door/pushwall)
};

float nz(float v) { return abs(v) < 1e-6 ? (v < 0.0 ? -1e-6 : 1e-6) : v; }
uint hashu(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float h01(uint x) { return float(hashu(x) >> 8) * (1.0 / 16777216.0); }
int listIdx(uvec4 l, int k) { return int((l[k >> 2] >> uint((k & 3) * 8)) & 255u); }

float bayer4(vec2 fc) {
  ivec2 p = ivec2(fc) & 3;
  int i = p.x + p.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}

// Ray vs axis-aligned box in the XZ plane (full height). Returns entry t (origin outside) or INF.
float boxHit(vec2 o, vec2 inv, vec2 bmin, vec2 bmax, out int axis) {
  vec2 t0 = (bmin - o) * inv, t1 = (bmax - o) * inv;
  vec2 tn = min(t0, t1), tf = max(t0, t1);
  float tN = max(tn.x, tn.y), tF = min(tf.x, tf.y);
  axis = tn.x > tn.y ? 0 : 1;
  return (tN <= tF && tN > 1e-4) ? tN : INF;
}

// Tangent frame of a vertical face so that textures read left-to-right for whoever looks at the face.
void faceFrame(int axis, vec2 d, out vec3 n, out vec3 dpdu, out bool flip) {
  if (axis == 0) {
    if (d.x > 0.0) { n = vec3(-1.0, 0.0, 0.0); dpdu = vec3(0.0, 0.0, 1.0); flip = false; }
    else { n = vec3(1.0, 0.0, 0.0); dpdu = vec3(0.0, 0.0, -1.0); flip = true; }
  } else {
    if (d.y > 0.0) { n = vec3(0.0, 0.0, -1.0); dpdu = vec3(-1.0, 0.0, 0.0); flip = true; }
    else { n = vec3(0.0, 0.0, 1.0); dpdu = vec3(1.0, 0.0, 0.0); flip = false; }
  }
}

void doorBox(ivec2 c, uvec4 m, out vec2 bmin, out vec2 bmax, out float open) {
  open = float((m.g >> 19) & 4095u) * (1.0 / 4095.0);
  vec2 cf = vec2(c);
  if ((m.g & 0x40000u) != 0u) { bmin = cf + vec2(0.5 - DOOR_HALF, open); bmax = cf + vec2(0.5 + DOOR_HALF, 1.0); }
  else { bmin = cf + vec2(open, 0.5 - DOOR_HALF); bmax = cf + vec2(1.0, 0.5 + DOOR_HALF); }
}

// ───────────────────────────── closest hit ─────────────────────────────
// bn: unit normal (XZ) of the sprite billboards for this ray — the camera forward for primary rays, the ray's own
// horizontal direction for secondary rays. thr: alpha threshold (ordered dither for soft sprites).
Hit trace(vec3 ro, vec3 rd, vec2 bn, int skipSprite, float thr, int maxSteps) {
  Hit h;
  h.t = INF; h.kind = K_VOID; h.layer = 0; h.uv = vec2(0.0); h.n = vec3(0.0, 1.0, 0.0);
  h.dpdu = vec3(1.0, 0.0, 0.0); h.dpdv = vec3(0.0, 0.0, 1.0); h.cell = ivec2(0); h.sprite = -1; h.glow = 0.0; h.ao = 0;

  vec2 d = vec2(nz(rd.x), nz(rd.z));
  vec2 inv = 1.0 / d;
  vec2 o = ro.xz;
  ivec2 c = ivec2(floor(o));
  ivec2 stp = ivec2(d.x < 0.0 ? -1 : 1, d.y < 0.0 ? -1 : 1);
  vec2 tDelta = abs(inv);
  vec2 tSide = (vec2(c) + vec2(max(stp, ivec2(0))) - o) * inv;
  float tPlane = rd.y > 1e-5 ? (1.0 - ro.y) / rd.y : (rd.y < -1e-5 ? -ro.y / rd.y : INF);
  float bden = nz(dot(d, bn));
  vec2 rgt = vec2(-bn.y, bn.x);

  float tMov = INF; int movAxis = 0; int movIdx = 0;
  for (int i = 0; i < 4; i++) {
    if (i >= uMoverCount) break;
    int ax;
    float t = boxHit(o, inv, uMoverBox[i].xy, uMoverBox[i].zw, ax);
    if (t < tMov) { tMov = t; movAxis = ax; movIdx = i; }
  }

  float tEnter = 0.0;
  int side = 0;
  uint prevKind = 0u;
  for (int i = 0; i < maxSteps; i++) {
    if (c.x < 0 || c.y < 0 || c.x >= uMapSize.x || c.y >= uMapSize.y) break;
    uvec4 m = texelFetch(uMap, c, 0);
    uint kind = (m.g >> 16) & 3u;

    if (kind == 1u) {                                   // solid cell: its face was hit at tEnter
      if (i == 0) break;                                // camera inside a wall → void
      vec3 p = ro + rd * tEnter;
      bool flip;
      faceFrame(side, d, h.n, h.dpdu, flip);
      float along = clamp(side == 0 ? p.z - float(c.y) : p.x - float(c.x), 0.0, 0.99999);
      h.t = tEnter; h.kind = K_TILE;
      h.layer = prevKind == 2u ? uJambTex : int(m.r & 0xFFFFu);
      h.uv = vec2(flip ? 1.0 - along : along, clamp(1.0 - p.y, 0.0, 0.99999));
      h.dpdv = vec3(0.0, -1.0, 0.0);
      h.cell = side == 0 ? ivec2(c.x - stp.x, c.y) : ivec2(c.x, c.y - stp.y);
      h.ao = 2;
      return h;
    }

    float tExit = min(tSide.x, tSide.y);
    float tBest = tPlane;
    int best = 1;                                       // 1 floor/ceiling, 2 pushwall, 3 door, 4 sprite
    if (tMov < tBest) { tBest = tMov; best = 2; }

    int doorAxis = 0; vec2 dmin = vec2(0.0); float dopen = 0.0;
    if (kind == 2u) {
      vec2 dmax;
      doorBox(c, m, dmin, dmax, dopen);
      if (dopen < 0.995) {
        int ax;
        float t = boxHit(o, inv, dmin, dmax, ax);
        if (t < tBest) { tBest = t; best = 3; doorAxis = ax; }
      }
    }

    int ns = int(m.b & 31u);
    int hsIdx = -1; vec2 hsUv = vec2(0.0); vec4 hs0 = vec4(0.0); vec4 hs1 = vec4(0.0);
    if (ns > 0) {
      uvec4 sl = texelFetch(uLists, ivec2(c.x * 2, c.y), 0);
      for (int k = 0; k < 16; k++) {
        if (k >= ns) break;
        int si = listIdx(sl, k);
        if (si == skipSprite) continue;
        vec4 s0 = texelFetch(uData, ivec2(si, 0), 0);
        float t = dot(s0.xz - o, bn) / bden;
        if (t <= 0.02 || t >= tBest || t < tEnter - 1e-3 || t > tExit + 1e-3) continue;
        vec3 p = ro + rd * t;
        float su = dot(p.xz - s0.xz, rgt) / s0.w + 0.5;
        float sv = 1.0 - (p.y - s0.y) / s0.w;
        if (su < 0.0 || su >= 1.0 || sv < 0.0 || sv >= 1.0) continue;
        vec4 s1 = texelFetch(uData, ivec2(si, 1), 0);
        if (s1.y > 0.5) su = 0.99999 - su;
        float a = texelFetch(uSprAlb, ivec3(ivec2(vec2(su, sv) * 64.0), int(s1.x)), 0).a;
        if (a * s1.w <= thr) continue;
        tBest = t; best = 4; hsIdx = si; hsUv = vec2(su, sv); hs0 = s0; hs1 = s1;
      }
    }

    if (tBest <= tExit) {
      vec3 p = ro + rd * tBest;
      h.t = tBest; h.cell = c;
      if (best == 1) {
        bool up = rd.y > 0.0;
        uint tex = up ? (m.g & 0xFFFFu) : (m.r >> 16);
        if (up && tex == 0xFFFFu) { h.kind = K_SKY; return h; }
        h.kind = K_TILE; h.layer = int(tex);
        h.uv = clamp(p.xz - vec2(c), 0.0, 0.99999);
        h.n = vec3(0.0, up ? -1.0 : 1.0, 0.0);
        h.ao = 1;
      } else if (best == 2) {
        bool flip;
        faceFrame(movAxis, d, h.n, h.dpdu, flip);
        vec4 bx = uMoverBox[movIdx];
        float along = clamp(movAxis == 0 ? p.z - bx.y : p.x - bx.x, 0.0, 0.99999);
        h.kind = K_TILE; h.layer = uMoverTex[movIdx];
        h.uv = vec2(flip ? 0.99999 - along : along, clamp(1.0 - p.y, 0.0, 0.99999));
        h.dpdv = vec3(0.0, -1.0, 0.0);
        h.ao = 3;
      } else if (best == 3) {
        bool flip;
        faceFrame(doorAxis, d, h.n, h.dpdu, flip);
        bool vert = (m.g & 0x40000u) != 0u;
        bool face = vert ? doorAxis == 0 : doorAxis == 1;       // big face (true) or the slab's leading edge
        float along;
        if (face) {
          along = vert ? p.z - dmin.y : p.x - dmin.x;           // slab-local: the texture rides with the slab
          h.layer = int(m.r & 0xFFFFu);
        } else {
          along = vert ? p.x - float(c.x) : p.z - float(c.y);
          h.layer = uJambTex;
        }
        along = clamp(along, 0.0, 0.99999);
        h.kind = K_TILE;
        h.uv = vec2(flip ? 0.99999 - along : along, clamp(1.0 - p.y, 0.0, 0.99999));
        h.dpdv = vec3(0.0, -1.0, 0.0);
        h.ao = 3;
      } else {
        float fl = hs1.y > 0.5 ? -1.0 : 1.0;
        h.kind = K_SPRITE; h.sprite = hsIdx; h.layer = int(hs1.x); h.uv = hsUv;
        h.dpdu = vec3(rgt.x, 0.0, rgt.y) * (hs0.w * fl);
        h.dpdv = vec3(0.0, -hs0.w, 0.0);
        h.n = vec3(-bn.x, 0.0, -bn.y);
        h.glow = hs1.z;
      }
      return h;
    }

    prevKind = kind;
    if (tSide.x < tSide.y) { c.x += stp.x; tEnter = tSide.x; tSide.x += tDelta.x; side = 0; }
    else { c.y += stp.y; tEnter = tSide.y; tSide.y += tDelta.y; side = 1; }
  }
  return h;
}

// ───────────────────────────── any hit (shadows) ─────────────────────────────
// 1 = light arrives, 0 = blocked by a wall, door, pushwall or an opaque sprite texel.
// toSky: the ray runs up to the ceiling plane (tMax) and must leave through an open-sky cell (moonlight).
float shadow(vec3 ro, vec3 rd, float tMax, int skipSprite, bool toSky) {
  vec2 d = vec2(nz(rd.x), nz(rd.z));
  vec2 inv = 1.0 / d;
  vec2 o = ro.xz;
  for (int i = 0; i < 4; i++) {
    if (i >= uMoverCount) break;
    int ax;
    if (boxHit(o, inv, uMoverBox[i].xy, uMoverBox[i].zw, ax) < tMax) return 0.0;
  }
  ivec2 c = ivec2(floor(o));
  ivec2 stp = ivec2(d.x < 0.0 ? -1 : 1, d.y < 0.0 ? -1 : 1);
  vec2 tDelta = abs(inv);
  vec2 tSide = (vec2(c) + vec2(max(stp, ivec2(0))) - o) * inv;
  float dl = length(rd.xz);
  bool sprOk = dl > 1e-3;
  vec2 bn = rd.xz / max(dl, 1e-4);
  vec2 rgt = vec2(-bn.y, bn.x);
  float tSprMax = toSky ? tMax : tMax - 0.3;            // a sprite hugging the light must not swallow it
  float tEnter = 0.0;
  for (int i = 0; i < SHADOW_STEPS; i++) {
    if (c.x < 0 || c.y < 0 || c.x >= uMapSize.x || c.y >= uMapSize.y) return 0.0;
    uvec4 m = texelFetch(uMap, c, 0);
    uint kind = (m.g >> 16) & 3u;
    if (kind == 1u) return 0.0;
    float tExit = min(tSide.x, tSide.y);
    float tEnd = min(tExit, tMax);
    if (kind == 2u) {
      vec2 bmin, bmax; float open; int ax;
      doorBox(c, m, bmin, bmax, open);
      if (open < 0.995 && boxHit(o, inv, bmin, bmax, ax) <= tEnd) return 0.0;
    }
    int ns = int(m.b & 31u);
    if (ns > 0 && sprOk) {
      uvec4 sl = texelFetch(uLists, ivec2(c.x * 2, c.y), 0);
      for (int k = 0; k < 16; k++) {
        if (k >= ns) break;
        int si = listIdx(sl, k);
        if (si == skipSprite) continue;
        vec4 s0 = texelFetch(uData, ivec2(si, 0), 0);
        float t = dot(s0.xz - o, bn) / dl;
        if (t <= 0.03 || t < tEnter - 1e-3 || t > tEnd + 1e-3 || t >= tSprMax) continue;
        float su = dot(o - s0.xz, rgt) / s0.w + 0.5;
        float sv = 1.0 - (ro.y + rd.y * t - s0.y) / s0.w;
        if (su < 0.0 || su >= 1.0 || sv < 0.0 || sv >= 1.0) continue;
        vec4 s1 = texelFetch(uData, ivec2(si, 1), 0);
        if (s1.z > 0.5 || s1.w < 0.5) continue;         // glowing / fading effects cast no shadow
        if (s1.y > 0.5) su = 0.99999 - su;
        ivec3 tc = ivec3(ivec2(vec2(su, sv) * 64.0), int(s1.x));
        if (texelFetch(uSprAlb, tc, 0).a > 0.5 && texelFetch(uSprMat, tc, 0).r < 0.5) return 0.0;
      }
    }
    if (tExit >= tMax) {
      if (toSky) return (m.g & 0xFFFFu) == 0xFFFFu ? 1.0 : 0.0;
      return 1.0;
    }
    if (tSide.x < tSide.y) { c.x += stp.x; tEnter = tSide.x; tSide.x += tDelta.x; }
    else { c.y += stp.y; tEnter = tSide.y; tSide.y += tDelta.y; }
  }
  return toSky ? 0.0 : 1.0;
}

// ───────────────────────────── sky ─────────────────────────────
vec3 skyColor(vec3 rd) {
  float el = asin(clamp(rd.y, -1.0, 1.0));
  float az = atan(rd.z, rd.x);
  vec3 tint = uMoonShow.w > 0.0 ? normalize(uMoonCol + vec3(0.25)) * 1.7 : vec3(0.75, 0.85, 1.25);
  float g = clamp(el / 1.0, 0.0, 1.0);
  vec3 col = mix(vec3(0.040, 0.050, 0.075), vec3(0.006, 0.008, 0.016), sqrt(g)) * tint;

  // chunky twinkling stars on an angular grid
  ivec2 sc = ivec2(floor(vec2(az, el) * 150.0));
  uint hs = hashu(uint(sc.x + 4096) * 7919u + uint(sc.y + 4096) * 104729u);
  float r0 = float(hs & 0xFFFFu) * (1.0 / 65535.0);
  if (r0 < 0.010) {
    float r1 = float((hs >> 16) & 0xFFu) * (1.0 / 255.0);
    float tw = 0.6 + 0.4 * sin(uTime * (1.5 + 5.0 * r1) + r1 * 50.0);
    col += mix(vec3(0.65, 0.8, 1.0), vec3(1.0, 0.85, 0.6), fract(r1 * 7.0)) * (0.2 + 3.6 * r1 * r1 * r1 * r1) * tw;
  }

  // the moon: a wheel of cheese, drawn low enough to be seen over the battlements
  if (uMoonShow.w > 0.0) {
    vec3 md = uMoonShow.xyz;
    vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), md));
    vec3 e2 = cross(md, e1);
    vec2 q = vec2(dot(rd, e1), dot(rd, e2));
    q = (floor(q * 170.0) + 0.5) / 170.0;
    float r = length(q) / uMoonShow.w;
    if (dot(rd, md) > 0.0) {
      if (r < 1.0) {
        vec2 u = q / uMoonShow.w;
        float hole = 1.0;
        hole = min(hole, length(u - vec2(-0.38, 0.30)) / 0.24);
        hole = min(hole, length(u - vec2(0.30, -0.22)) / 0.30);
        hole = min(hole, length(u - vec2(0.12, 0.55)) / 0.13);
        hole = min(hole, length(u - vec2(-0.22, -0.52)) / 0.16);
        hole = min(hole, length(u - vec2(0.60, 0.28)) / 0.11);
        vec3 cheese = vec3(1.0, 0.86, 0.42) * (1.75 - 0.5 * r * r + 0.25 * u.y - 0.2 * u.x);
        col = hole < 1.0 ? vec3(0.55, 0.38, 0.12) * (hole < 0.75 ? 1.0 : 1.5) : cheese;
      } else {
        col += (uMoonCol * 0.22 + vec3(0.05, 0.045, 0.02)) * exp(-(r - 1.0) * 1.6);
      }
    }
  }

  // distant battlements of the Schloss on the horizon
  float seg = floor(az * 30.0);
  float hh = h01(uint(int(seg) + 512) * 2654435761u);
  float tower = hh > 0.72 ? 0.085 + 0.06 * hh : 0.03 + 0.035 * hh;
  float cren = fract(az * 30.0 * 4.0) < 0.5 ? 0.008 : 0.0;
  if (el < tower + cren) {
    col = vec3(0.007, 0.009, 0.016) * tint;
    ivec2 wc = ivec2(floor(vec2(az * 120.0, el * 110.0)));
    uint wh = hashu(uint(wc.x + 4096) * 31337u + uint(wc.y + 64) * 7717u);
    if (hh > 0.72 && el > 0.03 && el < tower - 0.012 && (wh & 15u) == 0u) col = vec3(1.5, 0.95, 0.3) * (0.5 + 0.5 * float((wh >> 8) & 3u) / 3.0);
  }
  return col;
}

// ───────────────────────────── shading ─────────────────────────────
float aoTerm(float dd) { float x = clamp(1.0 - dd / AO_R, 0.0, 1.0); return x * x; }

// Shade a hit at the centre of its texel. Outputs the snapped position P, shading normal N, albedo A and
// material M (emissive, gloss, sparkle).
vec3 shade(Hit h, vec3 ro, vec3 rd, float dist, int maxL, out vec3 P, out vec3 N, out vec3 A, out vec3 M) {
  bool spr = h.kind == K_SPRITE;
  vec4 alb, mt;
  vec2 tuv;
  ivec2 tx;
  if (spr) {
    tx = clamp(ivec2(h.uv * 64.0), ivec2(0), ivec2(63));
    alb = texelFetch(uSprAlb, ivec3(tx, h.layer), 0);
    mt = texelFetch(uSprMat, ivec3(tx, h.layer), 0);
    tuv = (vec2(tx) + 0.5) / 64.0;
  } else {
    int lod = int(clamp(log2(max(dist * uPixAngle * 64.0, 1.0)) + uOpt2.y, 0.0, 4.0));
    int n = 64 >> lod;
    tx = clamp(ivec2(h.uv * float(n)), ivec2(0), ivec2(n - 1));
    alb = texelFetch(uTileAlb, ivec3(tx, h.layer), lod);
    mt = texelFetch(uTileMat, ivec3(tx, h.layer), lod);
    tuv = (vec2(tx) + 0.5) / float(n);
    tx *= (1 << lod);
  }
  A = alb.rgb;
  M = mt.rgb;
  vec2 duv = (tuv - h.uv) * uOpt2.x;
  P = ro + rd * h.t + h.dpdu * duv.x + h.dpdv * duv.y;
  N = h.n;
  if (spr) {                                            // fake a rounded body so side lights model the sprite
    vec3 r3 = vec3(h.n.z, 0.0, -h.n.x);
    float lat = (tuv.x - 0.5) * 2.0 * (dot(h.dpdu, r3) < 0.0 ? -1.0 : 1.0);
    N = normalize(r3 * (lat * 0.8) + h.n * sqrt(max(1.0 - lat * lat * 0.64, 0.05)) + vec3(0.0, 0.18, 0.0));
  }
  vec3 V = normalize(ro - P);
  vec3 Po = spr ? P : P + h.n * 0.004;

  uvec4 cm = texelFetch(uMap, h.cell, 0);
  bool skyCeil = (cm.g & 0xFFFFu) == 0xFFFFu;

  // analytic ambient occlusion from the solid-neighbour mask (creases along walls, floors and corners)
  float lit = 1.0;
  if (h.ao == 1) {
    vec2 fc = P.xz - vec2(h.cell);
    uint nb = cm.a;
    if ((nb & 1u) != 0u) lit *= 1.0 - aoTerm(fc.y);
    if ((nb & 2u) != 0u) lit *= 1.0 - aoTerm(1.0 - fc.x);
    if ((nb & 4u) != 0u) lit *= 1.0 - aoTerm(1.0 - fc.y);
    if ((nb & 8u) != 0u) lit *= 1.0 - aoTerm(fc.x);
    if ((nb & 19u) == 16u) lit *= 1.0 - aoTerm(length(vec2(1.0 - fc.x, fc.y)));
    if ((nb & 38u) == 32u) lit *= 1.0 - aoTerm(length(vec2(1.0 - fc.x, 1.0 - fc.y)));
    if ((nb & 76u) == 64u) lit *= 1.0 - aoTerm(length(vec2(fc.x, 1.0 - fc.y)));
    if ((nb & 137u) == 128u) lit *= 1.0 - aoTerm(length(vec2(fc.x, fc.y)));
  } else if (h.ao >= 2) {
    lit *= 1.0 - aoTerm(P.y);
    if (!skyCeil) lit *= 1.0 - aoTerm(1.0 - P.y);
    if (h.ao == 2) {
      uint nb = cm.a;
      if (abs(h.n.x) > 0.5) {
        float a = P.z - float(h.cell.y);
        if ((nb & 1u) != 0u) lit *= 1.0 - aoTerm(a);
        if ((nb & 4u) != 0u) lit *= 1.0 - aoTerm(1.0 - a);
      } else {
        float a = P.x - float(h.cell.x);
        if ((nb & 8u) != 0u) lit *= 1.0 - aoTerm(a);
        if ((nb & 2u) != 0u) lit *= 1.0 - aoTerm(1.0 - a);
      }
    }
  }
  float ao = 1.0 - AO_K * uOpt.z * (1.0 - lit);

  vec3 E = uAmbient;                                    // diffuse irradiance
  vec3 S = vec3(0.0);                                   // specular
  float shin = mix(10.0, 180.0, mt.g);
  float specK = mt.g * (0.35 + 1.4 * mt.g) * uOpt2.z;

  if (skyCeil) E += uSkyAmb;
  if ((cm.a & 256u) != 0u) {                            // moonlight can reach this cell
    float ndl = spr ? max((dot(N, uMoonDir) + 0.4) / 1.4, 0.0) : max(dot(N, uMoonDir), 0.0);
    if (ndl > 0.0) {
      float vis = uOpt.y > 0.5 ? shadow(Po, uMoonDir, (1.0 - Po.y) / uMoonDir.y, h.sprite, true) : (skyCeil ? 1.0 : 0.0);
      if (vis > 0.0) {
        E += uMoonCol * ndl;
        S += uMoonCol * pow(max(dot(N, normalize(uMoonDir + V)), 0.0), shin) * specK;
      }
    }
  }

  int nl = min(int((cm.b >> 8) & 31u), maxL);
  if (nl > 0) {
    uvec4 ll = texelFetch(uLists, ivec2(h.cell.x * 2 + 1, h.cell.y), 0);
    for (int k = 0; k < 16; k++) {
      if (k >= nl) break;
      int li = listIdx(ll, k);
      vec4 l0 = texelFetch(uData, ivec2(li, 2), 0);
      vec3 L = l0.xyz - P;
      float d2 = dot(L, L);
      float x = d2 / (l0.w * l0.w);
      if (x >= 1.0) continue;
      vec3 lc = texelFetch(uData, ivec2(li, 3), 0).rgb;
      float att = (1.0 - x) * (1.0 - x) / (1.0 + 5.0 * x);
      E += lc * (att * FILL);
      float ld = sqrt(d2);
      L /= max(ld, 1e-4);
      float ndl = spr ? max((dot(N, L) + 0.4) / 1.4, 0.0) : dot(N, L);
      if (ndl <= 0.0 || ndl * att * max(lc.r, max(lc.g, lc.b)) < 0.004) continue;
      if (uOpt.y > 0.5 && shadow(Po, L, ld, h.sprite, false) < 0.5) continue;
      E += lc * (ndl * att);
      S += lc * (pow(max(dot(N, normalize(L + V)), 0.0), shin) * specK * att);
    }
  }

  if (uDebug == 3) A = vec3(0.6);
  vec3 col = A * E * ao + S * ao;
  col += A * (mt.r * EMIT_GAIN + h.glow * GLOW_GAIN);

  // glints: a few texels per sparkly surface flash as the eye or the clock moves
  if (mt.b > 0.02 && uOpt.w > 0.0) {
    uint id = uint(tx.x) + 64u * uint(tx.y) + 4096u * uint(h.layer)
            + 0x9E3779B9u * uint(spr ? 7919 + h.sprite : h.cell.x + 131 * h.cell.y + (h.n.x > 0.5 ? 17 : 0) + (h.n.z > 0.5 ? 29 : 0));
    uint hsh = hashu(id);
    float r1 = float(hsh & 0xFFFFu) * (1.0 / 65535.0);
    float dens = mt.b * 0.16;
    if (r1 < dens) {
      float r2 = float(hsh >> 16) * (1.0 / 65535.0);
      float ph = r2 * 6.2832 + uTime * (1.2 + 3.5 * fract(r2 * 9.0)) + dot(V, vec3(41.0, 23.0, 37.0)) * (0.6 + r1 / dens);
      float gl = pow(max(sin(ph), 0.0), 30.0);
      vec3 hue = A / max(max(A.r, max(A.g, A.b)), 0.05);
      col += (E * 26.0 + vec3(0.05)) * mix(vec3(1.0), hue, 0.4) * (gl * uOpt.w);
    }
  }
  return col;
}

// ───────────────────────────── beams ─────────────────────────────
vec3 beamGlow(vec3 ro, vec3 rd, float tMax) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (i >= uBeamCount) break;
    vec3 a = uBeamA[i].xyz, ab = uBeamB[i].xyz - uBeamA[i].xyz;
    float w = max(uBeamA[i].w, 0.004);
    vec3 ao = ro - a;
    float B = dot(rd, ab), C = max(dot(ab, ab), 1e-6), D = dot(rd, ao), E = dot(ab, ao);
    float den = C - B * B;
    float s = den > 1e-6 ? clamp((E - B * D) / den, 0.0, 1.0) : 0.0;
    float t = clamp(B * s - D, 0.0, tMax);
    s = clamp((B * t + E) / C, 0.0, 1.0);
    vec3 dv = (ro + rd * t) - (a + ab * s);
    float d2 = dot(dv, dv) / (w * w);
    float shimmer = 0.85 + 0.15 * sin(s * sqrt(C) * 30.0 - uTime * 40.0);
    // kept just under the post-fx star threshold: a beam should glow, not grow streaks along its whole length
    acc += min(uBeamC[i].rgb * ((1.6 * exp(-d2) + 0.3 * exp(-d2 * 0.06)) * shimmer) + vec3(0.9) * exp(-d2 * 6.0), vec3(2.2));
  }
  return acc;
}

void main() {
  vec2 ndc = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamF + uCamR * ndc.x + uCamU * ndc.y);
  float thr = 0.08 + 0.84 * bayer4(gl_FragCoord.xy);

  Hit h = trace(ro, rd, uCamFwd2, -1, thr, MAX_STEPS);
  vec3 col;
  float tHit = h.t;
  if (h.kind == K_SKY) {
    col = skyColor(rd);
  } else if (h.kind == K_VOID) {
    col = uFog.rgb;
    tHit = 64.0;
  } else {
    vec3 P, N, A, M;
    col = shade(h, ro, rd, h.t, MAX_LIGHTS, P, N, A, M);
    if (uDebug == 1) col = A;
    else if (uDebug == 2) col = N * 0.5 + 0.5;

    float gloss = M.g;
    if (uDebug == 0 && h.kind == K_TILE && gloss >= REFL_MIN_GLOSS && uOpt.x > 0.0) {
      vec3 Vd = uOpt2.x > 0.5 ? normalize(P - ro) : rd;
      float ndv = clamp(dot(N, -Vd), 0.0, 1.0);
      float f0 = gloss * gloss;
      float fr = (f0 + (gloss - f0) * pow(1.0 - ndv, 4.0)) * uOpt.x;
      if (fr > 0.015) {
        vec3 R = reflect(Vd, N);
        float rl = length(R.xz);
        Hit h2 = trace(P + N * 0.004, R, rl > 1e-4 ? R.xz / rl : vec2(1.0, 0.0), -1, 0.5, REFL_STEPS);
        vec3 c2;
        if (h2.kind == K_SKY) c2 = skyColor(R);
        else if (h2.kind == K_VOID) c2 = uFog.rgb;
        else {
          vec3 P2, N2, A2, M2;
          c2 = shade(h2, P + N * 0.004, R, h.t + h2.t, REFL_LIGHTS, P2, N2, A2, M2);
          c2 = mix(uFog.rgb, c2, exp(-uFog.a * h2.t));
        }
        float mx = max(A.r, max(A.g, A.b));
        vec3 tintc = mix(vec3(1.0), A / max(mx, 0.05), 0.65 * clamp(mx * 4.0, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, gloss)));
        col = col * (1.0 - fr) + c2 * tintc * fr;
      }
    }
    col = mix(uFog.rgb, col, exp(-uFog.a * h.t));
  }
  if (uBeamCount > 0) col += beamGlow(ro, rd, tHit);
  fragColor = vec4(clamp(col, 0.0, 64.0), 1.0);
}`;
}

// Fallback presenter used only when postfx.js is unavailable: filmic tonemap + sRGB, nearest-neighbour upscale.
export const BLIT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uSceneSize, uOutSize;
uniform float uExposure;
uniform vec4 uFlash;
out vec4 o;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  ivec2 t = clamp(ivec2(gl_FragCoord.xy / uOutSize * uSceneSize), ivec2(0), ivec2(uSceneSize) - 1);
  vec3 c = aces(max(texelFetch(uScene, t, 0).rgb, 0.0) * uExposure);
  c = mix(c, uFlash.rgb, clamp(uFlash.a, 0.0, 1.0));
  o = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;
