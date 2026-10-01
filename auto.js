/* Home Cinema 5D - tự động phối cảnh + hiệu ứng va chạm (auto.js, bản 2)
   1) Đoán tâm trạng cảnh (hành động / căng thẳng / tươi sáng / êm-thoại) từ độ sáng, màu, nhịp cắt, độ to, bass
      rồi kéo các thanh Bass, Lời thoại, Echo, Chế độ đêm, Tương phản, Bão hoà, Tông màu, Viền tối, Rung, Chớp. Thanh trượt chạy theo thật.
   2) Va chạm: phát hiện tiếng nổ / đập (bass bật mạnh) và tiếng keng (cao tần bật mạnh) trong vài mili-giây,
      rồi thêm: tiếng dội trầm tổng hợp, nhấn bass, ánh kim loại, vang loé lên, đồng bộ rung + chớp màn hình. */
(() => {
  'use strict';
  const KEYS = ['bass', 'dialog', 'wet', 'night', 'contrast', 'sat', 'tone', 'vig', 'shake', 'flash'];
  const MOODS = {
    action: { bass: 6, wet: -4, contrast: 14, sat: 8, shake: 35, flash: 30 },
    tense: { wet: 12, contrast: 10, sat: -16, tone: -15, vig: 25, shake: -15, night: 20 },
    bright: { sat: 14, tone: 12, vig: -20, bass: 1 },
    calm: { dialog: 4, bass: -3, wet: 3, shake: -35, flash: -35 }
  };
  const NAMES = { action: 'hành động', tense: 'căng thẳng', bright: 'tươi sáng', calm: 'êm / thoại' };
  const lim = {}; for (const its of Object.values(SPEC)) its.forEach(it => { if (KEYS.includes(it.k)) lim[it.k] = it; });
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

  let on = LS.get('hc_auto', 0) == 1, str = Math.min(100, Math.max(0, +LS.get('hc_astr', 80)));
  const base = {}, off = {}; let mine = false, drag = false;
  KEYS.forEach(k => { base[k] = S[k]; off[k] = 0; });

  // bạn tự kéo thanh / đổi preset / mở phim mới -> cập nhật giá trị gốc
  const _aa = applyAll;
  applyAll = function (key) {
    if (!mine && on) {
      if (!key) KEYS.forEach(k => { base[k] = S[k]; off[k] = 0; });
      else if (KEYS.includes(key)) base[key] = S[key] - off[key];
    }
    return _aa(key);
  };
  function syncSliders() {
    if (drag) return;
    KEYS.forEach(k => { const el = $('c_' + k); if (el) { el.value = S[k]; showVal(lim[k]); } });
  }
  function restore() {
    KEYS.forEach(k => { S[k] = base[k]; off[k] = 0; });
    mine = true; try { syncUI(); _aa(); } finally { mine = false; }
  }
  document.addEventListener('pointerdown', e => { drag = e.target.type === 'range'; }, true);
  document.addEventListener('pointerup', () => { drag = false; }, true);
  $('bSaveMovie').addEventListener('click', () => { if (on) KEYS.forEach(k => { S[k] = base[k]; }); }, true);

  // ---- giao diện ----
  $('cAdv').closest('.row').insertAdjacentHTML('beforeend',
    '<label class="inl"><input type="checkbox" id="cAuto"> 🎭 Tự động phối theo cảnh <b id="aMood" style="min-width:80px">—</b></label>' +
    '<label class="inl">Mức <b id="aVal"></b><input type="range" id="aStr" min="0" max="100" step="5" style="width:110px"></label>');
  $('cAuto').checked = on; $('aStr').value = str; $('aVal').textContent = str + '%';
  $('cAuto').onchange = () => {
    on = $('cAuto').checked; LS.set('hc_auto', on ? 1 : 0);
    if (on) KEYS.forEach(k => { base[k] = S[k]; off[k] = 0; }); else { restore(); $('aMood').textContent = '—'; }
  };
  $('aStr').oninput = () => { str = +$('aStr').value; $('aVal').textContent = str + '%'; LS.set('hc_astr', str); };

  // ---- đo tâm trạng cảnh (10 lần/giây) ----
  const sc = document.createElement('canvas'); sc.width = 32; sc.height = 18;
  const sx = sc.getContext('2d', { willReadFrequently: true }), fb = new Uint8Array(512);
  const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += fb[i]; return s / (b - a); };
  let prev = null, L = .4, Sa = .3, dAvg = .03, loudAvg = .1, bassAvg = .1, loudS = .1, bassS = .1, n = 0, lastCut = 0, lastCT = 0, trans = 0, lastMood = '', cnt = 0;
  const w = { action: 0, tense: 0, bright: 0, calm: 1 }; const cuts = [];

  function step() {
    if (!on || !vid || vid.paused || !vid.videoWidth || vid.readyState < 2) { prev = null; return; }
    const now = performance.now();
    if (Math.abs(vid.currentTime - lastCT - .1 * vid.playbackRate) > 1) prev = null;
    lastCT = vid.currentTime;
    let sumL = 0, sumS = 0, d = 0; const cur = new Float32Array(576);
    try {
      sx.drawImage(vid, 0, 0, 32, 18); const px = sx.getImageData(0, 0, 32, 18).data;
      for (let i = 0; i < 576; i++) {
        const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255, l = .2126 * r + .7152 * g + .0722 * b;
        cur[i] = l; sumL += l; sumS += Math.max(r, g, b) - Math.min(r, g, b);
      }
    } catch { return; }
    if (prev) { for (let i = 0; i < 576; i++) d += Math.abs(cur[i] - prev[i]); d /= 576; }
    const hadPrev = !!prev; prev = cur;
    L += (sumL / 576 - L) * .08; Sa += (sumS / 576 - Sa) * .08;
    let loud = 0, bass = 0;
    if (A) { A.an.getByteFrequencyData(fb); bass = avg(1, 5) / 255; loud = avg(1, 120) / 255; }
    n++; const rate = Math.max(.0017, 1 / n);
    loudAvg += (loud - loudAvg) * rate; bassAvg += (bass - bassAvg) * rate;
    loudS += (loud - loudS) * .2; bassS += (bass - bassS) * .2;
    while (cuts.length && now - cuts[0] > 10000) cuts.shift();
    const crBefore = cuts.length; let scene = false;
    if (hadPrev && d > Math.max(.12, dAvg * 3) && now - lastCut > 400) { lastCut = now; cuts.push(now); scene = d > .22 && crBefore < 4; }
    else if (hadPrev) dAvg += (d - dAvg) * .02;
    const loudRel = loudS / (loudAvg + .04), bassRel = bassS / (bassAvg + .04), cr = cuts.length;
    const act = clamp((cr - 3) / 5) * .5 + clamp((loudRel - 1.2) / .8) * .3 + clamp((bassRel - 1.3) / .8) * .2;
    const ten = (clamp((.3 - L) / .2) * .6 + clamp((.85 - loudRel) / .5) * .4) * (1 - act);
    const bri = clamp((L - .5) / .25) * .7 + clamp((Sa - .25) / .2) * .3;
    const calm = .4 + clamp((2 - cr) / 2) * .3;
    const tot = act + ten + bri + calm, tg = { action: act / tot, tense: ten / tot, bright: bri / tot, calm: calm / tot };
    for (const m in w) w[m] += (tg[m] - w[m]) * .08;
    // làm rõ tâm trạng nổi bật nhất (bình phương rồi chuẩn hoá)
    const ws = {}; let t2 = 0, best = 'calm'; for (const m in w) { ws[m] = w[m] * w[m]; t2 += ws[m]; }
    for (const m in ws) { ws[m] /= t2; if (ws[m] > ws[best]) best = m; }
    trans = scene ? 1 : Math.max(0, trans - .2);
    const k = str / 100 * 1.5;
    KEYS.forEach(key => {
      let o = 0; for (const m in MOODS) o += ws[m] * (MOODS[m][key] || 0);
      if (key === 'vig') o += 20 * trans;
      off[key] = o * k;
      const it = lim[key]; S[key] = clamp(base[key] + off[key], it.min, capOf(it));
    });
    mine = true;
    try { _aa('bass'); _aa('contrast'); } finally { mine = false; }
    if (++cnt % 3 === 0) syncSliders();
    if (scene && A) A.master.gain.setTargetAtTime(S.gain * .85, ac.currentTime, .03);
    if (NAMES[best] !== lastMood) { lastMood = NAMES[best]; $('aMood').textContent = lastMood; }
  }
  setInterval(step, 100);

  // ---- va chạm: tiếng nổ / đập / keng (chạy mỗi khung hình) ----
  let hook = null, an2 = null, sLow = .1, sHi = .05, lastBlast = 0, lastClang = 0; const fb2 = new Uint8Array(512);
  function rig() {   // gắn bộ xử lý vào chuỗi âm thanh của video hiện tại (mỗi video 1 lần)
    if (!A || A === hook) return; hook = A;
    try {
      an2 = ac.createAnalyser(); an2.fftSize = 1024; an2.smoothingTimeConstant = 0; A.mix.connect(an2);   // đo trước hiệu ứng nên không tự kích hoạt lại
      A.pLow = ac.createBiquadFilter(); A.pLow.type = 'lowshelf'; A.pLow.frequency.value = 120; A.pLow.gain.value = 0;
      A.pHi = ac.createBiquadFilter(); A.pHi.type = 'highshelf'; A.pHi.frequency.value = 3500; A.pHi.gain.value = 0;
      A.master.disconnect(A.limit); A.master.connect(A.pLow); A.pLow.connect(A.pHi); A.pHi.connect(A.limit);
      A.bloom = ac.createGain(); A.bloom.gain.value = 0; A.spatial.connect(A.bloom); A.bloom.connect(A.pre);
    } catch (e) { console.warn('auto.js: không gắn được bộ va chạm', e); an2 = null; }
  }
  function env(p, v, hold, tau) { const t = ac.currentTime; p.cancelScheduledValues(t); p.setTargetAtTime(v, t, .006); p.setTargetAtTime(0, t + hold, tau); }
  function thump(s) {   // tiếng dội trầm tổng hợp, trượt 95 -> 38 Hz
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(38, t + .3);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.45 * s, t + .01); g.gain.exponentialRampToValueAtTime(.0005, t + .5);
    o.connect(g); g.connect(A.pLow); o.start(t); o.stop(t + .55);
  }
  function impact(now) {
    requestAnimationFrame(impact);
    if (!on || !vid || vid.paused) return;
    rig(); if (!an2) return;
    an2.getByteFrequencyData(fb2);
    let lo = 0, hi = 0; for (let i = 1; i < 5; i++) lo += fb2[i]; lo /= 4 * 255; for (let i = 64; i < 170; i++) hi += fb2[i]; hi /= 106 * 255;
    const dl = lo - sLow, dh = hi - sHi, k = str / 100 * 1.5;
    if (dl > .10 && dl / (sLow + .08) > .8 && now - lastBlast > 180) {            // nổ / đập
      lastBlast = now; const s = clamp(dl / .35, .25, 1) * k;
      thump(s); env(A.pLow.gain, 9 * s, .12, .09); env(A.bloom.gain, 1.2 * s, .12, .25);
      shakeV = Math.max(shakeV, Math.min(1, s)); flashV = Math.max(flashV, Math.min(1, s * .8));
    } else if (dh > .07 && dh / (sHi + .05) > 1 && dl < .06 && now - lastClang > 140) {   // keng / kim loại
      lastClang = now; const s = clamp(dh / .25, .25, 1) * k;
      env(A.pHi.gain, 8 * s, .08, .07); env(A.bloom.gain, .8 * s, .1, .2);
    }
    sLow += (lo - sLow) * .02; sHi += (hi - sHi) * .02;
  }
  requestAnimationFrame(impact);
})();
