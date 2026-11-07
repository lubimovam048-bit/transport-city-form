/* Registration form over the living scene: scaling, validation, date mask, autosave, pause. */
(() => {
  const form = document.getElementById('profileForm');
  const scaleBox = document.querySelector('.form-scale');
  const pauseBtn = document.getElementById('scenePause');
  const KEY = 'transport-future-profile-draft';

/* desktop: the Figma card (860 x 560), centred, at about 72% and never wider than ~44% of the
     window, so plenty of the moving city shows around it */
  function fit(){
    if (matchMedia('(max-width: 720px)').matches){ scaleBox.style.removeProperty('--k'); return; }
    const k = Math.min(.72, innerWidth * .44 / 860, (innerHeight - 64) / 560);
    scaleBox.style.setProperty('--k', Math.max(.55, k).toFixed(3));
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
      form.querySelector('.wf-button__label').textContent = 'Сохранено';
      setTimeout(() => { form.querySelector('.wf-button__label').textContent = 'Продолжить'; }, 1800);
    } else {
      const first = fields.find((f, i) => !results[i]);
      first && first.querySelector('input').focus();
    }
  });

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
