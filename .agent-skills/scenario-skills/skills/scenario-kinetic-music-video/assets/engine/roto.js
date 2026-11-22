// Keyed footage materials for clips shot on a black void, placed as planes inside 3D worlds.
// Default = original footage with a soft luma key. Stylized redraws (LED dots, edge linework, ASCII, scanline halftone,
// posterized cel fill) exist behind {stylized:true} and are only for directors who ask for them.
// Usage:
//   const v = await E.loadVideo('dance_hook1');           // in load()
//   const mat = makeRotoMaterial(E, { dots: 1, edges: 0.8 }); // in load()
//   await v.frame(localT); mat.uniforms.tVideo.value = v.tex; // in prepare()/render()
//   mesh = new THREE.Mesh(new THREE.PlaneGeometry((v.meta.w / v.meta.h) * h, h), mat)  -> the clip's own aspect; place in any 3D scene, or use E.drawRotoFullscreen(E, mat, {scale, x, y}).
import * as THREE from "three";

let _glyphTex = null;
function glyphAtlas() {
  if (_glyphTex) return _glyphTex;
  const chars = " .·:-=+*#%@01AGI<>/\\|{}[]$&"; // ordered roughly by ink density for the first 11
  const cell = 64,
    c = document.createElement("canvas");
  c.width = cell * chars.length;
  c.height = cell;
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#fff";
  g.font = `700 ${cell * 0.86}px "JetBrains Mono"`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  [...chars].forEach((ch, i) =>
    g.fillText(ch, i * cell + cell / 2, cell / 2 + 2),
  );
  _glyphTex = new THREE.CanvasTexture(c);
  _glyphTex.minFilter = THREE.LinearFilter;
  _glyphTex.userData.n = chars.length;
  return _glyphTex;
}

// FOOTAGE MODE (default): the clip is shown as the ORIGINAL video, not redrawn; a soft luma key drops a black set.
// Every roto material renders keyed original footage unless created with { stylized: true }.
// Keying: black void -> transparent via a soft luma key (premultiplied), so text/geometry behind still reads.
export const FOOTAGE_DEFAULT = true;
export function makeRotoMaterial(E, o = {}) {
  const footage = o.stylized ? 0 : (o.footage ?? (FOOTAGE_DEFAULT ? 1 : 0));
  const u = {
    uFootage: { value: footage },
    uFootGain: { value: o.footGain ?? 1.22 },
    uKeyLo: { value: o.keyLo ?? 0.012 },
    uKeyHi: { value: o.keyHi ?? 0.07 },
    tVideo: { value: null },
    uVidRes: { value: new THREE.Vector2(1280, 720) },
    uDots: { value: o.dots ?? 0 },
    uEdges: { value: o.edges ?? 0 },
    uFill: { value: o.fill ?? 0 },
    uAscii: { value: o.ascii ?? 0 },
    uScan: { value: o.scan ?? 0 },
    uRaw: { value: o.raw ?? 0 },
    uGrid: { value: o.grid ?? 140 }, // dots/ascii columns across the plane
    uDotGain: { value: o.dotGain ?? 1.0 },
    uEdgeGain: { value: o.edgeGain ?? 1.2 },
    uEdgeThresh: { value: o.edgeThresh ?? 0.08 },
    uLumLo: { value: o.lumLo ?? 0.04 },
    uLumHi: { value: o.lumHi ?? 0.75 }, // luminance window mapped to 0..1 (black bg drops out)
    uColA: { value: new THREE.Color(o.colA ?? "#FF3D00") },
    uColB: { value: new THREE.Color(o.colB ?? "#FFB000") },
    uColC: { value: new THREE.Color(o.colC ?? "#FFF6E6") },
    uIntensity: { value: o.intensity ?? 1.0 }, // HDR multiplier -> drives bloom
    uTime: { value: 0 },
    uGlyph: { value: glyphAtlas() },
    uGlyphN: { value: glyphAtlas().userData.n },
    uReveal: { value: 1 },
    uRevealDir: { value: new THREE.Vector2(0, 1) }, // wipe-in 0..1 along dir
    uCrop: { value: new THREE.Vector4(0, 0, 1, 1) }, // uv sub-rect of the video (x,y,w,h)
    uOpacity: { value: 1 },
    uDissolve: { value: 0 },
    uMirror: { value: 0 },
  };
  return new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...(footage
      ? {
          blending: THREE.CustomBlending,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
          blendSrcAlpha: THREE.OneFactor,
          blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        }
      : { blending: THREE.AdditiveBlending }),
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tVideo, uGlyph; uniform vec2 uVidRes, uRevealDir; uniform vec4 uCrop;
      uniform float uFootage,uFootGain,uKeyLo,uKeyHi,uDots,uEdges,uFill,uAscii,uScan,uRaw,uGrid,uDotGain,uEdgeGain,uEdgeThresh,uLumLo,uLumHi,uIntensity,uTime,uGlyphN,uReveal,uOpacity,uDissolve,uMirror;
      uniform vec3 uColA,uColB,uColC; varying vec2 vUv;
      float h21(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*45758.5453); }
      vec2 vuv(vec2 uv){ if(uMirror>0.5) uv.x=1.-uv.x; return uCrop.xy + uv*uCrop.zw; }
      float lumAt(vec2 uv){ vec3 c=texture2D(tVideo, vuv(uv)).rgb; return dot(c,vec3(0.299,0.587,0.114)); }
      float L(vec2 uv){ return smoothstep(uLumLo,uLumHi,lumAt(uv)); }
      float R(vec2 uv){ return lumAt(uv); }
      vec3 ramp(float x){ return x<0.5? mix(uColA,uColB,x*2.): mix(uColB,uColC,(x-.5)*2.); }
      void main(){
        vec2 uv=vUv; float asp = (uVidRes.x*uCrop.z)/(uVidRes.y*uCrop.w);
        if(uFootage>0.5){
          vec3 c = texture2D(tVideo, vuv(uv)).rgb * uFootGain;
          float k = smoothstep(uKeyLo, uKeyHi, max(max(c.r,c.g),c.b));
          float along=dot(uv-0.5,normalize(uRevealDir))+0.5; float rv=1.-smoothstep(uReveal-0.03,uReveal,along);
          float m = rv*uOpacity; if(uDissolve>0.){ float n=h21(floor(uv*vec2(uGrid,uGrid/asp))); m*=step(uDissolve,n); }
          // soft edge vignette on the plane so rectangular footage never shows a hard border
          vec2 e = min(uv, 1.-uv); m *= smoothstep(0.0, 0.035, min(e.x, e.y*asp));
          gl_FragColor = vec4(c*m, k*m); return;
        }
        vec3 col=vec3(0.); float a=0.;
        // --- LED dots
        if(uDots>0.){
          vec2 grid=vec2(uGrid, uGrid/asp); vec2 cell=floor(uv*grid); vec2 f=fract(uv*grid)-0.5;
          float l=L((cell+0.5)/grid)*uDotGain; float r=0.5*sqrt(clamp(l,0.,1.2));
          float d=length(f); float dot=smoothstep(r,r-0.12,d);
          float ghost=smoothstep(0.16,0.10,d)*0.035;
          col+= (ramp(clamp(l*0.92,0.,1.))*dot*(0.35+0.65*l) + uColA*ghost)*uDots; a+=dot*uDots;
        }
        // --- edge linework (Sobel)
        if(uEdges>0.){
          vec2 px = 1.0/(uVidRes*uCrop.zw)*1.2;
          float tl=R(uv+px*vec2(-1,1)),t=R(uv+px*vec2(0,1)),tr=R(uv+px*vec2(1,1)),l=R(uv+px*vec2(-1,0)),r=R(uv+px*vec2(1,0)),bl=R(uv+px*vec2(-1,-1)),b=R(uv+px*vec2(0,-1)),br=R(uv+px*vec2(1,-1));
          float gx=-tl-2.*l-bl+tr+2.*r+br, gy=-bl-2.*b-br+tl+2.*t+tr; float g=length(vec2(gx,gy));
          float e=smoothstep(uEdgeThresh, uEdgeThresh*2.5, g)*uEdgeGain;
          col+= mix(uColA,uColB,clamp(e,0.,1.))*e*uEdges + uColC*max(0.,e-1.)*0.6*uEdges; a+=e*uEdges;
        }
        // --- posterized amber fill (cel)
        if(uFill>0.){ float l=L(uv); float q=floor(l*4.)/3.; col+=ramp(q*0.85)*q*0.45*uFill; a+=q*uFill; }
        // --- ASCII glyphs
        if(uAscii>0.){
          vec2 grid=vec2(uGrid, uGrid/asp*0.55); vec2 cell=floor(uv*grid); vec2 f=fract(uv*grid);
          float l=L((cell+0.5)/grid); float gi=floor(clamp(l,0.,0.999)*10.99);
          if(l>0.6 && h21(cell+floor(uTime*12.))>0.7) gi = 11.+floor(h21(cell*1.7)*(uGlyphN-11.));
          float gm=texture2D(uGlyph, vec2((gi+f.x)/uGlyphN, f.y)).r;
          col+= ramp(l)*gm*uAscii*step(0.02,l); a+=gm*uAscii;
        }
        // --- scanline halftone
        if(uScan>0.){ float rows=uGrid*0.6/asp; float y=fract(uv.y*rows); float l=L(vec2(uv.x,(floor(uv.y*rows)+.5)/rows)); float w=l*0.5; float s=smoothstep(w,w-0.08,abs(y-0.5)); col+=ramp(l)*s*uScan; a+=s*uScan; }
        if(uRaw>0.){ vec3 c=texture2D(tVideo,vuv(uv)).rgb; col+=c*uRaw; a+=uRaw; }
        // reveal wipe + dissolve
        float along=dot(uv-0.5,normalize(uRevealDir))+0.5; float rv=smoothstep(uReveal-0.03,uReveal,along); col*=1.-rv;
        if(uDissolve>0.){ float n=h21(floor(uv*vec2(uGrid,uGrid/asp))); col*=step(uDissolve,n); }
        gl_FragColor=vec4(col*uIntensity*uOpacity, 1.);
      }`,
  });
}

// Apply a clip's measured luminance window (meta.lumLo/lumHi from prep_video.py) to a roto material
export function rotoLevels(mat, video, lo = 0, hi = 1) {
  const m = video.meta;
  if (m.lumLo != null) {
    mat.uniforms.uLumLo.value = m.lumLo + (m.lumHi - m.lumLo) * lo;
    mat.uniforms.uLumHi.value = m.lumLo + (m.lumHi - m.lumLo) * hi;
  }
  mat.uniforms.uVidRes.value.set(m.w, m.h);
}

// Draw a roto material as a fullscreen layer (object-fit: cover) into the current render target
export function drawRotoFullscreen(E, mat, { scale = 1, x = 0, y = 0 } = {}) {
  if (!E._rotoFS) {
    E._rotoFS = {
      scene: new THREE.Scene(),
      cam: new THREE.OrthographicCamera(-E.W / E.H, E.W / E.H, 1, -1, 0, 10),
    };
    E._rotoFS.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    E._rotoFS.scene.add(E._rotoFS.mesh);
  }
  const m = E._rotoFS.mesh;
  m.material = mat;
  const va =
    (mat.uniforms.uVidRes.value.x * mat.uniforms.uCrop.value.z) /
    (mat.uniforms.uVidRes.value.y * mat.uniforms.uCrop.value.w);
  const sa = E.W / E.H;
  const hgt = (va < sa ? sa / va : 1) * 2 * scale;
  m.scale.set(hgt * va, hgt, 1);
  m.position.set(x, y, 0);
  E.renderer.render(E._rotoFS.scene, E._rotoFS.cam);
}
