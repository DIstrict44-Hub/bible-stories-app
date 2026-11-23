(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const LS = { uid: 'bs_uid', adFree: 'bs_adfree', installDismissed: 'bs_install_dismissed_at', name: 'bs_name' };
  let uid = localStorage.getItem(LS.uid);
  if (!uid) { uid = 'u_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36)); localStorage.setItem(LS.uid, uid); }
  const state = { videos: [], config: { adEvery: 4 }, adFree: localStorage.getItem(LS.adFree) === '1', muted: true, current: null, commentsFor: null, donation: 500 };

  const api = async (url, opts = {}) => {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  };
  const toast = (msg, ms = 2400) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); };
  const fmt = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K' : String(n);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = {
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.6-9.5-9.2C1 8.2 3.4 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.6 0 6 3.7 4.5 7.3C19.5 16.4 12 21 12 21z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v13M7 8l5-5 5 5"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  };

  // ---------- Ads ----------
  function applyAdState() {
    document.body.classList.toggle('ad-free', state.adFree);
    $('#bannerAd').classList.toggle('hidden', state.adFree);
    $('#adFreeNote').classList.toggle('hidden', !state.adFree);
    $('#removeAdsBtn').classList.toggle('hidden', state.adFree);
    document.querySelectorAll('.ad-slide').forEach(el => el.remove());
    if (!state.adFree && state.videos.length) insertAds();
    layoutPad();
  }
  function adSlide(n) {
    const s = document.createElement('section');
    s.className = 'slide ad-slide'; s.dataset.ad = n;
    // AD SLOT: replace inner .ad-card with your ad network's interstitial/native unit (e.g. Google AdSense/AdMob/Ad Manager)
    s.innerHTML = `<div class="ad-card"><span class="ad-tag">SPONSORED · AD SLOT</span><h3>Your ad here</h3>
      <p>Interstitial placeholder (every ${state.config.adEvery} stories).<br>Swap in a real ad network later.</p>
      <button class="btn-gold" data-action="remove-ads">Remove ads · one-time</button>
      <p style="font-size:12px">Keep scrolling to continue ↓</p></div>`;
    return s;
  }
  function insertAds() {
    const slides = [...document.querySelectorAll('#feed .slide:not(.ad-slide)')];
    slides.forEach((el, i) => { if ((i + 1) % state.config.adEvery === 0 && i < slides.length - 1) el.after(adSlide(i)); });
  }

  // ---------- Feed ----------
  function slideHTML(v) {
    return `<video playsinline muted loop preload="metadata" poster="${v.poster}" src="${v.src}"></video>
      <div class="flicker"></div><div class="shade"></div>
      <div class="tap-icon">🔊</div>
      <div class="meta">
        <div class="kicker">${esc(v.reference.toUpperCase())} · KJV</div>
        <h2>${esc(v.title)}</h2>
        <p>${esc(v.description)}</p>
        <div class="verse">“${esc(v.verse)}”<cite>— ${esc(v.verseRef)}</cite></div>
      </div>
      <div class="rail">
        <button class="like ${v.liked ? 'on' : ''}" aria-label="Like"><span class="ico">${ICON.heart}</span><span class="n">${fmt(v.likeCount)}</span></button>
        <button class="comments" aria-label="Comments"><span class="ico">${ICON.comment}</span><span class="n">${fmt(v.commentCount)}</span></button>
        <button class="save ${v.saved ? 'on' : ''}" aria-label="Save"><span class="ico">${ICON.save}</span><span>${v.saved ? 'Saved' : 'Save'}</span></button>
        <button class="share" aria-label="Share"><span class="ico">${ICON.share}</span><span>Share</span></button>
      </div>
      <div class="progress"><i></i></div>`;
  }
  function renderFeed() {
    const feed = $('#feed'); feed.innerHTML = '';
    state.videos.forEach(v => {
      const s = document.createElement('section');
      s.className = 'slide'; s.id = 'v-' + v.id; s.dataset.id = v.id; s.innerHTML = slideHTML(v);
      wireSlide(s, v); feed.appendChild(s);
    });
    applyAdState(); observe();
  }
  function wireSlide(s, v) {
    const video = s.querySelector('video'), bar = s.querySelector('.progress i');
    video.addEventListener('timeupdate', () => { if (video.duration) bar.style.width = (video.currentTime / video.duration * 100) + '%'; });
    video.addEventListener('click', () => toggleMute(s));
    s.querySelector('.shade').style.pointerEvents = 'none';
    s.querySelector('.like').onclick = () => like(v, s);
    s.querySelector('.comments').onclick = () => openComments(v);
    s.querySelector('.save').onclick = () => save(v, s);
    s.querySelector('.share').onclick = () => share(v);
    let lastTap = 0;
    video.addEventListener('pointerup', () => { const now = Date.now(); if (now - lastTap < 280 && !v.liked) like(v, s); lastTap = now; });
  }
  function setMuteUI() {
    let pill = $('#mutePill');
    if (!pill) { pill = document.createElement('button'); pill.id = 'mutePill'; pill.className = 'mute-pill'; pill.onclick = () => state.current && toggleMute(state.current); $('#app').appendChild(pill); }
    pill.textContent = state.muted ? '🔇 Tap to unmute' : '🔊 Sound on';
    pill.classList.toggle('hidden', !state.current || !!(state.current && state.current.classList.contains('ad-slide')));
  }
  function toggleMute(slide) {
    state.muted = !state.muted;
    document.querySelectorAll('#feed video').forEach(v => v.muted = state.muted);
    const vid = slide.querySelector('video'); if (vid && vid.paused) vid.play().catch(() => {});
    const ic = slide.querySelector('.tap-icon'); if (ic) { ic.textContent = state.muted ? '🔇' : '🔊'; ic.classList.add('show'); setTimeout(() => ic.classList.remove('show'), 600); }
    setMuteUI();
  }
  let io;
  function observe() {
    if (io) io.disconnect();
    io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const vid = e.target.querySelector('video');
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          state.current = e.target;
          if (vid) { vid.muted = state.muted; vid.play().catch(() => { vid.muted = true; state.muted = true; vid.play().catch(() => {}); setMuteUI(); });
            const nxt = e.target.nextElementSibling && e.target.nextElementSibling.querySelector('video'); if (nxt) nxt.preload = 'auto'; }
          setMuteUI();
        } else if (vid && !vid.paused) { vid.pause(); }
      });
    }, { root: $('#feed'), threshold: [0, 0.6] });
    document.querySelectorAll('#feed .slide').forEach(s => io.observe(s));
    new MutationObserver(() => document.querySelectorAll('#feed .slide').forEach(s => io.observe(s))).observe($('#feed'), { childList: true });
  }
  document.addEventListener('visibilitychange', () => { const v = state.current && state.current.querySelector('video'); if (!v) return; document.hidden ? v.pause() : v.play().catch(() => {}); });

  // ---------- Actions ----------
  function syncSlides(v) {
    document.querySelectorAll(`#v-${v.id}`).forEach(s => {
      s.querySelector('.like').classList.toggle('on', v.liked); s.querySelector('.like .n').textContent = fmt(v.likeCount);
      s.querySelector('.save').classList.toggle('on', v.saved); s.querySelector('.save span:last-child').textContent = v.saved ? 'Saved' : 'Save';
      s.querySelector('.comments .n').textContent = fmt(v.commentCount);
    });
  }
  async function like(v) {
    const want = !v.liked; v.liked = want; v.likeCount += want ? 1 : -1; syncSlides(v);
    try { const r = await api(`/api/videos/${v.id}/like`, { method: 'POST', body: { uid, like: want } }); v.liked = r.liked; v.likeCount = r.likeCount; syncSlides(v); }
    catch (e) { v.liked = !want; v.likeCount += want ? -1 : 1; syncSlides(v); toast('Could not like right now'); }
  }
  async function save(v) {
    const want = !v.saved; v.saved = want; syncSlides(v);
    try { await api(`/api/videos/${v.id}/save`, { method: 'POST', body: { uid, save: want } }); toast(want ? 'Saved to your collection' : 'Removed from Saved'); }
    catch (e) { v.saved = !want; syncSlides(v); toast('Could not save right now'); }
  }
  async function share(v) {
    const url = `${location.origin}/?v=${v.id}`;
    const data = { title: `${v.title} · Bible Stories`, text: `“${v.verse}” — ${v.verseRef}`, url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Link copied'); }
    catch (_) { window.prompt('Copy this link:', url); }
  }

  // ---------- Sheets ----------
  function openSheet(id) { closeSheets(); $('#sheetBackdrop').classList.remove('hidden'); const s = $(id); s.classList.add('open'); s.setAttribute('aria-hidden', 'false'); }
  function closeSheets() { $('#sheetBackdrop').classList.add('hidden'); document.querySelectorAll('.sheet').forEach(s => { s.classList.remove('open'); s.setAttribute('aria-hidden', 'true'); }); }
  $('#sheetBackdrop').onclick = closeSheets;
  document.querySelectorAll('.sheet-close').forEach(b => b.onclick = closeSheets);

  async function openComments(v) {
    state.commentsFor = v; $('#commentList').innerHTML = '<li style="color:#8d7f68">Loading…</li>';
    $('#commentCountLabel').textContent = v.commentCount; openSheet('#commentsSheet');
    $('#commentName').value = localStorage.getItem(LS.name) || '';
    try { renderComments(await api(`/api/videos/${v.id}/comments`)); } catch (_) { $('#commentList').innerHTML = '<li>Could not load comments.</li>'; }
  }
  function renderComments(list) {
    $('#commentCountLabel').textContent = list.length;
    $('#commentList').innerHTML = list.length ? list.map(c => `<li><b>${esc(c.name)}</b><time>${new Date(c.at).toLocaleDateString()}</time><p>${esc(c.text)}</p></li>`).join('')
      : '<li style="color:#8d7f68;font-family:var(--serif);font-style:italic;font-size:17px">Be the first to share a reflection.</li>';
  }
  $('#commentForm').onsubmit = async e => {
    e.preventDefault(); const v = state.commentsFor; if (!v) return;
    const text = $('#commentText').value.trim(); const name = $('#commentName').value.trim(); if (!text) return;
    localStorage.setItem(LS.name, name);
    try {
      await api(`/api/videos/${v.id}/comments`, { method: 'POST', body: { uid, text, name } });
      $('#commentText').value = ''; v.commentCount++; syncSlides(v);
      renderComments(await api(`/api/videos/${v.id}/comments`));
    } catch (err) { toast('Could not post: ' + err.message); }
  };

  // ---------- Tabs / Saved ----------
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => showView(t.dataset.view));
  async function showView(view) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    $('#feed').classList.toggle('hidden', view !== 'feed'); $('#saved').classList.toggle('hidden', view !== 'saved');
    if (view === 'saved') {
      document.querySelectorAll('#feed video').forEach(v => v.pause()); setMuteUIHidden(true);
      const list = await api(`/api/saved?uid=${uid}`).catch(() => []);
      $('#saved').innerHTML = `<h2>Saved Stories</h2>` + (list.length ? `<div class="grid">${list.map(v => `<button class="tile" data-id="${v.id}" style="background-image:url(${v.poster})"><span>${esc(v.title)}</span></button>`).join('')}</div>`
        : `<div class="empty">Tap the bookmark on any story<br>to keep it here.</div>`);
      $('#saved').querySelectorAll('.tile').forEach(b => b.onclick = () => { showView('feed'); jumpTo(b.dataset.id); });
    } else { setMuteUIHidden(false); const v = state.current && state.current.querySelector('video'); if (v) v.play().catch(() => {}); }
  }
  function setMuteUIHidden(h) { const p = $('#mutePill'); if (p) p.classList.toggle('hidden', h); }
  function jumpTo(id) { const el = document.getElementById('v-' + id); if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' }); }

  // ---------- Payments (one-time Stripe Checkout; demo mode when no keys) ----------
  async function startRemoveAds() {
    try { const r = await api('/api/checkout/remove-ads', { method: 'POST', body: { uid } }); location.href = r.url; }
    catch (e) { toast('Checkout unavailable: ' + e.message); }
  }
  async function startDonate() {
    const custom = parseFloat(($('#customAmount').value || '').replace(/[^0-9.]/g, ''));
    const cents = custom ? Math.round(custom * 100) : state.donation;
    if (!(cents >= 100)) return toast('Minimum donation is $1');
    try { const r = await api('/api/checkout/donate', { method: 'POST', body: { uid, amountCents: cents } }); location.href = r.url; }
    catch (e) { toast('Checkout unavailable: ' + e.message); }
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-action="remove-ads"]'); if (b) { e.preventDefault(); if (b.id === 'removeAdsBtn') startRemoveAds(); else openSheet('#menuSheet'); } });
  $('#donateBtn').onclick = startDonate;
  document.querySelectorAll('.amount[data-cents]').forEach(b => b.onclick = () => { document.querySelectorAll('.amount').forEach(x => x.classList.remove('active')); b.classList.add('active'); state.donation = +b.dataset.cents; $('#customAmount').value = ''; });
  $('#customAmount').oninput = () => document.querySelectorAll('.amount[data-cents]').forEach(x => x.classList.remove('active'));
  $('#menuBtn').onclick = () => openSheet('#menuSheet');

  async function handleCheckoutReturn() {
    const p = new URLSearchParams(location.search); const status = p.get('checkout'); if (!status) return;
    history.replaceState(null, '', location.pathname + (p.get('v') ? `?v=${p.get('v')}` : ''));
    if (status === 'cancel') return toast('Checkout canceled — no charge made.');
    try {
      const r = await api(`/api/checkout/verify?session_id=${encodeURIComponent(p.get('session_id'))}`);
      if (!r.paid) return toast('Payment not completed yet.');
      if (r.kind === 'remove_ads') { setAdFree(r.adFree); toast((r.demo ? '[Demo] ' : '') + 'Ads removed. Thank you!', 3500); }
      else toast((r.demo ? '[Demo] ' : '') + `Thank you for your gift of $${(r.amount / 100).toFixed(2)}!`, 3500);
    } catch (e) { toast('Could not verify payment: ' + e.message); }
  }
  function setAdFree(v) { state.adFree = !!v; localStorage.setItem(LS.adFree, v ? '1' : '0'); applyAdState(); }

  // ---------- Install CTA (PWA) ----------
  let deferredPrompt = null;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function dismissedRecently() { const t = +localStorage.getItem(LS.installDismissed) || 0; return Date.now() - t < 3 * 864e5; }
  function showInstallBar(show) { $('#installBar').classList.toggle('hidden', !show); layoutPad(); }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; if (!isStandalone() && !dismissedRecently()) showInstallBar(true); });
  window.addEventListener('appinstalled', () => { showInstallBar(false); toast('Installed! Open Bible Stories from your home screen.'); });
  async function doInstall() {
    if (deferredPrompt) { deferredPrompt.prompt(); const c = await deferredPrompt.userChoice.catch(() => ({})); deferredPrompt = null; if (c.outcome === 'accepted') showInstallBar(false); }
    else if (isIOS) openSheet('#iosSheet');
    else toast('Use your browser menu → “Install app” / “Add to Home screen”.', 3500);
  }
  $('#installBtn').onclick = doInstall; $('#installMenuBtn').onclick = () => { closeSheets(); doInstall(); };
  $('#installClose').onclick = () => { localStorage.setItem(LS.installDismissed, Date.now()); showInstallBar(false); };
  if (!isStandalone() && !dismissedRecently()) setTimeout(() => { if (!deferredPrompt) showInstallBar(true); }, 1200); // iOS & others: show fallback CTA
  if (isStandalone()) $('#installMenuBtn').classList.add('hidden');

  function layoutPad() { requestAnimationFrame(() => { const h = $('#bottomStack').getBoundingClientRect().height; document.documentElement.style.setProperty('--bottom-pad', Math.max(h, 8) + 'px'); }); }
  window.addEventListener('resize', layoutPad);

  // ---------- Boot ----------
  async function boot() {
    try { state.config = await api('/api/config'); } catch (_) {}
    if (state.config.demoMode) $('#demoBadge').classList.remove('hidden');
    if (state.config.removeAdsPriceLabel) $('#removeAdsPrice').textContent = state.config.removeAdsPriceLabel; else $('#removeAdsPrice').parentElement.textContent = 'Remove Ads · one-time';
    try { const e = await api(`/api/entitlement?uid=${uid}`); state.adFree = !!e.adFree; localStorage.setItem(LS.adFree, e.adFree ? '1' : '0'); } catch (_) {}
    state.videos = await api(`/api/videos?uid=${uid}`);
    renderFeed();
    await handleCheckoutReturn();
    const v = new URLSearchParams(location.search).get('v'); if (v) jumpTo(v);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  boot().catch(e => { $('#feed').innerHTML = `<div class="empty">Could not load stories.<br>${esc(e.message)}</div>`; });
})();
