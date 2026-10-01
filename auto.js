/* Home Cinema 5D - tự động phối hình ảnh + âm thanh theo cảnh (auto.js)
   Không "hiểu" cốt truyện. Nó đo tín hiệu: độ sáng, độ rực màu, nhịp cắt cảnh, độ to, bass.
   Từ đó đoán tâm trạng cảnh (hành động / căng thẳng / tươi sáng / êm-thoại) và đẩy nhẹ các thanh
   Bass, Lời thoại, Echo, Chế độ đêm, Tương phản, Bão hoà, Tông màu, Viền tối, Rung, Chớp quanh giá trị bạn đặt.
   Khi đổi cảnh thật sự (cắt mạnh sau đoạn êm): viền tối khép lại rồi mở ra, âm thanh hạ nhẹ một nhịp. */
(() => {
  'use strict';
  const KEYS = ['bass', 'dialog', 'wet', 'night', 'contrast', 'sat', 'tone', 'vig', 'shake', 'flash'];
  const MOODS = {
    action: { bass: 4, wet: -4, contrast: 10, sat: 6, shake: 25, flash: 20 },
    tense: { wet: 8, contrast: 8, sat: -12, tone: -12, vig: 20, shake: -10, night: 15 },
    bright: { sat: 10, tone: 10, vig: -15, bass: 1 },
    calm: { dialog: 3, bass: -2, wet: 2, shake: -30, flash: -30 }
  };
  const NAMES = { action: 'hành động', tense: 'căng thẳng', bright: 'tươi sáng', calm: 'êm / thoại' };
  const lim = {}; for (const its of Object.values(SPEC)) its.forEach(it => { if (KEYS.includes(it.k)) lim[it.k] = it; });
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

  let on = LS.get('hc_auto', 0) == 1, str = Math.min(100, Math.max(0, +LS.get('hc_astr', 60)));
  const base = {}, off = {}; let mine = false;
  KEYS.forEach(k => { base[k] = S[k]; off[k] = 0; });

  // nhận biết khi bạn tự kéo thanh / đổi preset / mở phim mới để cập nhật giá trị gốc
  const _aa = applyAll;
  applyAll = function (key) {
    if (!mine && on) {
      if (!key) KEYS.forEach(k => { base[k] = S[k]; off[k] = 0; });
      else if (KEYS.includes(key)) base[key] = S[key];
    }
    return _aa(key);
  };
  function restore() {
    KEYS.forEach(k => { S[k] = base[k]; off[k] = 0; });
    mine = true; try { syncUI(); _aa(); } finally { mine = false; }
  }
  // lưu cấu hình riêng cho phim: lưu giá trị gốc, không lưu phần tự động cộng thêm
  $('bSaveMovie').addEventListener('click', () => { if (on) KEYS.forEach(k => { S[k] = base[k]; }); }, true);

  // ---- giao diện ----
  const row = $('cAdv').closest('.row');
  row.insertAdjacentHTML('beforeend',
    '<label class="inl"><input type="checkbox" id="cAuto"> 🎭 Tự động phối theo cảnh <b id="aMood" style="min-width:80px">—</b></label>' +
    '<label class="inl">Mức <b id="aVal"></b><input type="range" id="aStr" min="0" max="100" step="5" style="width:110px"></label>');
  $('cAuto').checked = on; $('aStr').value = str; $('aVal').textContent = str + '%';
  $('cAuto').onchange = () => {
    on = $('cAuto').checked; LS.set('hc_auto', on ? 1 : 0);
    if (on) KEYS.forEach(k => { base[k] = S[k]; off[k] = 0; }); else { restore(); $('aMood').textContent = '—'; }
  };
  $('aStr').oninput = () => { str = +$('aStr').value; $('aVal').textContent = str + '%'; LS.set('hc_astr', str); };
  if (on) KEYS.forEach(k => { base[k] = S[k]; });

  // ---- đo tín hiệu ----
  const sc = document.createElement('canvas'); sc.width = 32; sc.height = 18;
  const sx = sc.getContext('2d', { willReadFrequently: true }), fb = new Uint8Array(512);
  const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += fb[i]; return s / (b - a); };
  let prev = null, L = .4, Sa = .3, dAvg = .03, loudAvg = .1, bassAvg = .1, loudS = .1, bassS = .1, n = 0, lastCut = 0, lastCT = 0, trans = 0, lastMood = '';
  let w = { action: 0, tense: 0, bright: 0, calm: 1 }; const cuts = [];

  function step() {
    if (!on || !vid || vid.paused || !vid.videoWidth || vid.readyState < 2) { prev = null; return; }
    const now = performance.now();
    if (Math.abs(vid.currentTime - lastCT - .1 * vid.playbackRate) > 1) prev = null;   // vừa tua: bỏ qua
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
    L += (sumL / 576 - L) * .06; Sa += (sumS / 576 - Sa) * .06;
    let loud = 0, bass = 0;
    if (A) { A.an.getByteFrequencyData(fb); bass = avg(1, 5) / 255; loud = avg(1, 120) / 255; }
    n++; const rate = Math.max(.0017, 1 / n);
    loudAvg += (loud - loudAvg) * rate; bassAvg += (bass - bassAvg) * rate;
    loudS += (loud - loudS) * .2; bassS += (bass - bassS) * .2;
    // cắt cảnh
    while (cuts.length && now - cuts[0] > 10000) cuts.shift();
    const crBefore = cuts.length; let scene = false;
    if (hadPrev && d > Math.max(.12, dAvg * 3) && now - lastCut > 400) { lastCut = now; cuts.push(now); scene = d > .22 && crBefore < 4; }
    else if (hadPrev) dAvg += (d - dAvg) * .02;
    const loudRel = loudS / (loudAvg + .04), bassRel = bassS / (bassAvg + .04), cr = cuts.length;
    // điểm tâm trạng
    const act = clamp((cr - 3) / 5) * .5 + clamp((loudRel - 1.2) / .8) * .3 + clamp((bassRel - 1.3) / .8) * .2;
    const ten = (clamp((.3 - L) / .2) * .6 + clamp((.85 - loudRel) / .5) * .4) * (1 - act);
    const bri = clamp((L - .5) / .25) * .7 + clamp((Sa - .25) / .2) * .3;
    const calm = .4 + clamp((2 - cr) / 2) * .3;
    const tot = act + ten + bri + calm, tg = { action: act / tot, tense: ten / tot, bright: bri / tot, calm: calm / tot };
    let best = 'calm'; for (const m in w) { w[m] += (tg[m] - w[m]) * .04; if (w[m] > w[best]) best = m; }
    if (scene) trans = 1; else trans = Math.max(0, trans - .2);
    // áp dụng
    const k = str / 100;
    KEYS.forEach(key => {
      let o = 0; for (const m in MOODS) o += w[m] * (MOODS[m][key] || 0);
      if (key === 'vig') o += 20 * trans;
      off[key] = o * k;
      const it = lim[key]; S[key] = clamp(base[key] + off[key], it.min, capOf(it));
    });
    mine = true;
    try { _aa('bass'); _aa('contrast'); } finally { mine = false; }
    if (scene && A) A.master.gain.setTargetAtTime(S.gain * .85, ac.currentTime, .03);   // hạ nhẹ 1 nhịp khi đổi cảnh
    if (NAMES[best] !== lastMood) { lastMood = NAMES[best]; $('aMood').textContent = lastMood; }
  }
  setInterval(step, 100);
})();
