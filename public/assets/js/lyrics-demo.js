// Enhanced lyrics demo. One playback clock drives every effect, and each value is a pure function of
// the position, so a seek lands on the right frame. Only a line change reached by playing glides; a seek, a resize
// or a reduced-motion change snaps, so the same position always paints the same frame. The tuning mirrors shared-ui: LyricsSweepGeometry
// (feathered sweep, completion lift, glow envelope), LyricsEmphasis (held-word letter ripple),
// LyricsInterlude (dots), LyricsDepth and LyricsLineSettle (row depth and stagger).
(() => {
  const root = document.querySelector('[data-lyrics-demo]');
  if (!root) return;

  const MIN_SWEEP_MS = 16;
  const FEATHER_FRACTION = 0.2;
  const FEATHER_MIN_PX = 4;
  const FEATHER_MAX_PX = 28;
  const EMPHASIS_MIN_MS = 1_000;
  const EMPHASIS_RAMP_MS = 1_000;
  const MAX_CLUSTERS = 7;
  const SCALE_BOOST = 0.1;
  const STAGGER_DIVISOR = 2.5;
  const GLOW_ALPHA = 0.35;
  const GLOW_ATTACK = 0.18;
  const GLOW_RELEASE = 0.38;
  const GLOW_FLOOR = 0.22;
  const GLOW_FAST_MS = 130;
  const GLOW_SLOW_MS = 800;
  const WORD_LIFT_DP = 2;
  const LIFT_MIN_MS = 120;
  const LIFT_MAX_MS = 300;
  const SINK_MS = 200;
  const ACTIVE_SCALE = 1.05;
  const DEPTH_MAX_STEPS = 4;
  const DEPTH_SCALE_STEP = 0.025;
  const DEPTH_ALPHA_STEP = 0.12;
  const DEPTH_STAGGER_MS = 45;
  const SETTLE_MS = 1_000;
  const SETTLE_OMEGA = 14.142136;
  // LyricsMode.ENHANCED draws idle ink at 0.4 and a passed line at LyricsPalette.PASSED_ALPHA, 0.7.
  const IDLE_ALPHA = 0.4;
  const PASSED_ALPHA = 0.7;
  const ANCHOR = 0.35;
  const LEAD_DEFAULT_MS = 250;
  const LEAD_SHORT_GAP_MS = 480;
  const LEAD_LONG_GAP_MS = 750;
  const GAP_MIN_MS = 200;
  const GAP_MAX_MS = 750;
  const INTERLUDE_MIN_MS = 9_000;
  const DOT_COUNT = 3;
  const ENTER_MS = 400;
  const EXIT_MS = 400;
  const BREATH_CYCLE_MS = 2_400;
  const BREATH_MIN = 0.92;
  const BREATH_MAX = 1.08;
  const IDLE_LIGHT = 0.25;
  const END_SWELL_MS = 1_500;
  const END_SWELL_FROM = 1.1;
  const END_SWELL_TO = 1.4;

  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduceMotion = () => Boolean(motionQuery && motionQuery.matches);
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null;
  const clusters = (text) => segmenter ? [...segmenter.segment(text)].map((part) => part.segment) : Array.from(text);

  const math = {
    progressAt(startMs, endMs, positionMs, reduced = reduceMotion(), minSweepMs = MIN_SWEEP_MS) {
      if (reduced) return positionMs >= startMs ? 1 : 0;
      if (positionMs <= startMs) return 0;
      const duration = Math.max(endMs - startMs, minSweepMs);
      return clamp((positionMs - startMs) / duration, 0, 1);
    },
    featherPx(widthPx) {
      return clamp((widthPx || 0) * FEATHER_FRACTION, FEATHER_MIN_PX, FEATHER_MAX_PX);
    },
    liftDurationMs(wordStartMs, wordEndMs, nextWordStartMs) {
      const wordMs = Math.max(0, wordEndMs - wordStartMs);
      const gapMs = Math.max(0, nextWordStartMs - wordEndMs);
      const base = clamp(Math.floor(wordMs / 2), LIFT_MIN_MS, LIFT_MAX_MS);
      const capped = Math.min(base, Math.max(gapMs, LIFT_MIN_MS));
      return wordMs > 0 ? Math.min(capped, wordMs) : capped;
    },
    liftAt(wordStartMs, wordEndMs, nextWordStartMs, positionMs, reduced = reduceMotion()) {
      if (reduced) return 1;
      const durationMs = math.liftDurationMs(wordStartMs, wordEndMs, nextWordStartMs);
      if (durationMs <= 0) return 1;
      const startMs = wordEndMs - Math.min(durationMs, Math.max(0, wordEndMs - wordStartMs));
      const t = clamp((positionMs - startMs) / durationMs, 0, 1);
      const inv = 1 - t;
      return 1 - inv * inv * inv;
    },
    sinkAt(firstWordStartMs, positionMs, reduced = reduceMotion()) {
      if (reduced) return 0;
      const t = clamp((positionMs - (firstWordStartMs - SINK_MS)) / SINK_MS, 0, 1);
      return t * t * (3 - 2 * t);
    },
    dropAt(firstWordStartMs, wordStartMs, wordEndMs, nextWordStartMs, positionMs, reduced = reduceMotion()) {
      return math.sinkAt(firstWordStartMs, positionMs, reduced) *
        (1 - math.liftAt(wordStartMs, wordEndMs, nextWordStartMs, positionMs, reduced));
    },
    emphasisGain(startMs, endMs) {
      const held = endMs - startMs;
      if (held < EMPHASIS_MIN_MS) return 0;
      return Math.min(1, 0.5 + 0.5 * ((held - EMPHASIS_MIN_MS) / EMPHASIS_RAMP_MS));
    },
    isEmphasized(text, startMs, endMs) {
      const count = clusters(text).length;
      return endMs - startMs >= EMPHASIS_MIN_MS && count >= 1 && count <= MAX_CLUSTERS;
    },
    rippleAt(wordStartMs, durationMs, clusterCount, index, positionMs) {
      if (clusterCount <= 0 || index < 0 || index >= clusterCount) return 0;
      const duration = Math.max(1, durationMs);
      const staggerMs = Math.floor(duration / STAGGER_DIVISOR / clusterCount);
      const local = positionMs - wordStartMs - staggerMs * index;
      if (local <= 0 || local >= duration) return 0;
      return Math.sin(Math.PI * (local / duration));
    },
    bumpAt(wordStartMs, durationMs, clusterCount, index, positionMs, reduced = reduceMotion()) {
      return reduced ? 0 : math.rippleAt(wordStartMs, durationMs, clusterCount, index, positionMs);
    },
    glowIntensity(startMs, endMs, positionMs) {
      if (positionMs < startMs || positionMs >= endMs) return 0;
      const held = Math.max(1, endMs - startMs);
      const through = clamp((positionMs - startMs) / held, 0, 1);
      const envelope = through < GLOW_ATTACK
        ? through / GLOW_ATTACK
        : through > 1 - GLOW_RELEASE
          ? (1 - through) / GLOW_RELEASE
          : 1;
      const pace = clamp((held - GLOW_FAST_MS) / (GLOW_SLOW_MS - GLOW_FAST_MS), 0, 1);
      return (GLOW_FLOOR + (1 - GLOW_FLOOR) * pace) * clamp(envelope, 0, 1);
    },
    activationLeadMs(gapMs) {
      if (gapMs != null && gapMs >= GAP_MIN_MS && gapMs <= GAP_MAX_MS) {
        return Math.round(LEAD_SHORT_GAP_MS + (gapMs - GAP_MIN_MS) * (LEAD_LONG_GAP_MS - LEAD_SHORT_GAP_MS) / (GAP_MAX_MS - GAP_MIN_MS));
      }
      return LEAD_DEFAULT_MS;
    },
    interludeVisibility(startMs, endMs, positionMs) {
      if (positionMs < startMs || positionMs >= endMs) return 0;
      return Math.min((positionMs - startMs) / ENTER_MS, (endMs - positionMs) / EXIT_MS, 1);
    },
    interludeProgress(startMs, endMs, positionMs) {
      return clamp((positionMs - startMs) / Math.max(1, endMs - startMs), 0, 1);
    },
    dotLight(progress, index, reduced = reduceMotion()) {
      const turn = progress * DOT_COUNT - index;
      const share = reduced ? (turn > 0 ? 1 : 0) : clamp(turn, 0, 1);
      return IDLE_LIGHT + (1 - IDLE_LIGHT) * share;
    },
    breath(positionMs) {
      const phase = (positionMs % BREATH_CYCLE_MS) / BREATH_CYCLE_MS;
      const swell = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
      return BREATH_MIN + (BREATH_MAX - BREATH_MIN) * swell;
    },
    endSwell(startMs, endMs, positionMs) {
      const remaining = endMs - positionMs;
      if (remaining <= 0 || remaining > END_SWELL_MS) return 0;
      const through = 1 - remaining / END_SWELL_MS;
      return END_SWELL_FROM + (END_SWELL_TO - END_SWELL_FROM) * through;
    },
    settleOffset(displacementPx, elapsedMs, delayMs) {
      const seconds = Math.max(0, elapsedMs - delayMs) / 1_000;
      const w = SETTLE_OMEGA * seconds;
      return displacementPx * (1 + w) * Math.exp(-w);
    },
    depth(distance, reduced = reduceMotion()) {
      if (distance == null || distance <= 0) return { scale: 1, alpha: 1 };
      const steps = Math.min(distance, DEPTH_MAX_STEPS);
      return {
        scale: reduced ? 1 : 1 - DEPTH_SCALE_STEP * steps,
        alpha: 1 - DEPTH_ALPHA_STEP * steps,
      };
    },
  };

  const rows = [...root.querySelectorAll('.lyric-row')].map((element, index) => {
    const words = [...element.querySelectorAll('.lyric-word')].map((wordEl) => {
      const text = (wordEl.textContent || '').trim();
      const startMs = Number(wordEl.dataset.start);
      const endMs = Number(wordEl.dataset.end);
      const parts = clusters(text);
      const emphasized = math.isEmphasized(text, startMs, endMs);
      wordEl.textContent = '';
      const glow = document.createElement('span');
      glow.className = 'lyric-word__glow';
      glow.setAttribute('aria-hidden', 'true');
      const letters = parts.map((part, index) => {
        const letter = document.createElement('span');
        letter.className = 'lyric-letter';
        letter.textContent = part;
        return { element: letter, index, leftPx: 0, widthPx: 0 };
      });
      wordEl.append(glow, ...letters.map((letter) => letter.element));
      return { element: wordEl, text, startMs, endMs, durationMs: endMs - startMs, clusters: parts.length, emphasized, letters, widthPx: 0 };
    });
    words.forEach((word, i) => {
      word.nextStartMs = i + 1 < words.length ? words[i + 1].startMs : word.endMs;
    });
    return {
      element,
      index,
      words,
      startMs: words[0]?.startMs ?? 0,
      endMs: words[words.length - 1]?.endMs ?? 0,
    };
  });
  rows.forEach((row, i) => {
    const previousEnd = i === 0 ? null : Math.max(...rows.slice(0, i).map((r) => r.endMs));
    row.leadMs = math.activationLeadMs(previousEnd == null ? null : row.startMs - previousEnd);
    row.activationMs = row.startMs - row.leadMs;
    const from = previousEnd == null ? 0 : previousEnd;
    row.interlude = row.startMs - from >= INTERLUDE_MIN_MS ? { startMs: from, endMs: row.startMs } : null;
  });

  const durationMs = Math.max(...rows.map((row) => row.endMs));
  const viewport = root.querySelector('.lyrics-viewport');
  const track = root.querySelector('.lyrics-track');
  // The card has one playhead slot, so the dots take it and the finished line steps back while they show. The app
  // draws the same dots inside the next line's item, just under the line being sung; the timing is identical.
  const dots = root.querySelector('.lyrics-dots');
  const dotElements = dots ? [...dots.children] : [];
  const toggle = document.querySelector('[data-lyrics-toggle]');
  const live = root.querySelector('[data-lyrics-status]');
  const interlude = rows.find((row) => row.interlude)?.interlude || null;

  let positionMs = 0;
  let frameRequest = 0;
  let lastTimestamp = null;
  let userPaused = false;
  let onScreen = true;
  let activeIndex = -1;
  let lastTrackY = 0;
  let layoutPending = true;
  let settleDelta = 0;
  let settleStart = -Infinity;

  const measure = () => {
    rows.forEach((row) => {
      row.offsetTop = row.element.offsetTop;
      row.height = row.element.offsetHeight;
      row.words.forEach((word) => {
        word.widthPx = word.element.offsetWidth;
        word.letters.forEach((letter) => {
          letter.leftPx = letter.element.offsetLeft;
          letter.widthPx = letter.element.offsetWidth;
        });
      });
    });
    if (viewport) viewport.height = viewport.clientHeight;
    // Every measurement invalidates the anchor: a row and the viewport can both move even when the line stays put.
    layoutPending = true;
  };

  const activeRowAt = (position) => {
    let index = -1;
    rows.forEach((row, i) => { if (position >= row.activationMs) index = i; });
    return index;
  };

  const applySettle = (nowMs) => {
    const elapsed = nowMs - settleStart;
    const settled = !settleDelta || !running();
    rows.forEach((row) => {
      const distance = activeIndex < 0 ? 0 : Math.min(Math.abs(row.index - activeIndex), DEPTH_MAX_STEPS);
      const offset = settled || elapsed >= SETTLE_MS ? 0 : math.settleOffset(settleDelta, elapsed, DEPTH_STAGGER_MS * distance);
      row.element.style.setProperty('--settle-y', `${offset.toFixed(2)}px`);
    });
  };

  // `snap` marks a discontinuity such as a seek: the picture jumps to the target frame and no wall-clock settle
  // starts, so two seeks to the same position paint the same frame while stopped or playing.
  const render = (snap = false) => {
    const reduced = reduceMotion();
    const index = activeRowAt(positionMs);
    const height = viewport && viewport.height ? viewport.height : 0;
    const primaryRow = rows[index];
    const rowChanged = index !== activeIndex;
    const layoutChanged = layoutPending;
    layoutPending = false;

    // The anchor is a function of the geometry as much as of the line, so a new measurement re-anchors the current
    // row too, and the stale settle is dropped instead of replaying against the old offsets.
    if (rowChanged || layoutChanged) {
      const previousY = lastTrackY;
      const firstHandoff = activeIndex < 0;
      const targetY = primaryRow && height
        ? Math.round(height * ANCHOR - primaryRow.offsetTop)
        : 0;
      lastTrackY = targetY;
      activeIndex = index;
      const glides = rowChanged && !firstHandoff && !layoutChanged && !snap && !reduced;
      settleDelta = glides ? previousY - targetY : 0;
      settleStart = glides ? performance.now() : -Infinity;
      if (track) track.style.setProperty('--track-y', `${targetY}px`);
    }
    if (height && track) track.style.setProperty('--track-y', `${lastTrackY}px`);

    const interludeFade = dots && interlude
      ? math.interludeVisibility(interlude.startMs, interlude.endMs, positionMs)
      : 0;

    rows.forEach((row) => {
      // Each row owns its span: it is active from its activation lead and passed only after its own last word, so
      // overlapping lines stay active together while the newest one remains the row that scrolls.
      const active = positionMs >= row.activationMs && positionMs < row.endMs;
      const isPassed = positionMs >= row.endMs;
      // The newest line keeps the playhead slot through an interlude, when every row has ended.
      const isActive = active || (index >= 0 && row.index === index);
      const distance = index < 0 ? null : Math.abs(row.index - index);
      const depth = math.depth(active ? 0 : distance, reduced);
      row.element.classList.toggle('is-active', isActive);
      row.element.classList.toggle('is-passed', isPassed);
      row.element.style.setProperty('--row-scale', active ? ACTIVE_SCALE : depth.scale.toFixed(3));
      row.element.style.setProperty('--row-alpha', (isActive ? 1 - interludeFade : depth.alpha).toFixed(3));
      const ink = isPassed ? PASSED_ALPHA : IDLE_ALPHA;
      row.element.style.setProperty('--ink', String(ink));
      row.element.style.setProperty('--bright', isPassed ? 'color-mix(in srgb, var(--lyrics-color) 70%, transparent)' : 'var(--lyrics-color)');
      row.element.style.setProperty('--dim', `color-mix(in srgb, var(--lyrics-color) ${Math.round(ink * 100)}%, transparent)`);
      row.element.style.setProperty('--stagger', `${DEPTH_STAGGER_MS * Math.min(distance ?? 0, DEPTH_MAX_STEPS)}ms`);

      row.words.forEach((word) => {
        const progress = isActive || isPassed
          ? math.progressAt(word.startMs, word.endMs, positionMs, reduced)
          : 0;
        word.element.classList.toggle('is-sung', progress >= 1);
        word.element.classList.toggle('is-sweeping', progress > 0 && progress < 1);
        const feather = math.featherPx(word.widthPx);
        const edgePx = progress * word.widthPx;
        word.letters.forEach((letter) => {
          const width = letter.widthPx;
          const fill = width > 0 ? clamp((edgePx - letter.leftPx) / width, 0, 1) : progress;
          const softness = width > 0 ? clamp(feather / width, 0.12, 0.6) : 0;
          const edgeA = fill >= 1 ? 1 : fill <= 0 ? 0 : clamp(fill - softness, 0, 1);
          const edgeB = fill >= 1 ? 1 : fill <= 0 ? 0 : clamp(fill + softness, 0, 1);
          letter.element.style.setProperty('--edge-a', `${(edgeA * 100).toFixed(2)}%`);
          letter.element.style.setProperty('--edge-b', `${(edgeB * 100).toFixed(2)}%`);
        });

        const drop = active
          ? math.dropAt(row.startMs, word.startMs, word.endMs, word.nextStartMs, positionMs, reduced) * WORD_LIFT_DP
          : 0;
        word.element.style.setProperty('--drop', `${drop.toFixed(2)}px`);

        const gain = word.emphasized ? math.emphasisGain(word.startMs, word.endMs) : 0;
        const glow = gain > 0 && !reduced
          ? math.glowIntensity(word.startMs, word.endMs, positionMs) * gain * GLOW_ALPHA
          : 0;
        word.element.style.setProperty('--glow', glow.toFixed(3));
        word.letters.forEach((letter, letterIndex) => {
          const bump = word.emphasized
            ? math.bumpAt(word.startMs, word.durationMs, word.clusters, letterIndex, positionMs, reduced)
            : 0;
          letter.element.style.setProperty('--bump', bump.toFixed(3));
          letter.element.style.setProperty('--bump-scale', (1 + SCALE_BOOST * bump).toFixed(3));
        });
      });
    });

    applySettle(performance.now());

    if (dots && interlude) {
      const visibility = math.interludeVisibility(interlude.startMs, interlude.endMs, positionMs);
      const progress = math.interludeProgress(interlude.startMs, interlude.endMs, positionMs);
      const swell = math.endSwell(interlude.startMs, interlude.endMs, positionMs);
      const breath = reduced
        ? 1
        : Math.max(math.breath(positionMs), swell);
      dots.style.setProperty('--dots-visible', visibility.toFixed(3));
      dots.style.setProperty('--dots-breath', breath.toFixed(3));
      dots.setAttribute('aria-hidden', String(visibility <= 0));

      dotElements.forEach((dot, dotIndex) => {
        dot.style.setProperty('--dot-light', math.dotLight(progress, dotIndex, reduced).toFixed(3));
      });
    }
  };

  const running = () => !userPaused && onScreen && !document.hidden;

  const frame = (timestamp) => {
    frameRequest = 0;
    if (!running()) { lastTimestamp = null; return; }
    if (lastTimestamp != null) {
      positionMs = (positionMs + (timestamp - lastTimestamp)) % durationMs;
      render();
    }
    lastTimestamp = timestamp;
    frameRequest = window.requestAnimationFrame(frame);
  };

  const start = () => {
    if (frameRequest || !running()) return;
    lastTimestamp = null;
    frameRequest = window.requestAnimationFrame(frame);
  };
  const stop = () => {
    if (frameRequest) window.cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    lastTimestamp = null;
  };
  const syncToggle = () => {
    if (!toggle) return;
    const paused = userPaused;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Play enhanced lyrics demo' : 'Pause enhanced lyrics demo');
    toggle.querySelector('span').textContent = paused ? 'play_arrow' : 'pause';
    if (live) live.textContent = paused ? 'Enhanced lyrics demo paused' : 'Enhanced lyrics demo playing';
  };
  const play = () => { userPaused = false; syncToggle(); start(); };
  const pause = () => { userPaused = true; settleDelta = 0; syncToggle(); stop(); render(); };
  const togglePlayback = () => (userPaused ? play() : pause());

  toggle?.addEventListener('click', togglePlayback);

  document.addEventListener('visibilitychange', () => {
    if (running()) start(); else stop();
  });
  if ('IntersectionObserver' in window && viewport) {
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (running()) start(); else stop();
    });
    observer.observe(viewport);
  }
  const remeasure = () => { measure(); render(); };
  window.addEventListener('resize', remeasure);
  // Container-query and font-driven size changes do not always fire a window resize, so watch the box as well.
  if ('ResizeObserver' in window && viewport) new ResizeObserver(remeasure).observe(viewport);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure, () => {});
  motionQuery?.addEventListener?.('change', () => render());

  measure();
  syncToggle();
  render();
  start();

  root.lyricsDemo = {
    math,
    play,
    pause,
    toggle: togglePlayback,
    seek(ms) {
      positionMs = ((ms % durationMs) + durationMs) % durationMs;
      settleDelta = 0;
      settleStart = -Infinity;
      render(true);
    },
    tick(ms) {
      positionMs = (positionMs + ms) % durationMs;
      render();
      return positionMs;
    },
    position: () => positionMs,
    duration: () => durationMs,
    state: () => ({
      running: running(),
      userPaused,
      onScreen,
      hidden: Boolean(document.hidden),
      reduceMotion: reduceMotion(),
      activeIndex,
      rows: rows.length,
      interlude,
      frameRequested: Boolean(frameRequest),
    }),
  };
})();
