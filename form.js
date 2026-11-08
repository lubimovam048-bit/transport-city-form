/* Registration form over the living scene: scaling, validation, date mask, autosave, pause. */
(() => {
  const form = document.getElementById('profileForm');
  const scaleBox = document.querySelector('.form-scale');
  const pauseBtn = document.getElementById('scenePause');
  const KEY = 'transport-future-profile-draft';

/* desktop: the Figma card (860 x 560), centred, at about 86% and never wider than ~54% of the
     window, so the moving city still shows around it and the text stays readable */
  const welcomeBox = document.querySelector('.welcome-scale');
  /* phones: the half-width fields get short example placeholders (Иван…) instead of «Введите имя» */
  const shortPh = [...document.querySelectorAll('input[data-short]')].map(i => [i, i.placeholder, i.dataset.short]);
  function fit(){
    const phone = matchMedia('(max-width: 720px)').matches;
    shortPh.forEach(([i, long, short]) => { i.placeholder = phone ? short : long; });
    if (phone){
      scaleBox.style.removeProperty('--k'); welcomeBox.style.removeProperty('--k'); return;
    }
    const k = Math.min(.86, innerWidth * .54 / 860, (innerHeight - 48) / 800);
    scaleBox.style.setProperty('--k', Math.max(.55, k).toFixed(3));
    /* the welcome card is 458 high plus ~200 of beaver above it */
    const kw = Math.min(.86, innerWidth * .54 / 860, (innerHeight - 48) / 620);
    welcomeBox.style.setProperty('--k', Math.max(.5, kw).toFixed(3));
  }
  addEventListener('resize', fit, {passive: true});
  fit();

  /* date: digits only, dots added as you type → ДД.ММ.ГГГГ */
  const birth = form.elements.birth;
  birth.addEventListener('input', () => {
    const d = birth.value.replace(/\D/g, '').slice(0, 8);
    birth.value = [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('.');
  });
  function validDate(v){
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v); if (!m) return false;
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    const dt = new Date(y, mo - 1, d);
    const now = new Date();
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d && y >= 1900 && dt <= now;
  }

  function check(field, show){
    const input = field.querySelector('input');
    const v = input.value.trim();
    const ok = field.dataset.kind === 'date' ? validDate(v) : v.length >= 2;
    field.classList.toggle('is-valid', !!v && ok);   /* the tick shows only on filled, correct fields */
    if (show) field.classList.toggle('is-error', field.hasAttribute('data-required') && !ok);
    else if (ok) field.classList.remove('is-error');
    return ok || !field.hasAttribute('data-required');
  }
  const fields = [...form.querySelectorAll('.wf-field')];

  /* autosave: the draft lives in this browser only (no server in this prototype) */
  function save(){
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(new FormData(form)))); } catch(e) {}
  }
  try {
    const draft = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (draft) for (const [k, v] of Object.entries(draft)) if (form.elements[k]) form.elements[k].value = v;
  } catch(e) {}
  fields.forEach(f => check(f, false));

  form.addEventListener('input', e => {
    const field = e.target.closest('.wf-field');
    if (field) check(field, false);
    save();
  });
  form.addEventListener('focusout', e => {
    const field = e.target.closest('.wf-field');
    if (field && e.target.value) check(field, true);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const results = fields.map(f => check(f, true));
    if (results.every(Boolean)){
      save();
      /* the next steps are not designed yet: confirm the step and move the counter on */
      document.getElementById('stepNum').textContent = '02';
      const stops = form.querySelectorAll('.wf-stop'); stops[1] && stops[1].classList.add('is-active');
      form.querySelector('.wf-button__label').textContent = 'Сохранено';
      setTimeout(() => { form.querySelector('.wf-button__label').textContent = 'Далее'; }, 1800);
    } else {
      const first = fields.find((f, i) => !results[i]);
      first && first.querySelector('input').focus();
    }
  });

  /* welcome screen → form */
  const welcome = document.getElementById('welcome');
  const formLayer = document.getElementById('formLayer');
  function openForm(animate){
    const show = () => {
      welcome.hidden = true;
      formLayer.hidden = false;
      if (animate) formLayer.classList.add('is-entering');
      const first = form.querySelector('input');
      if (animate && first && !matchMedia('(max-width: 720px)').matches) first.focus({preventScroll:true});
    };
    if (!animate) return show();
    welcome.classList.add('is-leaving');
    setTimeout(show, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320);
  }
  document.getElementById('welcomeGo').addEventListener('click', () => {
    try { sessionStorage.setItem('transport-future-welcomed', '1'); } catch(e) {}
    openForm(true);
  });
  try { if (sessionStorage.getItem('transport-future-welcomed')) openForm(false); } catch(e) {}

  /* pause / resume the scene animation */
  pauseBtn.addEventListener('click', () => {
    const scene = window.cityScene;
    if (!scene) return;
    const paused = !scene.paused;
    paused ? scene.pause() : scene.resume();
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.setAttribute('aria-label', paused ? 'Запустить анимацию фона' : 'Остановить анимацию фона');
  });
})();
