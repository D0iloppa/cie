// 앰비언트 오브 — WebGL 파티클. CC0 canine(.glb) 표면을 점샘플링한 '강아지' 점구름.
//  · GLTFLoader + MeshSurfaceSampler 로 모델 표면에서 N개 점 추출 → 중심정렬/스케일
//  · GLSL 셰이더: simplex curl-noise 미세 변위(형상 유지) / thinking 시 scatter
//  · 마우스를 z=0 평면에 투영 → 오브젝트 공간 좌표로 입자 3D 반발(wake) + 시차 틸트
//  · 모델 로드 실패 시 구체로 폴백. 모델 교체(말티즈 .glb)는 MODEL_URL 만 바꾸면 됨.
import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

// 진짜 말티즈 .glb 가 있으면 경로를 넣으면 그걸 머리 샘플링. 비우면 절차적 말티즈 머리.
const MODEL_URL = '';
const N = 16000;
const TONE = { idle: '#30b8ff', thinking: '#9fb0cc', first: '#30b8ff', yes: '#2fbf71', no: '#e25555' };

const SNOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 snoiseVec3(vec3 x){return vec3(snoise(x),snoise(x+71.3),snoise(x-43.7));}
vec3 curlNoise(vec3 p){
  const float e=0.1; vec3 dx=vec3(e,0,0),dy=vec3(0,e,0),dz=vec3(0,0,e);
  vec3 px0=snoiseVec3(p-dx),px1=snoiseVec3(p+dx);
  vec3 py0=snoiseVec3(p-dy),py1=snoiseVec3(p+dy);
  vec3 pz0=snoiseVec3(p-dz),pz1=snoiseVec3(p+dz);
  float x=py1.z-py0.z-pz1.y+pz0.y; float y=pz1.x-pz0.x-px1.z+px0.z; float z=px1.y-px0.y-py1.x+py0.x;
  return normalize(vec3(x,y,z)/(2.0*e));
}`;

const VERT = /* glsl */`
uniform float uTime; uniform float uScatter; uniform vec3 uMouse; uniform float uSize; uniform float uPixelRatio;
attribute float aSeed; varying float vGlow;
${SNOISE}
void main(){
  vec3 p = position;
  float amp = mix(0.02, 0.45, uScatter);              // idle 엔 미세(형상 유지), thinking 엔 scatter
  p += curlNoise(p*1.1 + uTime*0.1 + aSeed) * amp;
  vec3 dm = p - uMouse; float dist = length(dm);
  float push = smoothstep(0.7, 0.0, dist) * 0.4;
  p += normalize(dm + 1e-4) * push;
  vGlow = 0.45 + 0.55*sin(uTime*1.6 + aSeed*6.283) + push*2.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float sz = uSize * (0.55 + 0.75*fract(aSeed)) * (1.0 + push*1.6);
  gl_PointSize = sz * uPixelRatio / max(-mv.z, 0.001);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
precision mediump float; uniform vec3 uColor; varying float vGlow;
void main(){
  vec2 uv = gl_PointCoord - 0.5; float r = length(uv);
  if (r > 0.5) discard;
  float a = pow(smoothstep(0.5, 0.0, r), 1.6);
  vec3 col = uColor * (0.55 + 0.85 * clamp(vGlow, 0.0, 1.6));
  gl_FragColor = vec4(col, a * clamp(0.45 + 0.55*vGlow, 0.0, 1.0));
}`;

function makeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uScatter: { value: 0 },
      uMouse: { value: new THREE.Vector3(99, 99, 99) },
      uColor: { value: new THREE.Color(TONE.idle) },
      uSize: { value: 24 },
      uPixelRatio: { value: Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, 2) },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
}

// positions(Float32Array) → 중심정렬 + 반경 ~1.25 로 스케일 → THREE.Points
function buildPoints(positions) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 3) box.expandByPoint(v.set(positions[i], positions[i + 1], positions[i + 2]));
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const scale = 2.5 / Math.max(size.x, size.y, size.z);
  const seeds = new Float32Array(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - center.x) * scale;
    positions[i + 1] = (positions[i + 1] - center.y) * scale;
    positions[i + 2] = (positions[i + 2] - center.z) * scale;
    seeds[i / 3] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return new THREE.Points(geo, makeMaterial());
}

function sampleSphere() {
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const t = i / N, phi = Math.acos(1 - 2 * t), th = Math.PI * (1 + Math.sqrt(5)) * i;
    pos[i * 3] = Math.sin(phi) * Math.cos(th); pos[i * 3 + 1] = Math.sin(phi) * Math.sin(th); pos[i * 3 + 2] = Math.cos(phi);
  }
  return buildPoints(pos);
}

// 단위 구 표면 방향
function rndDir() {
  let x, y, z, d;
  do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; d = x * x + y * y + z * z; } while (d > 1 || d === 0);
  d = Math.sqrt(d); return [x / d, y / d, z / d];
}

// 절차적 말티즈 머리 점구름 — 둥근 복슬 머리 + 드롭 귀 + 짧은 주둥이 + 탑낫. +Z = 정면.
function sampleMalteseHead() {
  const parts = [
    { n: 0.42, c: [0, 0.05, 0], s: [1.0, 1.04, 0.96], fluff: 0.16 },     // 머리(복슬)
    { n: 0.12, c: [0, -0.40, 0.84], s: [0.46, 0.40, 0.46], fluff: 0.05 }, // 주둥이(짧음)
    { n: 0.14, c: [-0.86, -0.30, 0.02], s: [0.34, 0.78, 0.46], fluff: 0.14 }, // 왼쪽 드롭 귀
    { n: 0.14, c: [0.86, -0.30, 0.02], s: [0.34, 0.78, 0.46], fluff: 0.14 },  // 오른쪽 드롭 귀
    { n: 0.10, c: [0, 1.02, 0.04], s: [0.40, 0.40, 0.40], fluff: 0.18 },  // 탑낫(정수리 털뭉치)
    { n: 0.08, c: [0, -0.10, 0.06], s: [1.04, 0.88, 1.0], fluff: 0.22 },  // 볼 주변 fluff(바깥 셸)
  ];
  const pos = new Float32Array(N * 3);
  let k = 0;
  for (const p of parts) {
    const cnt = Math.round(N * p.n);
    for (let i = 0; i < cnt && k < N; i++, k++) {
      const [dx, dy, dz] = rndDir();
      const f = 1 + Math.random() * p.fluff;
      pos[k * 3] = p.c[0] + dx * p.s[0] * f;
      pos[k * 3 + 1] = p.c[1] + dy * p.s[1] * f;
      pos[k * 3 + 2] = p.c[2] + dz * p.s[2] * f;
    }
  }
  while (k < N) { const [dx, dy, dz] = rndDir(); pos[k * 3] = dx; pos[k * 3 + 1] = dy * 1.04; pos[k * 3 + 2] = dz * 0.96; k++; }
  return buildPoints(pos);
}

function Cloud({ tone }) {
  const { camera } = useThree();
  const [obj, setObj] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!MODEL_URL) { setObj(sampleMalteseHead()); return () => { alive = false; }; }
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        if (!alive) return;
        gltf.scene.updateMatrixWorld(true);
        let mesh = null;
        gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
        if (!mesh) { setObj(sampleSphere()); return; }
        const sampler = new MeshSurfaceSampler(mesh).build();
        const mw = mesh.matrixWorld;          // 샘플점을 월드공간으로(본 좌표와 정렬)
        const Z_CUT = 18;                     // 머리/주둥이/귀만 (목 아래·몸통·꼬리 제외)
        const pos = new Float32Array(N * 3);
        const v = new THREE.Vector3();
        let k = 0, guard = 0;
        while (k < N && guard < N * 60) {
          sampler.sample(v); v.applyMatrix4(mw); guard++;
          if (v.z > Z_CUT) { pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z; k++; }
        }
        while (k < N) { sampler.sample(v); v.applyMatrix4(mw); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z; k++; }
        setObj(buildPoints(pos)); // 머리 점들이 중심정렬+스케일되어 화면을 채움(+Z=얼굴이 카메라 향함)
      },
      undefined,
      () => { if (alive) setObj(sampleSphere()); }
    );
    return () => { alive = false; };
  }, []);

  const aux = useRef({
    color: new THREE.Color(TONE.idle),
    plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    ray: new THREE.Raycaster(),
    hit: new THREE.Vector3(),
  }).current;

  useFrame((st, dt) => {
    if (!obj) return;
    const u = obj.material.uniforms;
    u.uTime.value += dt;
    u.uColor.value.lerp(aux.color.set(TONE[tone] || TONE.idle), 0.05);
    const targetScatter = tone === 'thinking' ? 1 : 0;
    u.uScatter.value += (targetScatter - u.uScatter.value) * 0.06;

    obj.rotation.y += dt * 0.18;
    obj.rotation.x += (st.pointer.y * 0.35 - obj.rotation.x) * 0.04;

    aux.ray.setFromCamera(st.pointer, camera);
    if (aux.ray.ray.intersectPlane(aux.plane, aux.hit)) {
      obj.worldToLocal(aux.hit);
      u.uMouse.value.lerp(aux.hit, 0.18);
    }
  });

  return obj ? <primitive object={obj} /> : null;
}

export default function Orb({ tone = 'idle', label }) {
  const dpr = useRef([1, 2]);
  return (
    <div className={`orb-wrap tone-${tone}`}>
      <Canvas className="orb-canvas" camera={{ position: [0, 0, 4], fov: 45 }} dpr={dpr.current} gl={{ alpha: true, antialias: true }}>
        <Cloud tone={tone} />
      </Canvas>
      {label && <div className="orb-label">{label}</div>}
    </div>
  );
}
