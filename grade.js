/* Home Cinema 5D - bộ chỉnh màu WebGL (grade.js)
   Thay các bộ lọc CSS bằng 1 shader: đường cong S, split-tone teal/orange, halation,
   làm nét unsharp-mask, hạt phim đổi mỗi khung (nhiều ở vùng tối), viền tối.
   Dùng lại các thanh có sẵn: bright, contrast, sat, tone, sharp, grain, grainFps, vig.
   Tự tắt khi xem 3D, hoặc khi trình duyệt không hỗ trợ WebGL (về lại bộ lọc CSS cũ). */
(() => {
  'use strict';
  const HAL = 0.18;                       // độ toả sáng (halation), 0 = tắt. Chỉnh thử: HC_HAL.value = 0.3
  window.HC_HAL = { value: HAL };
  const glcv = document.createElement('canvas'); glcv.id = 'glcv';
  glcv.style.display = 'none';
  const gl = glcv.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  let ok = !!gl;

  const VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const FS = `precision highp float;
varying vec2 uv;uniform sampler2D tx;uniform vec2 res;
uniform float bright,contrast,sat,tone,sharp,grain,vig,seed,hal;
float hash(vec2 q){return fract(sin(dot(q,vec2(12.9898,78.233)))*43758.5453);}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
  vec2 px=1./res; vec3 c=texture2D(tx,uv).rgb;
  if(sharp>0.){
    vec3 b=(texture2D(tx,uv+vec2(px.x,0.)).rgb+texture2D(tx,uv-vec2(px.x,0.)).rgb+texture2D(tx,uv+vec2(0.,px.y)).rgb+texture2D(tx,uv-vec2(0.,px.y)).rgb)*.25;
    c+=(c-b)*sharp*1.4;
  }
  if(hal>0.){
    float asp=res.x/res.y; vec3 g=vec3(0.);
    for(int i=0;i<8;i++){
      float a=float(i)*.7854; vec2 d=vec2(cos(a),sin(a)*asp);
      g+=max(texture2D(tx,uv+d*.006).rgb-.72,0.)+max(texture2D(tx,uv+d*.014).rgb-.72,0.);
    }
    c+=g/16.*vec3(1.,.38,.2)*hal*4.;
  }
  c*=bright;
  if(contrast>=1.){ float a=clamp((contrast-1.)*1.6,0.,1.); vec3 s=clamp(c,0.,1.); c=mix(c,s*s*(3.-2.*s),a); }
  else c=(c-.5)*contrast+.5;
  float l=lum(c); c=mix(vec3(l),c,sat);
  float sw=1.-smoothstep(0.,.5,l), hw=smoothstep(.45,1.,l);
  c+=tone*hw*vec3(.07,.025,-.07)+abs(tone)*sw*vec3(-.025,.012,.04);
  float v=smoothstep(.45,1.05,length((uv-.5)*vec2(1.,.8))*1.25); c*=1.-vig*v*.85;
  if(grain>0.){ float n=hash(uv*res+seed)-.5; c+=n*grain*.14*((1.-l)*.7+.3); }
  gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;
  let U = {}, tex = null;
  function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
  if (ok) try {
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(pr);
    const bf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['tx', 'res', 'bright', 'contrast', 'sat', 'tone', 'sharp', 'grain', 'vig', 'seed', 'hal'].forEach(n => U[n] = gl.getUniformLocation(pr, n));
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.uniform1i(U.tx, 0);
  } catch (e) { console.warn('grade.js: tắt do lỗi shader', e); ok = false; }
  glcv.addEventListener('webglcontextlost', e => { e.preventDefault(); ok = false; });

  const active = () => ok && vid && vid.videoWidth > 0 && S.d3 === 'off';
  // bộ lọc CSS cũ chỉ để dự phòng: khi shader chạy thì tắt đi để không chỉnh màu 2 lần
  const _av = applyVideo;
  applyVideo = function (key) { _av(key); if (active()) { put(elPic, 'filter', 'none'); put(elTint, 'display', 'none'); } };

  let seq = -1, lastG = 0, was = false;
  function draw(now) {
    const W = Math.min(vid.videoWidth, [960, 1280, 1920, 2560][TIER] || 1280), H = Math.round(W * vid.videoHeight / vid.videoWidth);
    if (glcv.width !== W || glcv.height !== H) { glcv.width = W; glcv.height = H; gl.viewport(0, 0, W, H); }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vid);
    gl.uniform2f(U.res, W, H);
    gl.uniform1f(U.bright, S.bright / 100); gl.uniform1f(U.contrast, S.contrast / 100); gl.uniform1f(U.sat, S.sat / 100);
    gl.uniform1f(U.tone, S.tone / 50); gl.uniform1f(U.sharp, S.sharp / 100); gl.uniform1f(U.grain, S.grain / 100);
    gl.uniform1f(U.vig, S.vig / 100); gl.uniform1f(U.hal, window.HC_HAL.value);
    gl.uniform1f(U.seed, Math.floor(now / 1000 * S.grainFps) % 997 * 1.37);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const on = active();
    if (!on) {
      if (was) { glcv.style.display = 'none'; if (vid) vid.style.visibility = S.d3 !== 'off' ? 'hidden' : 'visible'; was = false; if (!ok) applyVideo(); }
      return;
    }
    if (glcv.parentNode !== vid.parentNode) vid.parentNode.insertBefore(glcv, vid.nextSibling);
    if (!was) { was = true; glcv.style.display = 'block'; vid.style.visibility = 'hidden'; seq = -1; applyVideo(); }
    if (glcv.style.objectFit !== vid.style.objectFit) glcv.style.objectFit = vid.style.objectFit || 'contain';
    if (vid.readyState < 2) return;
    const grainTick = S.grain > 0 && now - lastG > 1000 / S.grainFps;
    if (frameSeq === seq && !grainTick) return;
    seq = frameSeq; if (grainTick) lastG = now;
    try { draw(now); } catch (e) { console.warn('grade.js: tắt do lỗi', e); ok = false; }
  }
  requestAnimationFrame(loop);
})();
