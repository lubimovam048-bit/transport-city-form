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
    'done': { n: 10, img: 'beaver-project', w: 310, h: 350, x: 520, y: -262, qx: 380, qy: -245, say: 'Мне не&nbsp;терпится узнать про ваш проект!' },
  };
  const order = () => ['1', '2', form.elements.citizenship.value === 'other' ? '3b' : '3a', '5', '6', '7', '8', '9', '10'];
  const panels = Object.fromEntries([...form.querySelectorAll('.wf-panel')].map(p => [p.dataset.step, p]));
  let current = '1';
  let maxN = 1;                          /* the furthest step reached: dots up to it can be clicked */
  try { maxN = +localStorage.getItem(KEY + ':max') || 1; } catch(e) {}

  /* preload the beaver poses so swapping never flashes */
  new Set(Object.values(STEPS).map(s => s.img).filter(Boolean)).forEach(n => { const i = new Image(); i.src = `assets/form/${n}.webp`; });

  function placeGuide(st){
    wform.classList.toggle('no-guide', !st.img);
    wform.classList.toggle('is-project', st === STEPS.done);
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
    if (key !== 'done') maxN = Math.max(maxN, st.n);
    try { localStorage.setItem(KEY + ':max', maxN); } catch(e) {}
    stops.forEach((s, i) => {
      const n = i + 1, reach = key !== 'done' && n <= maxN && n !== st.n && !(n === 4 && st.n === 5);
      s.classList.toggle('is-active', i < st.n);
      s.classList.toggle('is-current', n === st.n && key !== 'done');
      s.classList.toggle('is-reachable', reach);
      s.tabIndex = reach ? 0 : -1;
      s.setAttribute('role', 'button');
      s.setAttribute('aria-label', `Шаг ${n}`);
      s.setAttribute('aria-disabled', String(!reach));
      if (n === st.n) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
    });
    progress.style.setProperty('--done', st.n - 1);
    backBtn.hidden = key === '1' || key === '10' || key === 'done';
    nextLabel.textContent = key === '10' ? 'Все верно' : 'Далее';
    form.querySelector('.wf-footer').hidden = key === 'done';
    form.classList.toggle('is-project', key === 'done');
    if (key === '10') fillReview();
    if (animate && current !== key){
      wform.classList.add('is-swapping');
      setTimeout(() => { placeGuide(st); wform.classList.remove('is-swapping'); }, 180);
    } else placeGuide(st);
    current = key;
    try { localStorage.setItem(KEY + ':step', key); } catch(e) {}
    if (typeof updateNext === 'function') updateNext();
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
    const owner = E.phoneOwner.value === 'representative'
      ? 'телефон представителя' + (val('repName') ? ': ' + val('repName') : '') : 'мой телефон';
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


  /* ---------- 03 · country of citizenship: searchable drop-down (Figma: field with a chevron) ---------- */
  const COUNTRIES = ['Абхазия', 'Австралия', 'Австрия', 'Азербайджан', 'Албания', 'Алжир', 'Ангола', 'Андорра', 'Антигуа и Барбуда', 'Аргентина', 'Армения', 'Афганистан', 'Багамские Острова', 'Бангладеш', 'Барбадос', 'Бахрейн', 'Беларусь', 'Белиз', 'Бельгия', 'Бенин', 'Болгария', 'Боливия', 'Босния и Герцеговина', 'Ботсвана', 'Бразилия', 'Бруней', 'Буркина-Фасо', 'Бурунди', 'Бутан', 'Вануату', 'Ватикан', 'Великобритания', 'Венгрия', 'Венесуэла', 'Восточный Тимор', 'Вьетнам', 'Габон', 'Гаити', 'Гайана', 'Гамбия', 'Гана', 'Гватемала', 'Гвинея', 'Гвинея-Бисау', 'Германия', 'Гондурас', 'Гренада', 'Греция', 'Грузия', 'Дания', 'Джибути', 'Доминика', 'Доминиканская Республика', 'Египет', 'Замбия', 'Зимбабве', 'Израиль', 'Индия', 'Индонезия', 'Иордания', 'Ирак', 'Иран', 'Ирландия', 'Исландия', 'Испания', 'Италия', 'Йемен', 'Кабо-Верде', 'Казахстан', 'Камбоджа', 'Камерун', 'Канада', 'Катар', 'Кения', 'Кипр', 'Киргизия', 'Кирибати', 'Китай', 'КНДР', 'Колумбия', 'Коморские Острова', 'Конго', 'Демократическая Республика Конго', 'Коста-Рика', 'Кот-д’Ивуар', 'Куба', 'Кувейт', 'Лаос', 'Латвия', 'Лесото', 'Либерия', 'Ливан', 'Ливия', 'Литва', 'Лихтенштейн', 'Люксембург', 'Маврикий', 'Мавритания', 'Мадагаскар', 'Малави', 'Малайзия', 'Мали', 'Мальдивы', 'Мальта', 'Марокко', 'Маршалловы Острова', 'Мексика', 'Микронезия', 'Мозамбик', 'Молдова', 'Монако', 'Монголия', 'Мьянма', 'Намибия', 'Науру', 'Непал', 'Нигер', 'Нигерия', 'Нидерланды', 'Никарагуа', 'Новая Зеландия', 'Норвегия', 'ОАЭ', 'Оман', 'Пакистан', 'Палау', 'Палестина', 'Панама', 'Папуа — Новая Гвинея', 'Парагвай', 'Перу', 'Польша', 'Португалия', 'Республика Корея', 'Руанда', 'Румыния', 'Сальвадор', 'Самоа', 'Сан-Марино', 'Сан-Томе и Принсипи', 'Саудовская Аравия', 'Северная Македония', 'Сейшельские Острова', 'Сенегал', 'Сент-Винсент и Гренадины', 'Сент-Китс и Невис', 'Сент-Люсия', 'Сербия', 'Сингапур', 'Сирия', 'Словакия', 'Словения', 'Соломоновы Острова', 'Сомали', 'Судан', 'Суринам', 'США', 'Сьерра-Леоне', 'Таджикистан', 'Таиланд', 'Танзания', 'Того', 'Тонга', 'Тринидад и Тобаго', 'Тувалу', 'Тунис', 'Туркменистан', 'Турция', 'Уганда', 'Узбекистан', 'Украина', 'Уругвай', 'Фиджи', 'Филиппины', 'Финляндия', 'Франция', 'Хорватия', 'ЦАР', 'Чад', 'Черногория', 'Чехия', 'Чили', 'Швейцария', 'Швеция', 'Шри-Ланка', 'Эквадор', 'Экваториальная Гвинея', 'Эритрея', 'Эсватини', 'Эстония', 'Эфиопия', 'ЮАР', 'Южная Осетия', 'Южный Судан', 'Ямайка', 'Япония', 'Лицо без гражданства'];
  /* the most frequent ones for the contest first, then the rest A–Я */
  const TOP = ['Беларусь', 'Казахстан', 'Узбекистан', 'Киргизия', 'Таджикистан', 'Армения', 'Азербайджан', 'Туркменистан', 'Молдова', 'Абхазия', 'Южная Осетия'];
  const ORDERED = [...TOP, ...COUNTRIES.filter(c => !TOP.includes(c))];
  const norm = v => v.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  const findCountry = v => COUNTRIES.find(c => norm(c) === norm(v));
  const combo = document.querySelector('.wf-combo');
  const cInput = form.elements.citizenshipCountry;
  const cList = document.getElementById('countryOptions');
  let cItems = [], cActive = -1;
  const esc = t => t.replace(/[&<>]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[ch]));
  function renderCountries(all){
    const q = all ? '' : norm(cInput.value);
    cItems = !q ? ORDERED : [
      ...COUNTRIES.filter(c => norm(c).startsWith(q)),
      ...COUNTRIES.filter(c => !norm(c).startsWith(q) && norm(c).includes(q)),
    ];
    cActive = -1;
    cList.innerHTML = cItems.length
      ? cItems.map((c, i) => {
          const k = q ? norm(c).indexOf(q) : -1;
          const label = k < 0 ? esc(c) : esc(c.slice(0, k)) + '<mark>' + esc(c.slice(k, k + q.length)) + '</mark>' + esc(c.slice(k + q.length));
          return `<li role="option" id="country-${i}" aria-selected="false" data-i="${i}">${label}</li>`;
        }).join('')
      : '<li class="is-empty" role="option" aria-disabled="true">Ничего не нашлось</li>';
  }
  function markCountry(i, scroll){
    cList.querySelectorAll('[aria-selected="true"]').forEach(li => li.setAttribute('aria-selected', 'false'));
    cActive = i;
    const li = cList.querySelector(`[data-i="${i}"]`);
    if (!li) return;
    li.setAttribute('aria-selected', 'true');
    cInput.setAttribute('aria-activedescendant', li.id);
    if (scroll) li.scrollIntoView({block: 'nearest'});
  }
  function openCountries(all){
    renderCountries(all);
    cList.hidden = false; combo.classList.add('is-open'); cInput.setAttribute('aria-expanded', 'true');
    const cur = cItems.indexOf(findCountry(cInput.value) || '');
    if (cur >= 0) markCountry(cur, true);
  }
  function closeCountries(){
    cList.hidden = true; combo.classList.remove('is-open'); cInput.setAttribute('aria-expanded', 'false');
    cInput.removeAttribute('aria-activedescendant');
  }
  function pickCountry(i){
    cInput.value = cItems[i];
    closeCountries();
    check(cInput.closest('.wf-field'), true);
    save();
  }
  cInput.addEventListener('input', () => openCountries(false));
  cInput.addEventListener('focus', () => openCountries(!!findCountry(cInput.value)));
  cInput.addEventListener('click', () => { if (cList.hidden) openCountries(true); });
  cInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault();
      if (cList.hidden) openCountries(true);
      if (!cItems.length) return;
      const n = e.key === 'ArrowDown' ? Math.min(cItems.length - 1, cActive + 1) : Math.max(0, cActive - 1);
      markCountry(n, true);
    } else if (e.key === 'Enter' && !cList.hidden && cItems.length){
      e.preventDefault();                                   /* Enter picks, it does not submit the step */
      pickCountry(cActive >= 0 ? cActive : 0);
    } else if (e.key === 'Escape') closeCountries();
  });
  cList.addEventListener('mousedown', e => {
    const li = e.target.closest('[data-i]'); if (!li) return;
    e.preventDefault(); pickCountry(+li.dataset.i);
  });
  combo.querySelector('.wf-combo__toggle').addEventListener('mousedown', e => {
    e.preventDefault();
    if (cList.hidden){ cInput.focus(); openCountries(true); } else closeCountries();
  });
  cInput.addEventListener('blur', () => {
    closeCountries();
    const hit = findCountry(cInput.value);              /* «казахстан» → «Казахстан» */
    if (hit && hit !== cInput.value){ cInput.value = hit; save(); }
  });


  /* ---------- 05 · class or course depends on the type of organisation ---------- */
  const GRADES = {
    'Школа': { label: 'Класс', items: Array.from({length: 11}, (_, i) => `${i + 1} класс`) },
    'Колледж или техникум': { label: 'Курс', items: Array.from({length: 4}, (_, i) => `${i + 1} курс`) },
    'Вуз': { label: 'Курс', items: [...Array.from({length: 6}, (_, i) => `${i + 1} курс`), 'Магистратура', 'Аспирантура'] },
    'Другое': { label: 'Класс или курс', items: [...Array.from({length: 11}, (_, i) => `${i + 1} класс`), ...Array.from({length: 6}, (_, i) => `${i + 1} курс`)] },
  };
  const gradeSel = form.elements.grade, orgSel = form.elements.orgType;
  function buildGrades(){
    const cfg = GRADES[orgSel.value];
    const keep = gradeSel.value;
    document.getElementById('gradeLabel').textContent = cfg ? cfg.label : 'Класс или курс';
    gradeSel.innerHTML = '<option value="" disabled selected hidden>' + (cfg ? 'Не выбрано' : 'Сначала выберите тип') + '</option>'
      + (cfg ? cfg.items.map(t => `<option>${t}</option>`).join('') : '');
    gradeSel.disabled = !cfg;
    if (cfg && cfg.items.includes(keep)) gradeSel.value = keep;   /* a school class does not survive a switch to «Вуз» */
  }
  orgSel.addEventListener('change', () => { buildGrades(); check(gradeSel.closest('.wf-field'), false); save(); });

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
  function fieldOk(field){                 /* is this field filled correctly? (no visual changes) */
    const kind = field.dataset.kind;
    if (kind === 'radio' || kind === 'check') return !!field.querySelector('input:checked') || !field.hasAttribute('data-required');
    const el = field.querySelector('input, select'), v = el.value.trim(), name = el.name;
    const ok = kind === 'date' ? validDate(v) : name === 'snils' ? validSnils(v) : name === 'phone' ? validPhone(v)
       : name === 'zip' ? v.replace(/\D/g, '').length === 6
       : name === 'citizenshipCountry' ? !!findCountry(v)
       : kind === 'select' ? !!v : v.length >= 2;
    return ok || !field.hasAttribute('data-required');
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
         : name === 'citizenshipCountry' ? !!findCountry(v)
         : kind === 'select' ? !!v : v.length >= 2;
    }
    if (kind !== 'radio' && kind !== 'select' && kind !== 'check') field.classList.toggle('is-valid', !!v && ok);
    if (show) field.classList.toggle('is-error', field.hasAttribute('data-required') && !ok);
    else if (ok) field.classList.remove('is-error');
    return ok || !field.hasAttribute('data-required');
  }
  const fieldsOf = key => [...panels[key].querySelectorAll('.wf-field')].filter(f => !f.hidden);

  /* ---------- autosave (this browser only; no server in this prototype) ---------- */
  const nextBtn = form.querySelector('.wf-footer .w-button');
  function updateNext(){
    if (!panels[current]) return;
    const ready = fieldsOf(current).every(fieldOk);
    nextBtn.disabled = !ready;
    nextBtn.title = ready ? '' : 'Заполните обязательные поля, отмеченные *';
  }
  function save(){
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(new FormData(form)))); } catch(e) {}
    updateNext();
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
  buildGrades();
  Object.keys(panels).forEach(k => fieldsOf(k).forEach(f => check(f, false)));

  form.addEventListener('input', e => { const f = e.target.closest('.wf-field'); if (f) check(f, false); save(); });
  form.addEventListener('focusout', () => setTimeout(updateNext));    /* names, countries are tidied on blur */
  form.addEventListener('change', e => { const f = e.target.closest('.wf-field'); if (f) check(f, false); save(); });
  /* 02 · a click on «Россия» / «Другое гражданство» goes straight to the next step
     (click, not change: re-picking the same answer after «Назад» also moves on) */
  let autoNext = 0;
  [...form.elements.citizenship].forEach(r => r.addEventListener('click', () => {
    if (current !== '2') return;
    clearTimeout(autoNext);
    autoNext = setTimeout(() => { if (current === '2') form.requestSubmit(); }, 280);   /* let the card show it is picked */
  }));
  /* 07 · «Телефон представителя» adds the representative's full name next to the number */
  const repField = form.querySelector('[data-rep]');
  const syncRep = () => { repField.hidden = form.elements.phoneOwner.value !== 'representative'; };
  form.elements.phoneOwner.forEach(r => r.addEventListener('change', syncRep));
  syncRep();
  ['repName'].forEach(n => form.elements[n].addEventListener('blur', () => { const el = form.elements[n]; if (el.value){ el.value = properCase(el.value); save(); } }));

  /* 07 · picking whose phone it is: the cursor jumps to the first empty field (the step moves on only with «Далее») */
  [...form.elements.phoneOwner].forEach(r => r.addEventListener('click', () => {
    if (current !== '7') return;
    clearTimeout(autoNext);
    autoNext = setTimeout(() => {
      if (current !== '7') return;
      const E2 = form.elements, needRep = E2.phoneOwner.value === 'representative';
      const repOk = !needRep || E2.repName.value.trim().length >= 2;
      /* no auto-advance on this step: only «Далее» moves on; the cursor goes to the first empty field */
      if (!validPhone(E2.phone.value)) E2.phone.focus({preventScroll: phone()});
      else if (!repOk) E2.repName.focus({preventScroll: phone()});
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
  /* ---------- the route: click a stop to jump to that step ---------- */
  const keyOfN = n => n === 3 ? (E.citizenship.value === 'other' ? '3b' : '3a') : n === 4 ? '5' : String(n);  /* step 04 is not designed */
  function jumpTo(n){
    const seq = order(), from = seq.indexOf(current), target = keyOfN(n), to = seq.indexOf(target);
    if (to < 0 || target === current) return;
    editing = false;
    if (from < 0 || to < from) return show(target, true);          /* going back is always allowed */
    /* going forward: every step on the way must be filled; stop at the first one that is not */
    for (let i = from; i < to; i++){
      const fs = fieldsOf(seq[i]);
      const ok = fs.map(f => check(f, i === from)).every(Boolean);
      if (!ok){
        if (i !== from) show(seq[i], true);
        fs.forEach(f => check(f, true));
        return;
      }
    }
    save();
    show(target, true);
  }
  stops.forEach((s, i) => {
    s.addEventListener('click', () => { if (s.classList.contains('is-reachable')) jumpTo(i + 1); });
    s.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && s.classList.contains('is-reachable')){ e.preventDefault(); jumpTo(i + 1); }
    });
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

  /* «Начать заполнение»: the project form is not designed yet */
  document.getElementById('projectStart').addEventListener('click', () => {
    guideText.innerHTML = 'Подача проекта скоро откроется. Ваш профиль уже сохранён!';
  });

  /* «Назад к анкете»: back to the review */
  document.getElementById('projectBack').addEventListener('click', () => show('10', true));

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
