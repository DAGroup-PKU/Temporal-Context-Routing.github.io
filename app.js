const grid = document.getElementById('grid');
let current = null;

const pct = (t, dur) => Math.max(0, Math.min(100, (t / dur) * 100));
const fmt = (t) => `${t.toFixed(1)}s`;

function makeSeg(item, dur, label) {
  const el = document.createElement('div');
  el.className = 'seg';
  const [a, b] = item.req;
  const left = pct(a, dur);
  const width = Math.max(0.8, pct(b, dur) - pct(a, dur));
  el.style.left = `calc(${left}% + 1px)`;
  el.style.width = `max(4px, calc(${width}% - 2px))`;
  el.textContent = label;
  return el;
}

function buildCard(d) {
  const card = document.createElement('article');
  card.className = 'card';

  const timedItems = Array.isArray(d.events) ? d.events : (d.dialogue || []);
  const laneLabel = d.laneLabel || (Array.isArray(d.events) ? 'events' : 'dialogue');
  const countLabel = laneLabel === 'dialogue' ? 'lines' : 'events';
  const timedCount = d.metrics.ndia != null ? d.metrics.ndia : timedItems.length;

  card.innerHTML = `
    <div class="card-head">
      <div class="card-heading">
        <span class="card-title">${d.title}</span>
        ${d.category ? `<span class="card-capability">${d.category}</span>` : ''}
      </div>
      <span class="card-meta">${d.metrics.nshot} shots &middot; ${timedCount} ${countLabel}</span>
    </div>
    <div class="stage" style="--ar: ${d.w || 704} / ${d.h || 1280}">
      <video preload="metadata" playsinline disablePictureInPicture
             controlslist="nodownload noplaybackrate"
             poster="assets/posters/${d.id}.jpg"
             src="assets/videos/${d.id}.mp4"></video>
      <div class="playbtn"><span></span></div>
      <div class="ctrl">
        <button class="ctrl-play" type="button" aria-label="Play"></button>
        <div class="bar" role="slider" tabindex="0" aria-label="Seek"
             aria-valuemin="0" aria-valuemax="${d.duration}" aria-valuenow="0">
          <div class="bar-buf"></div>
          <div class="bar-fill"></div>
          <div class="bar-knob"></div>
        </div>
        <span class="ctrl-time">0.0 / ${fmt(d.duration)}</span>
      </div>
    </div>
    <div class="card-body">
      <div class="tl">
        <div class="tl-row">
          <div class="tl-label">shots</div>
          <div class="lane shots"></div>
        </div>
        <div class="tl-row">
          <div class="tl-label">${laneLabel}</div>
          <div class="lane dia dialogue"></div>
        </div>
        <div class="ticks"><span>0s</span><span>${fmt(d.duration / 2)}</span><span>${fmt(d.duration)}</span></div>
        <p class="readout"></p>
      </div>
      <p class="scene"><b>Scene.</b> ${d.scene} <b>Style.</b> ${d.style}</p>
    </div>
  `;

  const video = card.querySelector('video');
  const stage = card.querySelector('.stage');
  const shotLane = card.querySelector('.lane.shots');
  const diaLane = card.querySelector('.lane.dialogue');
  const readout = card.querySelector('.readout');
  const bar = card.querySelector('.bar');
  const barBuf = card.querySelector('.bar-buf');
  const barFill = card.querySelector('.bar-fill');
  const knob = card.querySelector('.bar-knob');
  const timeLabel = card.querySelector('.ctrl-time');
  const playBtn = card.querySelector('.ctrl-play');

  const shotSegs = d.shots.map((s) => {
    const el = makeSeg(s, d.duration, s.id);
    el.addEventListener('mouseenter', () => hoverShow(() => showShot(s)));
    shotLane.appendChild(el);
    return { el, data: s, from: s.req[0], to: s.req[1] };
  });

  const diaSegs = timedItems.map((x) => {
    const el = makeSeg(x, d.duration, x.id);
    el.addEventListener('mouseenter', () => hoverShow(() => showLine(x)));
    diaLane.appendChild(el);
    return { el, data: x, from: x.req[0], to: x.req[1] };
  });

  const headA = document.createElement('div');
  headA.className = 'head';
  shotLane.appendChild(headA);
  const headB = document.createElement('div');
  headB.className = 'head';
  diaLane.appendChild(headB);

  function showShot(s) {
    const err = s.err != null ? ` <span class="err">landed within ${s.err.toFixed(3)}s</span>` : '';
    readout.innerHTML = `<span class="tag">${s.id} ${s.req[0]}&ndash;${s.req[1]}s</span>${s.desc}${err}`;
  }

  function showLine(x) {
    const err = x.err != null ? ` <span class="err">onset off by ${x.err.toFixed(3)}s</span>` : '';
    if (x.line != null) {
      const spk = x.speaker ? `${x.speaker}: ` : '';
      readout.innerHTML = `<span class="tag">${x.id} ${x.req[0]}&ndash;${x.req[1]}s</span>${spk}&ldquo;${x.line}&rdquo;${err}`;
    } else {
      readout.innerHTML = `<span class="tag">${x.id} ${x.req[0]}&ndash;${x.req[1]}s</span>${x.desc || ''}${err}`;
    }
  }

  function idle() {
    if (d.summary) {
      readout.innerHTML = `<span class="tag">Requested timing</span>${d.summary} &middot; hover a block to read the script`;
      return;
    }
    readout.innerHTML =
      `<span class="tag">Boundary MAE ${d.metrics.bmae.toFixed(3)}s</span>` +
      `Shot IoU ${d.metrics.iou.toFixed(3)} &middot; dialogue onset ${d.metrics.dstart.toFixed(3)}s &middot; ` +
      `hover a block to read the script`;
  }

  // The readout is the most expensive thing on the card, so it is only rewritten
  // when the segment under the playhead actually changes.
  let shownKey = 'idle';
  idle();

  function hoverShow(render) {
    shownKey = 'hover';
    render();
  }

  let laneW = 0;
  let barW = 0;
  const measure = () => {
    laneW = shotLane.clientWidth;
    barW = bar.clientWidth;
  };
  measure();
  if (window.ResizeObserver) new ResizeObserver(measure).observe(card);

  let shownTime = '';
  // Segment highlighting only takes over the readout once the clip is in use;
  // before that the card keeps its metrics summary and the hover hint.
  let engaged = false;

  function paint() {
    const t = video.currentTime;
    const r = d.duration > 0 ? Math.max(0, Math.min(1, t / d.duration)) : 0;

    const x = `translateX(${(r * laneW).toFixed(2)}px)`;
    headA.style.transform = x;
    headB.style.transform = x;

    barFill.style.transform = `scaleX(${r})`;
    knob.style.transform = `translate(calc(${(r * barW).toFixed(2)}px - 50%), -50%)`;

    if (video.buffered.length) {
      const end = video.buffered.end(video.buffered.length - 1);
      barBuf.style.transform = `scaleX(${Math.min(1, end / d.duration)})`;
    }

    const stamp = t.toFixed(1);
    if (stamp !== shownTime) {
      shownTime = stamp;
      timeLabel.textContent = `${stamp} / ${fmt(d.duration)}`;
      bar.setAttribute('aria-valuenow', stamp);
    }

    if (!engaged) return;

    let shot = null;
    for (const it of shotSegs) {
      const cur = t >= it.from && t < it.to;
      it.el.classList.toggle('is-current', cur);
      it.el.classList.toggle('is-played', t >= it.to);
      if (cur) shot = it.data;
    }
    let line = null;
    for (const it of diaSegs) {
      const cur = t >= it.from && t < it.to;
      it.el.classList.toggle('is-current', cur);
      it.el.classList.toggle('is-played', t >= it.to);
      if (cur) line = it.data;
    }

    const key = line ? `d${line.id}` : shot ? `s${shot.id}` : 'idle';
    if (key !== shownKey) {
      shownKey = key;
      if (line) showLine(line);
      else if (shot) showShot(shot);
      else idle();
    }
  }

  let raf = 0;
  function loop() {
    paint();
    raf = requestAnimationFrame(loop);
  }
  function startLoop() {
    if (!raf) loop();
  }
  function stopLoop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    paint();
  }

  function toggle() {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function release() {
    engaged = false;
    for (const it of shotSegs.concat(diaSegs)) {
      it.el.classList.remove('is-current', 'is-played');
    }
    shownKey = 'idle';
    idle();
  }

  video.addEventListener('play', () => {
    if (current && current !== video) current.pause();
    current = video;
    engaged = true;
    card.classList.add('playing');
    playBtn.setAttribute('aria-label', 'Pause');
    measure();
    startLoop();
  });

  video.addEventListener('pause', () => {
    card.classList.remove('playing');
    playBtn.setAttribute('aria-label', 'Play');
    stopLoop();
  });

  video.addEventListener('ended', () => {
    card.classList.remove('playing');
    playBtn.setAttribute('aria-label', 'Play');
    release();
    video.currentTime = 0;
    stopLoop();
  });

  video.addEventListener('seeked', paint);
  video.addEventListener('loadedmetadata', () => {
    measure();
    paint();
  });
  video.addEventListener('progress', paint);

  stage.addEventListener('click', toggle);
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });

  function seekTo(clientX) {
    const rect = bar.getBoundingClientRect();
    const r = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    engaged = true;
    video.currentTime = r * (video.duration || d.duration);
    paint();
  }

  let dragging = false;
  bar.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    dragging = true;
    bar.classList.add('dragging');
    seekTo(e.clientX);
    try {
      bar.setPointerCapture(e.pointerId);
    } catch (_) {}
  });
  bar.addEventListener('pointermove', (e) => {
    if (dragging) seekTo(e.clientX);
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove('dragging');
    try {
      if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);
  bar.addEventListener('click', (e) => e.stopPropagation());

  bar.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 1 : 0.1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dir = e.key === 'ArrowLeft' ? -step : step;
      engaged = true;
      video.currentTime = Math.max(0, Math.min(d.duration, video.currentTime + dir));
    } else if (e.key === ' ' || e.key === 'Enter') {
      toggle();
    } else return;
    e.preventDefault();
    e.stopPropagation();
    paint();
  });

  // Warm the buffer before the first click so playback does not start on an empty pipe.
  card.addEventListener(
    'pointerenter',
    () => {
      if (video.preload !== 'auto') video.preload = 'auto';
    },
    { once: true }
  );

  return card;
}

function addClaim(card) {
  const el = document.createElement('div');
  el.className = 'claim';
  el.innerHTML =
    `<p class="claim-line">Two streams, one clock.<br><em>Played to the second.</em></p>` +
    `<p class="claim-sub">Picture and speech are generated as two streams against a single shared ` +
    `timeline. Temporal Context Routing turns every interval in the script into a timing term on ` +
    `the text-attention logits, so both streams read the same clock and each shot and each line ` +
    `is performed where the prompt placed it.</p>`;
  card.querySelector('.card-body').prepend(el);
}

function boot(rows) {
  // Lead with the two cases used in the film's "Dialogue Beyond the Frame"
  // chapter, then the dense-dialogue stress test. The remaining held-out
  // examples retain their original relative order.
  const preferred = new Map([
    ['clip_32845', 0],
    ['clip_21577', 1],
    ['clip_59538', 2],
  ]);
  rows = rows.slice().sort((a, b) => {
    const pa = preferred.has(a.id) ? preferred.get(a.id) : 100;
    const pb = preferred.has(b.id) ? preferred.get(b.id) : 100;
    return pa - pb;
  });

  // The clips are not all the same shape. Give the grid the shortest frame of
  // the bunch so the rows share one height; object-fit letterboxes the rest.
  const shortest = rows.slice(1).reduce((min, d) => Math.min(min, (d.h || 1280) / (d.w || 704)), Infinity);
  if (Number.isFinite(shortest)) grid.style.setProperty('--row-ar', `1 / ${shortest.toFixed(4)}`);

  rows.forEach((d, i) => {
    const card = buildCard(d);
    if (i === 0) {
      card.classList.add('featured');
      addClaim(card);
    }
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
