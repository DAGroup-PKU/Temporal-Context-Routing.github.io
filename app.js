const grid = document.getElementById('grid');
let current = null;

const pct = (t, dur) => Math.max(0, Math.min(100, (t / dur) * 100));
const fmt = (t) => `${t.toFixed(1)}s`;

function makeSeg(item, dur, cls, label) {
  const el = document.createElement('div');
  el.className = `seg ${cls}`;
  const [a, b] = item.req;
  el.style.left = pct(a, dur) + '%';
  el.style.width = Math.max(0.8, pct(b, dur) - pct(a, dur)) + '%';
  el.textContent = label;
  el.dataset.from = a;
  el.dataset.to = b;
  return el;
}

function makeGot(item, dur) {
  if (!item.got) return null;
  const frag = document.createDocumentFragment();
  item.got.forEach((t) => {
    const m = document.createElement('div');
    m.className = 'got';
    m.style.left = pct(t, dur) + '%';
    frag.appendChild(m);
  });
  return frag;
}

function buildCard(d) {
  const card = document.createElement('article');
  card.className = 'card';

  card.innerHTML = `
    <div class="card-head">
      <span class="card-title">${d.title}</span>
      <span class="card-meta">${d.metrics.nshot} shots &middot; ${d.metrics.ndia} lines</span>
    </div>
    <div class="stage" style="--ar: ${d.w || 704} / ${d.h || 1280}">
      <video preload="metadata" playsinline disablePictureInPicture
             controlslist="nodownload noplaybackrate"
             poster="assets/posters/${d.id}.jpg"
             src="assets/videos/${d.id}.mp4"></video>
      <div class="playbtn"><span></span></div>
    </div>
    <div class="card-body">
      <div class="tl">
        <div class="tl-row">
          <div class="tl-label">shots</div>
          <div class="lane shots"></div>
        </div>
        <div class="tl-row">
          <div class="tl-label">dialogue</div>
          <div class="lane dia dialogue"></div>
        </div>
        <div class="ticks"><span>0s</span><span>${fmt(d.duration / 2)}</span><span>${fmt(d.duration)}</span></div>
        <p class="readout"></p>
      </div>
      <p class="scene"><b>Scene.</b> ${d.scene} <b>Style.</b> ${d.style}</p>
    </div>
  `;

  const video = card.querySelector('video');
  const shotLane = card.querySelector('.lane.shots');
  const diaLane = card.querySelector('.lane.dialogue');
  const readout = card.querySelector('.readout');

  d.shots.forEach((s, i) => {
    const el = makeSeg(s, d.duration, i % 2 ? 's-b' : 's-a', s.id);
    el.addEventListener('mouseenter', () => showShot(s));
    shotLane.appendChild(el);
    const g = makeGot(s, d.duration);
    if (g) shotLane.appendChild(g);
  });

  d.dialogue.forEach((x) => {
    const el = makeSeg(x, d.duration, 'd', x.id);
    el.addEventListener('mouseenter', () => showLine(x));
    diaLane.appendChild(el);
    const g = makeGot(x, d.duration);
    if (g) diaLane.appendChild(g);
  });

  const headA = document.createElement('div');
  headA.className = 'head';
  headA.style.left = '0%';
  shotLane.appendChild(headA);
  const headB = document.createElement('div');
  headB.className = 'head';
  headB.style.left = '0%';
  diaLane.appendChild(headB);

  function showShot(s) {
    const err = s.err != null ? ` <span class="err">landed within ${s.err.toFixed(3)}s</span>` : '';
    readout.innerHTML = `<span class="tag">${s.id} ${s.req[0]}&ndash;${s.req[1]}s</span>${s.desc}${err}`;
  }

  function showLine(x) {
    const err = x.err != null ? ` <span class="err">onset off by ${x.err.toFixed(3)}s</span>` : '';
    const spk = x.speaker ? `${x.speaker}: ` : '';
    readout.innerHTML = `<span class="tag">${x.id} ${x.req[0]}&ndash;${x.req[1]}s</span>${spk}&ldquo;${x.line}&rdquo;${err}`;
  }

  const idle = () =>
    (readout.innerHTML =
      `<span class="tag">Boundary MAE ${d.metrics.bmae.toFixed(3)}s</span>` +
      `Shot IoU ${d.metrics.iou.toFixed(3)} &middot; dialogue onset ${d.metrics.dstart.toFixed(3)}s &middot; ` +
      `hover a block to read the script`);
  idle();

  function sync() {
    const t = video.currentTime;
    const p = pct(t, d.duration) + '%';
    headA.style.left = p;
    headB.style.left = p;

    let active = null;
    shotLane.querySelectorAll('.seg').forEach((el, i) => {
      const on = t >= +el.dataset.from && t < +el.dataset.to;
      el.classList.toggle('active', on);
      if (on) active = d.shots[i];
    });
    let line = null;
    diaLane.querySelectorAll('.seg').forEach((el, i) => {
      const on = t >= +el.dataset.from && t < +el.dataset.to;
      el.classList.toggle('active', on);
      if (on) line = d.dialogue[i];
    });

    if (line) showLine(line);
    else if (active) showShot(active);
  }

  video.addEventListener('timeupdate', sync);
  video.addEventListener('seeked', sync);

  video.addEventListener('play', () => {
    if (current && current !== video) current.pause();
    current = video;
    card.classList.add('playing');
  });
  video.addEventListener('pause', () => card.classList.remove('playing'));
  video.addEventListener('ended', () => {
    card.classList.remove('playing');
    headA.style.left = headB.style.left = '0%';
    card.querySelectorAll('.seg').forEach((el) => el.classList.remove('active'));
    idle();
  });

  card.querySelector('.stage').addEventListener('click', () => {
    video.paused ? video.play() : video.pause();
  });

  return card;
}

function boot(rows) {
  rows.forEach((d, i) => {
    const card = buildCard(d);
    if (i === 0) card.classList.add('featured');
    grid.appendChild(card);
  });
}

function loadDataJs() {
  return new Promise((resolve, reject) => {
    if (Array.isArray(window.TCR_DATA)) {
      resolve(window.TCR_DATA);
      return;
    }
    const s = document.createElement('script');
    s.src = 'assets/data.js';
    s.onload = () => {
      if (Array.isArray(window.TCR_DATA)) resolve(window.TCR_DATA);
      else reject(new Error('assets/data.js did not define TCR_DATA'));
    };
    s.onerror = () => reject(new Error('Failed to load assets/data.js'));
    document.head.appendChild(s);
  });
}

loadDataJs()
  .catch(() => fetch('assets/data.json').then((r) => {
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  }))
  .then(boot)
  .catch((e) => {
    grid.innerHTML =
      `<p style="color:#b00">Could not load demo data (${e}). ` +
      `If you updated data.json, run <code>python3 tools/sync_data_js.py</code> ` +
      `and reopen this file.</p>`;
  });
