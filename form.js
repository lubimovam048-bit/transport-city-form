/* Registration over the living scene: welcome screen, step-by-step profile form
   (Figma 215:23340: steps 01–10; 04 is not designed), masks, validation, autosave, pause. */
(() => {
  const form = document.getElementById('profileForm');
  const wform = document.getElementById('wform');
  const scaleBox = document.querySelector('.form-scale');
  const welcomeBox = document.querySelector('.welcome-scale');
  const pauseBtn = document.getElementById('scenePause');
  const backBtn = document.getElementById('backBtn');
  const nextLabel = form.querySelector('.wf-button__label');
  const stepNum = document.getElementById('stepNum');
  const progress = document.getElementById('progress');
  const stops = [...progress.children];
  const guideImg = document.getElementById('guideImg');
  const guideText = document.getElementById('guideText');
  const KEY = 'transport-future-profile-draft';
  const phone = () => matchMedia('(max-width: 720px)').matches;

  /* ---------- steps ----------
     n: number on the badge; beaver: picture and its place over the card (Figma, px from the card's top-left);
     qx: where the speech bubble starts; no img = no beaver on that step. Step 04 is not designed yet. */
  const STEPS = {
    '1':  { n: 1, img: 'beaver-form',  w: 218, h: 248, x: 321, y: -226, qx: 128, say: 'Я&nbsp;– КРУТЯ, буду вашим проводником. Давайте знакомиться!' },
    '2':  { n: 2, img: 'beaver-globe', w: 221, h: 250, x: 320, y: -232, qx: 120, say: 'Откуда вы к нам?<br>Укажите гражданство' },
    '3a': { n: 3, img: 'beaver-snils', w: 221, h: 250, x: 320, y: -232, qx: 127, say: 'Ищем 11 цифр на зелёной карточке или в Госуслугах' },
    '3b': { n: 3, img: 'beaver-globe', w: 221, h: 250, x: 320, y: -232, qx: 120, say: 'Откуда вы к нам?<br>Укажите гражданство' },
    '5':  { n: 5, img: 'beaver-book',  w: 221, h: 250, x: 284, y: -231, qx: 75,  say: 'Расскажите, где вы учитесь. Мне правда интересно!' },
    '6':  { n: 6, img: 'beaver-globe', w: 221, h: 250, x: 320, y: -232, qx: 120, say: 'В какой стране вы&nbsp;учитесь?' },
    '7':  { n: 7, img: 'beaver-phone', w: 224, h: 250, x: 318, y: -231, qx: 119, say: 'Куда звонить, чтобы с&nbsp;вами связаться?' },
    '8':  { n: 8, img: 'beaver-mail',  w: 221, h: 250, x: 320, y: -233, qx: 129, say: 'Укажите адрес:<br>вдруг приз поедет к&nbsp;вам!' },
    '9':  { n: 9, img: 'beaver-scroll', w: 282, h: 250, x: 289, y: -230, qx: 173, qy: -260, say: 'Почитайте документы согласия, я&nbsp;вас подожду' },
    '10': { n: 10, img: 'beaver-loupe', w: 230, h: 250, x: 315, y: -232, qx: 131, say: 'Давайте проверим каждую букву, чтобы избежать ошибок' },
    'done': { n: 10, img: 'beaver-welcome', w: 372, h: 248, x: 244, y: -231, qx: -999, say: '' },
  };
  const order = () => ['1', '2', form.elements.citizenship.value === 'other' ? '3b' : '3a', '5', '6', '7', '8', '9', '10'];
  const panels = Object.fromEntries([...form.querySelectorAll('.wf-panel')].map(p => [p.dataset.step, p]));
  let current = '1';

  /* preload the beaver poses so swapping never flashes */
  new Set(Object.values(STEPS).map(s => s.img).filter(Boolean)).forEach(n => { const i = new Image(); i.src = `assets/form/${n}.webp`; });

  function placeGuide(st){
    wform.classList.toggle('no-guide', !st.img);
    wform.classList.toggle('no-bubble', !st.say);
    if (!st.img) return;
    const g = wform.style;
    g.setProperty('--bx', st.x + 'px'); g.setProperty('--by', st.y + 'px');
    g.setProperty('--bw', st.w + 'px'); g.setProperty('--bh', st.h + 'px');
    g.setProperty('--qx', st.qx + 'px'); g.setProperty('--qy', (st.qy ?? st.y + 7) + 'px');
    guideImg.src = `assets/form/${st.img}.webp`;
    guideImg.width = st.w; guideImg.height = st.h;
    guideText.innerHTML = st.say;
  }

  function show(key, animate){
    const st = STEPS[key];
    Object.entries(panels).forEach(([k, p]) => { p.hidden = k !== key; p.classList.remove('is-entering'); });
    if (animate){ void panels[key].offsetWidth; panels[key].classList.add('is-entering'); }
    stepNum.textContent = String(st.n).padStart(2, '0');
    document.getElementById('stepBadge').setAttribute('aria-label', `Шаг ${st.n} из 10`);
    stops.forEach((s, i) => s.classList.toggle('is-active', i < st.n));
    progress.style.setProperty('--done', st.n - 1);
    backBtn.hidden = key === '1' || key === '10' || key === 'done';
    nextLabel.textContent = key === '10' ? 'Все верно' : 'Далее';
    form.querySelector('.wf-footer').hidden = key === 'done';
    if (key === '10') fillReview();
    if (animate && current !== key){
      wform.classList.add('is-swapping');
      setTimeout(() => { placeGuide(st); wform.classList.remove('is-swapping'); }, 180);
    } else placeGuide(st);
    current = key;
    try { localStorage.setItem(KEY + ':step', key); } catch(e) {}
  }

  /* ---------- 10 · review: what was entered, each card leads back to its step ---------- */
  const E = form.elements;
  const val = n => (E[n] && E[n].value || '').trim();
  const settlementPrefix = { 'Город': 'г. ', 'Посёлок городского типа': 'пгт ', 'Посёлок': 'пос. ', 'Село или деревня': 'с. ' };
  function fillReview(){
    const phoneDigits = val('phone').replace(/\D/g, '');
    const phoneText = val('phoneCode') === '+7' && phoneDigits.length === 10
      ? `+7 (${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)} ${phoneDigits.slice(6, 8)} ${phoneDigits.slice(8)}`
      : `${val('phoneCode')} ${val('phone')}`;
    const owner = E.phoneOwner.value === 'representative' ? 'телефон представителя' : 'мой телефон';
    const zip = val('zip').replace(/\D/g, '');
    const ru = E.citizenship.value !== 'other';
    const values = {
      personal: [val('surname'), val('name'), val('patronymic'), val('birth')].filter(Boolean).join(' '),
      citizenship: ru ? 'Россия' : val('citizenshipCountry'),
      snils: val('snils').replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1 $2 $3 $4'),
      study: [val('studyCountry'), (settlementPrefix[val('settlementType')] || '') + val('settlement'), val('school'), val('grade')].filter(Boolean).join(', '),
      phone: `${phoneText} (${owner})`,
      mail: `ФИО: ${val('recipient')}\n${val('address')}${zip ? ', ' + zip : ''}`,
      consent: E.consentRead.checked ? 'Образцы прочитаны' : 'Не отмечено',
    };
    form.querySelectorAll('[data-review]').forEach(b => {
      b.querySelector('.wf-review__value').textContent = values[b.dataset.review];
      b.closest('li').hidden = b.dataset.review === 'snils' && !ru;
    });
  }
  let editing = false;                   /* came from the review: «Далее» goes straight back to it */
  form.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
    let key = b.dataset.goto;
    if (key === '3') key = E.citizenship.value === 'other' ? '3b' : '3a';
    editing = true;
    show(key, true);
  }));

  /* ---------- masks ---------- */
  const digits = (v, n) => v.replace(/\D/g, '').slice(0, n);
  const masks = {
    birth: v => { const d = digits(v, 8); return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('.'); },
    snils: v => { const d = digits(v, 11); return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)].filter(Boolean).join('-'); },
    zip: v => { const d = digits(v, 6); return [d.slice(0, 3), d.slice(3)].filter(Boolean).join('-'); },
    phone: v => {
      if (form.elements.phoneCode.value !== '+7') return v.replace(/[^\d\s-]/g, '').slice(0, 16);
      const d = digits(v, 10); return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8)].filter(Boolean).join('-');
    },
  };
  ['birth', 'snils', 'phone', 'zip'].forEach(name => {
    const el = form.elements[name];
    el.addEventListener('input', () => { el.value = masks[name](el.value); });
  });
  form.elements.phoneCode.addEventListener('change', () => {
    document.querySelector('.wf-input--code').classList.toggle('is-ru', form.elements.phoneCode.value === '+7');
    form.elements.phone.value = masks.phone(form.elements.phone.value);
  });

  /* names (ТЗ 3): capital first letter of every part, no CAPS, single spaces; hyphens kept */
  const properCase = v => v.replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
  ['name', 'patronymic', 'surname', 'recipient'].forEach(n => {
    E[n].addEventListener('blur', () => { if (E[n].value) { E[n].value = properCase(E[n].value); save(); } });
  });

  /* ---------- validation ---------- */
  function validDate(v){
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v); if (!m) return false;
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d && y >= 1900 && dt <= new Date();
  }
  function validSnils(v){
    const d = v.replace(/\D/g, ''); if (d.length !== 11) return false;
    const num = d.slice(0, 9), ctrl = +d.slice(9);
    if (+num <= 1001998) return true;                       /* old numbers have no checksum */
    let sum = 0; for (let i = 0; i < 9; i++) sum += +num[i] * (9 - i);
    let c = sum % 101; if (c === 100) c = 0;
    return c === ctrl;
  }
  function validPhone(v){
    const n = v.replace(/\D/g, '').length;
    return form.elements.phoneCode.value === '+7' ? n === 10 : n >= 6 && n <= 12;
  }
  function check(field, show){
    const kind = field.dataset.kind;
    let v, ok;
    if (kind === 'radio' || kind === 'check'){ ok = !!field.querySelector('input:checked'); v = ok; }
    else {
      const el = field.querySelector('input, select');
      v = el.value.trim();
      const name = el.name;
      ok = kind === 'date' ? validDate(v) : name === 'snils' ? validSnils(v) : name === 'phone' ? validPhone(v)
         : name === 'zip' ? v.replace(/\D/g, '').length === 6
         : kind === 'select' ? !!v : v.length >= 2;
    }
    if (kind !== 'radio' && kind !== 'select' && kind !== 'check') field.classList.toggle('is-valid', !!v && ok);
    if (show) field.classList.toggle('is-error', field.hasAttribute('data-required') && !ok);
    else if (ok) field.classList.remove('is-error');
    return ok || !field.hasAttribute('data-required');
  }
  const fieldsOf = key => [...panels[key].querySelectorAll('.wf-field')];

  /* ---------- autosave (this browser only; no server in this prototype) ---------- */
  function save(){
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(new FormData(form)))); } catch(e) {}
  }
  try {
    const draft = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (draft) for (const [k, v] of Object.entries(draft)){
      const el = form.elements[k]; if (!el) continue;
      if (el instanceof RadioNodeList) [...el].forEach(r => { r.checked = r.value === v; });
      else if (el.type === 'checkbox') el.checked = true;      /* FormData keeps only ticked boxes */
      else el.value = v;
    }
    document.querySelector('.wf-input--code').classList.toggle('is-ru', form.elements.phoneCode.value === '+7');
  } catch(e) {}
  Object.keys(panels).forEach(k => fieldsOf(k).forEach(f => check(f, false)));

  form.addEventListener('input', e => { const f = e.target.closest('.wf-field'); if (f) check(f, false); save(); });
  form.addEventListener('change', e => { const f = e.target.closest('.wf-field'); if (f) check(f, false); save(); });
  /* 02 · a click on «Россия» / «Другое гражданство» goes straight to the next step
     (click, not change: re-picking the same answer after «Назад» also moves on) */
  let autoNext = 0;
  [...form.elements.citizenship].forEach(r => r.addEventListener('click', () => {
    if (current !== '2') return;
    clearTimeout(autoNext);
    autoNext = setTimeout(() => { if (current === '2') form.requestSubmit(); }, 280);   /* let the card show it is picked */
  }));
  /* 07 · picking whose phone it is: with a valid number already typed, go on; otherwise jump into the number field */
  [...form.elements.phoneOwner].forEach(r => r.addEventListener('click', () => {
    if (current !== '7') return;
    clearTimeout(autoNext);
    autoNext = setTimeout(() => {
      if (current !== '7') return;
      if (validPhone(form.elements.phone.value)) form.requestSubmit();
      else form.elements.phone.focus({preventScroll: phone()});
    }, 280);
  }));
  form.addEventListener('focusout', e => {
    const f = e.target.closest('.wf-field');
    if (f && e.target.value && f.dataset.kind !== 'radio' && f.dataset.kind !== 'check') check(f, true);
  });

  /* ---------- navigation ---------- */
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fs = fieldsOf(current);
    const results = fs.map(f => check(f, true));
    if (!results.every(Boolean)){
      const bad = fs[results.indexOf(false)];
      const el = bad && bad.querySelector('input, select');
      el && el.focus({preventScroll: phone()});
      return;
    }
    save();
    const seq = order(), i = seq.indexOf(current);
    if (current === '2' && editing){ editing = false; return show(seq[2], true); }   /* new citizenship → its step 03 first */
    if (editing && current !== '10'){ editing = false; return show('10', true); }
    if (i < seq.length - 1) return show(seq[i + 1], true);
    /* «Все верно»: the profile is complete (the next screen is not designed yet) */
    try { localStorage.setItem(KEY + ':done', new Date().toISOString()); } catch(e) {}
    show('done', true);
  });
  backBtn.addEventListener('click', () => {
    if (editing){ editing = false; return show('10', true); }
    const seq = order(), i = seq.indexOf(current);
    if (i > 0) show(seq[i - 1], true);
  });

  /* ---------- scaling ---------- */
  const shortPh = [...form.querySelectorAll('[data-short] input')].map(i => [i, i.placeholder, i.closest('[data-short]').dataset.short]);
  function fit(){
    const p = phone();
    shortPh.forEach(([i, long, short]) => { i.placeholder = p ? short : long; });
    if (p){ scaleBox.style.removeProperty('--k'); welcomeBox.style.removeProperty('--k'); return; }
    /* the tallest step: card 618 + beaver 232 above it */
    const k = Math.min(.86, innerWidth * .54 / 860, (innerHeight - 48) / 860);
    scaleBox.style.setProperty('--k', Math.max(.5, k).toFixed(3));
    const kw = Math.min(.86, innerWidth * .54 / 860, (innerHeight - 48) / 620);
    welcomeBox.style.setProperty('--k', Math.max(.5, kw).toFixed(3));
  }
  addEventListener('resize', fit, {passive: true});
  fit();

  /* ---------- welcome screen → form ---------- */
  const welcome = document.getElementById('welcome');
  const formLayer = document.getElementById('formLayer');
  let saved = '1';
  try { saved = localStorage.getItem(KEY + ':step') || '1'; } catch(e) {}
  show(STEPS[saved] && (order().includes(saved) || saved === 'done') ? saved : '1', false);

  /* consent samples */
  const dlg = document.getElementById('consentDlg');
  document.getElementById('consentOpen').addEventListener('click', () => {
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  });

  function openForm(animate){
    const go = () => {
      welcome.hidden = true;
      formLayer.hidden = false;
      if (animate) formLayer.classList.add('is-entering');
      const first = panels[current].querySelector('input:not([type=radio]), select');
      if (animate && first && !phone()) first.focus({preventScroll: true});
    };
    if (!animate) return go();
    welcome.classList.add('is-leaving');
    setTimeout(go, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320);
  }
  document.getElementById('welcomeGo').addEventListener('click', () => {
    try { sessionStorage.setItem('transport-future-welcomed', '1'); } catch(e) {}
    openForm(true);
  });
  try { if (sessionStorage.getItem('transport-future-welcomed')) openForm(false); } catch(e) {}

  /* ---------- pause / resume the scene animation ---------- */
  pauseBtn.addEventListener('click', () => {
    const scene = window.cityScene;
    if (!scene) return;
    const paused = !scene.paused;
    paused ? scene.pause() : scene.resume();
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.setAttribute('aria-label', paused ? 'Запустить анимацию фона' : 'Остановить анимацию фона');
  });
})();
