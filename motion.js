const bar = document.querySelector('.field-bar');
const scene = document.querySelector('.work-scene');
const menu = bar.querySelector('.menu');
const compactLayout = matchMedia('(max-width: 767px), (pointer: coarse) and (max-width: 980px)');
menu.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    menu.open = false;
    menu.querySelector('summary').focus();
  }
});
document.addEventListener('click', event => {
  if (menu.open && !menu.contains(event.target) && !event.target.closest('.request-dialog')) menu.open = false;
});
document.addEventListener('focusin', event => {
  if (menu.open && !bar.contains(event.target) && !event.target.closest('.request-dialog')) menu.open = false;
});
// A closed desktop menu must not reopen when the window narrows again.
matchMedia('(max-width:980px)').addEventListener('change', () => {menu.open = false;});
compactLayout.addEventListener('change', () => {menu.open = false;});
if (scene) {
  document.documentElement.classList.add('field-ready');
  const opening = scene.closest('.work-opening');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const frame = scene.querySelector('.work-frame');
  const heading = scene.querySelector('.work-heading');
  const caption = scene.querySelector('.work-bottom');
  const overlay = scene.querySelector('.work-overlay');
  const photo = scene.querySelector('.work-photo');
  const artwork = frame.querySelectorAll('picture img');
  const services = opening.querySelector('.field-services');
  const clamp = value => Math.max(0, Math.min(value, 1));
  const smooth = t => t * t * (3 - 2 * t);
  const release = .52;
  let unit = innerHeight;
  let layoutWidth = innerWidth;
  let lastPaintY = scrollY;
  let frameHeight = frame.offsetHeight;
  let barHeight = bar.offsetHeight;
  let origin = 0;
  let previousDistance = NaN;
  let driver;
  let raf = 0;


  // Keep the accessible link intact while its visual letters roll on hover.
  for (const link of document.querySelectorAll('.footer-nav a, .closing-actions a')) {
    const label = link.textContent.trim();
    const visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    let index = 0;
    for (const word of label.split(/\s+/)) {
      if (visual.childNodes.length) visual.append(' ');
      const group = document.createElement('span');
      group.className = 'roll-word';
      for (const letter of word) {
        const mask = document.createElement('span');
        mask.className = 'roll-mask';
        const glyph = document.createElement('span');
        glyph.className = 'roll-glyph';
        glyph.textContent = letter;
        glyph.dataset.glyph = letter;
        glyph.style.setProperty('--step', Math.min(index++, 12));
        mask.append(glyph);
        group.append(mask);
      }
      visual.append(group);
    }
    link.setAttribute('aria-label', label);
    link.classList.add('roll-link');
    link.replaceChildren(visual);
  }

  const track = services.querySelector('.service-sequence');
  const stage = track.querySelector('.service-stage');
  const cards = [...stage.querySelectorAll('.service-spread')];
  const photos = cards.map(card => card.querySelector('.spread-image'));
  const panels = cards.map(card => card.querySelector('.service-content'));
  const terms = document.querySelector('.terms-strip');

  // Keep the server's tariff as the accessible value. Only its visual copy counts.
  const counters = new Map();
  if ('IntersectionObserver' in window) {
    for (const cell of terms.querySelectorAll('dd')) {
      const parts = cell.textContent.trim().match(/^([\d\s]+(?:,\d+)?)(\s+[ч₽])$/u);
      if (!parts) continue;
      const digits = parts[1].replace(/\s/g, '');
      const precision = digits.split(',')[1]?.length || 0;
      const target = Number(digits.replace(',', ''));
      if (!Number.isSafeInteger(target) || target <= 0) continue;
      const format = new Intl.NumberFormat('ru-RU', {
        useGrouping: true, minimumFractionDigits: precision, maximumFractionDigits: precision
      });
      const number = document.createElement('span');
      number.className = 'tariff-number';
      const exact = document.createElement('span');
      exact.textContent = parts[1];
      const output = document.createElement('span');
      output.className = 'tariff-count';
      output.setAttribute('aria-hidden', 'true');
      number.append(exact, output);
      cell.replaceChildren(number, parts[2]);
      counters.set(cell, {number, output, target, format, divisor: 10 ** precision, start: null, played: false});
    }
  }

  const counterObserver = counters.size ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const counter = counters.get(entry.target);
      // A tariff crossed on the way down stays settled for this document,
      // including a fast pass that put it above the viewport before it counted.
      if (!entry.isIntersecting) {
        if (entry.rootBounds && entry.boundingClientRect.bottom <= entry.rootBounds.top) counter.played = true;
        counter.start = null;
        counter.number.classList.remove('is-counting');
        if (counter.played) counterObserver.unobserve(entry.target);
      } else if (!motion.matches && !counter.played && entry.intersectionRatio >= .5) {
        counter.played = true;
        if (entry.rootBounds && entry.boundingClientRect.top <= entry.rootBounds.top) continue;
        counter.start = performance.now();
        counter.output.textContent = counter.format.format(0);
        counter.number.classList.add('is-counting');
        schedule();
      }
    }
  }, {threshold: [0, .5]}) : null;

  function drawCounters(time) {
    let running = false;
    for (const counter of counters.values()) {
      if (counter.start === null) continue;
      const progress = clamp((time - counter.start) / 1650);
      if (progress === 1) {
        counter.number.classList.remove('is-counting');
        counter.start = null;
      } else {
        const value = Math.floor(counter.target * (1 - (1 - progress) ** 1.5));
        const label = counter.format.format(value / counter.divisor);
        if (counter.output.textContent !== label) counter.output.textContent = label;
        running = true;
      }
    }
    return running;
  }

  let gallery;
  let lastGalleryProgress;
  let movingFocus = false;

  function measureServices() {
    const staged = !motion.matches && !compactLayout.matches && cards.length === 2;
    const width = track.clientWidth;
    const stacked = width < 600;
    track.classList.toggle('is-staged', staged);
    track.classList.toggle('is-stacked', staged && stacked);
    // Measure at the staged column width before deciding whether the two
    // articles can share a screen without clipping their calls to action.
    const copyHeight = staged ? Math.ceil(Math.max(...panels.map(panel => panel.offsetHeight))) : 0;
    const room = Math.min(unit * .90, 960);
    const needed = stacked ? copyHeight + Math.min(175, width * .52) + 24 : copyHeight + 82;
    if (!staged || needed > room) {
      track.classList.remove('is-staged', 'is-stacked');
      gallery = undefined;
      for (const panel of panels) {
        panel.inert = false;
        panel.style.removeProperty('opacity');
        panel.style.removeProperty('visibility');
      }
      for (const photo of photos) photo.style.removeProperty('transform');
      return;
    }

    // In the two-column layout the image reaches its width limit before
    // the stage reaches its height limit. Trim that unused vertical space.
    const columnHeight = Math.min(width * .77, Math.max(width * .54 + 48, width - 270));
    const height = stacked
      ? Math.max(needed, Math.min(room, copyHeight + width * .94 + 24))
      : Math.max(needed, Math.min(room, columnHeight));
    const band = stacked ? height - copyHeight - 24 : height;
    const imgHeight = Math.min(band * .92, width * (stacked ? .82 : .54));
    const imgWidth = stacked ? Math.min(width * .69, imgHeight * 1.22) : Math.min(width * .40, imgHeight * .86);
    const imgX = width * (stacked ? .149 : .126);
    const imgY = (band - imgHeight) / 2;
    const scrollBand = stacked ? band : Math.max(needed, Math.min(room, width * .77));
    const geometry = {'--stage-height': height, '--photo-band': band, '--image-width': imgWidth,
      '--image-height': imgHeight, '--image-x': imgX, '--image-y': imgY,
      '--stage-run': Math.min(unit * .71, Math.max(unit * .62, scrollBand * .94))};
    for (const [name, value] of Object.entries(geometry)) track.style.setProperty(name, value + 'px');

    const top = terms.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(services).paddingBottom) - track.offsetHeight;
    const start = top - parseFloat(getComputedStyle(stage).top);
    gallery = {start, run: track.offsetHeight - stage.offsetHeight, imgX, imgY, imgWidth, imgHeight, width};
    lastGalleryProgress = undefined;
  }

  function drawServices() {
    if (!gallery) return;
    const {start, run, imgX, imgY, imgWidth, imgHeight, width} = gallery;
    const p = clamp((scrollY - start) / run);
    if (p === lastGalleryProgress) return;
    lastGalleryProgress = p;

    // The outgoing image contracts toward the upper left while the next
    // grows from the baseline. The remaining thumbnail then clears the top.
    const slide = smooth(clamp((p - .16) / .68));
    const thumb = .21;
    const gap = width * .012;
    const exit = smooth(clamp((p - .78) / .18));
    const outgoingScale = (1 - (1 - thumb) * slide) * (1 - exit);
    const lift = imgY * slide + (thumb * imgHeight + 2) * exit;
    photos[0].style.transform = `translate(${-imgX * slide}px, ${-lift}px) scale(${outgoingScale})`;
    photos[1].style.transform = `translateX(${(imgWidth + gap) * (1 - slide)}px) scale(${thumb + (1 - thumb) * slide})`;

    // Change captions as the incoming photo takes over the frame.
    const handoff = .435;
    const opacities = [
      1 - smooth(clamp((p - .34) / (handoff - .34))),
      smooth(clamp((p - handoff) / (.53 - handoff)))
    ];
    panels.forEach((panel, index) => {
      const opacity = opacities[index];
      const unavailable = opacity < .5;
      if (unavailable && panel.contains(document.activeElement)) {
        movingFocus = true;
        stage.focus({preventScroll: true});
        movingFocus = false;
      }
      panel.inert = unavailable;
      panel.style.opacity = opacity.toFixed(4);
      panel.style.visibility = opacity <= .0001 ? 'hidden' : 'visible';
    });
  }

  function cancelGlide() {
    if (driver?.isScrolling === 'smooth') driver.scrollTo(scrollY, {immediate: true, force: true});
  }

  function measure() {
    cancelGlide();
    const newUnit = innerHeight;
    const newFrame = frame.offsetHeight;
    const distance = -opening.getBoundingClientRect().top;
    origin = scrollY - distance;
    const oldRun = release * unit;
    const newRun = release * newUnit;
    let target = distance;
    if (!motion.matches && distance > 0) {
      if (distance <= oldRun) target = distance * newUnit / unit;
      else if (distance < oldRun + frameHeight) target = newRun + (distance - oldRun) * newFrame / frameHeight;
    }
    const oldGallery = gallery;
    // Native scroll anchoring may already have moved scrollY in the new
    // layout. Map the position painted in the preceding viewport instead.
    const resizing = newUnit !== unit || innerWidth !== layoutWidth;
    const oldDistance = resizing ? lastPaintY - origin : distance;
    layoutWidth = innerWidth;
    unit = newUnit;
    frameHeight = newFrame;
    barHeight = bar.offsetHeight;
    opening.style.setProperty('--run', newRun + 'px');
    measureServices();
    if (oldGallery && gallery && oldDistance >= oldGallery.start - 1 && oldDistance <= oldGallery.start + oldGallery.run + 1) {
      const p = clamp((oldDistance - oldGallery.start) / oldGallery.run);
      target = gallery.start + p * gallery.run;
    }
    const targetY = origin + target;
    if (Math.abs(targetY - scrollY) > 1) window.scrollTo({top: targetY, behavior: 'instant'});
    driver?.resize();
    previousDistance = NaN;
    paint();
  }

  // Cubic joins preserve the measured midpoint and the speed there. The last
  // part brakes the wipe as the services surface starts to cover the drawing.
  function photoReveal(travel) {
    const start = .15, join = .305, brake = .45, slope = 1 / .436;
    const linear = (travel - .084) * slope;
    if (travel < join) {
      const u = clamp((travel - start) / (join - start));
      return (join - .084) * slope * smooth(u) + (join - start) * slope * u * u * (u - 1);
    }
    if (travel < brake) return linear;
    const initial = (brake - .084) * slope;
    const u = clamp((travel - brake) / (release - brake));
    return initial + (1 - initial) * smooth(u) + (release - brake) * slope * u * (1 - u) ** 2;
  }

  function paint() {
    if (innerWidth !== layoutWidth || innerHeight !== unit) {
      measure();
      return;
    }
    lastPaintY = scrollY;
    drawServices();
    const distance = Math.max(0, Math.min(scrollY - origin, (1 + release) * unit));
    if (distance === previousDistance) return;
    previousDistance = distance;
    if (motion.matches) {
      bar.classList.toggle('solid', distance >= frameHeight - barHeight - 8);
      return;
    }
    const travel = distance / unit;
    const titleExit = smooth(clamp((travel - .064) / .073));
    const captionExit = smooth(clamp((travel - .075) / .067));
    // The type starts travelling while still opaque. Its translation and
    // opacity are independent functions of the same actual scroll position.
    const sliding = Math.max(0, Math.min(.145, travel) - .006);
    const drift = unit * (sliding - .012 * (1 - Math.exp(-sliding / .012)));
    const navTravel = .055 * unit;
    const lift = smooth(clamp(distance / navTravel)) * Math.max(0, barHeight - navTravel);
    bar.style.setProperty('--nav-lift', -lift + 'px');
    overlay.style.setProperty('--copy', (1 - titleExit).toFixed(5));
    heading.style.setProperty('--title-shift', (1.37 * drift).toFixed(3) + 'px');
    caption.style.setProperty('--caption-shift', (.68 * drift).toFixed(3) + 'px');
    caption.style.setProperty('--caption', (1 - captionExit).toFixed(5));

    // Settle both registered images into their original framing before the wipe.
    const approach = 1 - smooth(clamp(travel / .137));
    const camera = 'translate3d(0,' + (-unit * .007 * approach).toFixed(3) + 'px,0) scale(' + (1 + .016 * approach).toFixed(5) + ')';
    for (const image of artwork) image.style.transform = camera;
    photo.style.setProperty('--wipe', (100 * photoReveal(travel)).toFixed(3) + '%');
    services.style.setProperty('--remaining-run', Math.max(0, release * unit - distance) + 'px');
    scene.classList.toggle('faded', captionExit === 1);
  }

  function tick(time) {
    raf = 0;
    driver?.raf(time);
    paint();
    const counting = drawCounters(time);
    if (counting || driver?.isScrolling === 'smooth') schedule();
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function onInput(input) {
    const {deltaX, deltaY, event} = input;
    if (event.type !== 'wheel' || event.ctrlKey || event.metaKey || event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY)) return false;
    // Prime Lenis's clock after idle so a new gesture cannot consume the
    // entire time since the preceding gesture as its first animation step.
    if (!raf) driver.raf(performance.now());
    schedule();
  }

  function configure() {
    cancelAnimationFrame(raf);
    raf = 0;
    counterObserver?.disconnect();
    for (const [cell, counter] of counters) {
      counter.start = null;
      counter.number.classList.remove('is-counting');
      if (!motion.matches && !counter.played) counterObserver.observe(cell);
    }
    driver?.destroy();
    driver = undefined;
    document.documentElement.classList.toggle('scroll-scene', !motion.matches);
    scene.classList.remove('faded');
    bar.classList.remove('solid');
    if (!motion.matches && window.Lenis) {
      driver = new window.Lenis({
        lerp: .1, wheelMultiplier: .65, gestureOrientation: 'vertical',
        syncTouch: false, autoRaf: false, anchors: false,
        prevent: node => node.matches?.('.menu[open],select,textarea,[data-lenis-prevent]'),
        virtualScroll: onInput
      });
    } else {
      for (const image of artwork) image.style.removeProperty('transform');
      overlay.style.removeProperty('--copy');
      photo.style.removeProperty('--wipe');
    }
    measure();
  }

  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', measure);
  compactLayout.addEventListener('change', measure);
  // Before script enhancement Chromium can attempt to restore a position in
  // the longer, static article layout. Remember only this tab's service phase.
  const restoreKey = 'specteh-service-view';
  let userMoved = false;
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    addEventListener(type, () => {userMoved = true;}, {once: true, passive: true, capture: true});
  }
  addEventListener('pagehide', () => {
    try {
      sessionStorage.removeItem(restoreKey);
      if (!gallery) return;
      const offset = scrollY - gallery.start;
      if (offset < -1 || offset > gallery.run + 1) return;
      sessionStorage.setItem(restoreKey, JSON.stringify({progress: clamp(offset / gallery.run)}));
    } catch { /* Tab storage can be disabled. Native restoration still works. */ }
  });
  addEventListener('pageshow', async event => {
    measure();
    let saved;
    try {
      saved = JSON.parse(sessionStorage.getItem(restoreKey));
      sessionStorage.removeItem(restoreKey);
    } catch { return; }
    if (!saved || event.persisted || performance.getEntriesByType('navigation')[0]?.type !== 'reload') return;
    await document.fonts.ready;
    requestAnimationFrame(() => {
      if (userMoved || !gallery || !Number.isFinite(saved.progress)) return;
      const p = clamp(saved.progress);
      scrollTo({top: gallery.start + p * gallery.run, behavior: 'instant'});
      paint();
    });
  });
  addEventListener('pointerdown', cancelGlide, {passive: true});
  document.addEventListener('focusin', event => {
    if (movingFocus) return;
    cancelGlide();

  });
  document.addEventListener('keydown', event => {
    if (['Home','End','PageUp','PageDown','ArrowUp','ArrowDown',' ','Tab','Enter'].includes(event.key)) cancelGlide();
  });
  addEventListener('hashchange', cancelGlide);
  motion.addEventListener('change', configure);
  configure();

  document.fonts?.ready.then(measure);
}
