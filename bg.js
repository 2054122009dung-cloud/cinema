/* Home Cinema 5D - phát nền trên iPhone (bg.js)
   - navigator.audioSession = 'playback': Web Audio không bị iOS tắt khi chuyển app / khoá màn hình, và bỏ qua công tắc im lặng
   - Media Session: tên phim + nút phát/tạm dừng/tua trên màn hình khoá và Control Center
   - Nút ⧉: Picture-in-Picture (cửa sổ nổi) - cách duy nhất để VIDEO tiếp tục chạy khi dùng app khác
   - Tự phát lại nếu iOS tạm dừng khi bạn rời trang, và tự bật lại AudioContext nếu bị treo
   Thêm vào index.html, SAU auto.js:  <script src="bg.js"></script>
*/
(() => {
  'use strict';
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}

  const ms = navigator.mediaSession;
  let wasPlaying = false, userPaused = false, hiddenAt = 0, hooked = null, ctxHooked = null, lastPos = 0;
  const resumeCtx = () => { try { if (ac && ac.state !== 'running') ac.resume(); } catch {} };

  // ---- nút PiP ----
  $('bFS').insertAdjacentHTML('beforebegin', '<button id="bPiP" title="Cửa sổ nổi (xem tiếp khi dùng app khác)">⧉</button>');
  async function togglePiP() {
    if (!vid) return;
    vid.style.visibility = 'visible';   // video đang bị ẩn dưới lớp WebGL; PiP cần phần tử hiển thị
    try {
      if (vid.webkitSupportsPresentationMode && vid.webkitSetPresentationMode) {       // iOS / Safari
        vid.webkitSetPresentationMode(vid.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
      } else if (document.pictureInPictureEnabled) {
        if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await vid.requestPictureInPicture();
      } else toast('Trình duyệt này không hỗ trợ cửa sổ nổi.');
    } catch (e) { toast('Không bật được cửa sổ nổi: ' + (e.message || e)); }
  }
  $('bPiP').onclick = e => { e.stopPropagation(); togglePiP(); };

  // ---- Media Session (màn hình khoá) ----
  function setMeta() {
    if (!ms || !cur) return;
    try { ms.metadata = new MediaMetadata({ title: cur.title || 'Home Cinema 5D', artist: 'Home Cinema 5D', artwork: cur.poster ? [{ src: cur.poster, sizes: '320x180', type: 'image/jpeg' }] : [] }); } catch {}
  }
  if (ms) {
    const set = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
    set('play', () => { userPaused = false; resumeCtx(); vid && vid.play(); });
    set('pause', () => { userPaused = true; vid && vid.pause(); });
    set('seekbackward', d => { if (vid) vid.currentTime = Math.max(0, vid.currentTime - (d.seekOffset || 10)); });
    set('seekforward', d => { if (vid) vid.currentTime += (d.seekOffset || 10); });
    set('seekto', d => { if (vid && d.seekTime != null) vid.currentTime = d.seekTime; });
    set('stop', () => { userPaused = true; vid && vid.pause(); });
  }

  // ---- gắn vào mỗi video mới ----
  function hook(v) {
    try { v.autoPictureInPicture = true; } catch {}          // Safari: tự vào PiP khi rời trang (nếu được phép)
    v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.addEventListener('play', () => { userPaused = false; wasPlaying = true; if (ms) ms.playbackState = 'playing'; setMeta(); });
    v.addEventListener('pause', () => {
      if (ms) ms.playbackState = 'paused';
      // iOS tự tạm dừng khi rời trang: nếu không phải bạn bấm dừng thì phát lại
      const sys = document.hidden || performance.now() - hiddenAt < 1500;
      if (sys && wasPlaying && !userPaused && !v.ended) { resumeCtx(); setTimeout(() => { if (vid === v && v.paused && !userPaused) v.play().catch(() => {}); }, 60); }
    });
    v.addEventListener('timeupdate', () => {
      const t = performance.now(); if (!ms || !ms.setPositionState || t - lastPos < 1000 || !isFinite(v.duration)) return; lastPos = t;
      try { ms.setPositionState({ duration: v.duration, playbackRate: v.playbackRate || 1, position: Math.min(v.currentTime, v.duration) }); } catch {}
    });
    v.addEventListener('leavepictureinpicture', () => { if (vid) vid.style.visibility = S.d3 !== 'off' ? 'hidden' : (typeof glcv !== 'undefined' ? vid.style.visibility : 'visible'); });
  }
  setInterval(() => {
    if (vid && vid !== hooked) { hooked = vid; userPaused = false; hook(vid); setMeta(); }
    if (ac && ac !== ctxHooked) { ctxHooked = ac; ac.addEventListener('statechange', () => { if (ac.state !== 'running' && wasPlaying && !userPaused) ac.resume().catch(() => {}); }); }
  }, 500);

  // ---- rời / quay lại trang ----
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = performance.now(); wasPlaying = !!(vid && !vid.paused); }
    else { resumeCtx(); if (vid && wasPlaying && vid.paused && !userPaused) vid.play().catch(() => {}); }
  });
  window.addEventListener('pageshow', resumeCtx);
  window.addEventListener('focus', resumeCtx);
})();
