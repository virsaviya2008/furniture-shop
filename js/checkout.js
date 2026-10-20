/* ==========================================================================
   ARKETIP — оформление заказа в 3 шага (подключается после script.js)
   Контакты → Доставка (дата и время) → Оплата → «Заказ оформлен»
   ========================================================================== */

(() => {
  const form = document.querySelector('[data-checkout-form]');
  if (!form) return;

  /* ---------- Настройки ---------- */
  const DRAFT_KEY = 'arketip-checkout';
  const ORDER_KEY = 'arketip-order';
  const CRATE_PRICE = 4500;
  const LIFT_FLOOR_PRICE = 500;
  const MADE_TO_ORDER_DAYS = 35;
  const DAYS_SHOWN = 14;
  const SHOWROOM = 'Санкт-Петербург, наб. реки Мойки, 102';

  // lead — через сколько дней самая ранняя доставка товара в наличии
  const CITIES = {
    spb: { label: 'Санкт-Петербург', extra: 0, lead: 2 },
    'spb-out': { label: 'Санкт-Петербург (за КАД)', extra: 2000, extraLabel: 'Доставка за КАД', lead: 2 },
    msk: { label: 'Москва', extra: 7000, extraLabel: 'Доставка в Москву', lead: 4 },
  };

  const SLOTS = {
    delivery: [
      { id: 'd09', from: '09:00', to: '12:00' },
      { id: 'd12', from: '12:00', to: '15:00' },
      { id: 'd15', from: '15:00', to: '18:00' },
      { id: 'd18', from: '18:00', to: '21:00', extra: 1000 },
    ],
    // Шоурум: Пн–Сб 10:00–20:00, по часу
    pickup: Array.from({ length: 10 }, (_, i) => {
      const h = 10 + i;
      return { id: `p${h}`, from: `${h}:00`, to: `${h + 1}:00` };
    }),
  };

  const LIFT_LABELS = { yes: 'грузовой лифт есть', small: 'лифт маленький', no: 'без лифта' };

  const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const WEEKDAY_ACC = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
  const WEEKDAY_NOM = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Черновик в localStorage ---------- */
  const DEFAULTS = {
    step: 1, name: '', phone: '', email: '', telegram: true,
    method: 'delivery', city: 'spb', street: '', flat: '', floor: '', lift: 'yes',
    date: '', slot: '', crate: false, comment: '', payment: 'card',
  };

  function loadJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  const state = { ...DEFAULTS, ...loadJSON(DRAFT_KEY) };
  const saveDraft = () => localStorage.setItem(DRAFT_KEY, JSON.stringify(state));

  /* ---------- Даты ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  const isSunday = (date) => date.getDay() === 0;
  const dayMonth = (date) => `${date.getDate()} ${MONTH_GEN[date.getMonth()]}`;

  function today() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  // Стабильный «случайный» хэш: одно и то же окно в одну и ту же дату всегда занято или свободно
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function slotsFor(method, dateKey) {
    const list = SLOTS[method];
    const busyShare = method === 'pickup' ? 20 : 35;
    const result = list.map((slot) => ({ ...slot, busy: hash(`${dateKey}|${slot.id}`) % 100 < busyShare }));
    // Хотя бы одно окно в рабочий день всегда свободно
    if (result.every((slot) => slot.busy)) result[hash(dateKey) % result.length].busy = false;
    return result;
  }

  function findSlot(method, id) {
    return SLOTS[method].find((slot) => slot.id === id);
  }

  /* ---------- Корзина и суммы ---------- */
  function getCart() {
    return loadCart();
  }

  const hasMadeToOrder = (cart) => cart.some((item) => PRODUCTS[item.id].inStock === false);

  function leadDays(ctx) {
    if (ctx.madeToOrder) return MADE_TO_ORDER_DAYS;
    return ctx.method === 'delivery' ? CITIES[ctx.city].lead : CITIES.spb.lead;
  }

  function scheduleDays(ctx) {
    const first = addDays(today(), leadDays(ctx));
    return Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(first, i));
  }

  function liftExtra() {
    const floor = Number(state.floor) || 0;
    return state.method === 'delivery' && state.lift === 'no' && floor > 1 ? (floor - 1) * LIFT_FLOOR_PRICE : 0;
  }

  function getTotals(cart = getCart()) {
    const subtotal = cart.reduce((sum, item) => sum + PRODUCTS[item.id].price * item.qty, 0);
    const lines = [{ label: 'Товары', value: formatPrice(subtotal) }];
    let total = subtotal;

    if (state.method === 'delivery') {
      const base = subtotal >= FREE_DELIVERY_FROM ? 0 : DELIVERY_PRICE;
      lines.push({ label: 'Доставка', value: base ? formatPrice(base) : 'Бесплатно' });
      total += base;

      const city = CITIES[state.city];
      if (city.extra) {
        lines.push({ label: city.extraLabel, value: `+${formatPrice(city.extra)}` });
        total += city.extra;
      }
      const lift = liftExtra();
      if (lift) {
        lines.push({ label: `Подъём без лифта на ${state.floor} этаж`, value: `+${formatPrice(lift)}` });
        total += lift;
      }
      const slot = findSlot('delivery', state.slot);
      if (slot?.extra) {
        lines.push({ label: `Вечернее окно ${slot.from}–${slot.to}`, value: `+${formatPrice(slot.extra)}` });
        total += slot.extra;
      }
      lines.push({ label: 'Сборка', value: 'Включена' });
    } else {
      lines.push({ label: 'Самовывоз', value: 'Бесплатно' });
    }

    if (state.crate) {
      lines.push({ label: 'Деревянный кофр', value: `+${formatPrice(CRATE_PRICE)}` });
      total += CRATE_PRICE;
    }

    return { cart, subtotal, lines, total, part: Math.ceil(total / 4) };
  }

  /* ---------- Телефон: маска +7 (___) ___-__-__ ---------- */
  function phoneDigits(value) {
    let digits = value.replace(/\D/g, '');
    if (value.trim().startsWith('+7')) digits = digits.slice(1);
    else if (digits[0] === '7' || digits[0] === '8') digits = digits.slice(1);
    // Набрали «8 912 …» после подставленного «+7 (» — лишняя восьмёрка в начале
    if (digits.length > 10 && (digits[0] === '7' || digits[0] === '8')) digits = digits.slice(1);
    return digits.slice(0, 10);
  }

  function formatPhone(digits) {
    if (!digits) return '';
    let text = `+7 (${digits.slice(0, 3)}`;
    if (digits.length > 3) text += `) ${digits.slice(3, 6)}`;
    if (digits.length > 6) text += `-${digits.slice(6, 8)}`;
    if (digits.length > 8) text += `-${digits.slice(8, 10)}`;
    return text;
  }

  function applyPhoneMask(input) {
    const caretDigits = phoneDigits(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
    const formatted = formatPhone(phoneDigits(input.value));
    input.value = formatted;

    // Курсор остаётся после той же по счёту цифры
    let position = formatted.length;
    if (caretDigits === 0) {
      position = Math.min(4, formatted.length);
    } else {
      let seen = 0;
      for (let i = 4; i < formatted.length; i += 1) {
        if (/\d/.test(formatted[i]) && ++seen === caretDigits) {
          position = i + 1;
          break;
        }
      }
    }
    if (document.activeElement === input) input.setSelectionRange(position, position);
  }

  /* ---------- Проверка полей ---------- */
  const VALIDATORS = {
    name: (v) => {
      if (!v.trim()) return 'Введите имя';
      return v.trim().length < 2 ? 'Имя слишком короткое' : '';
    },
    phone: (v) => {
      const digits = phoneDigits(v);
      if (!digits.length) return 'Введите телефон';
      return digits.length < 10 ? 'Введите телефон полностью' : '';
    },
    email: (v) => {
      if (!v.trim()) return 'Введите e-mail — пришлём на него чек';
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Проверьте e-mail — например, anna@mail.ru';
    },
    street: (v) => {
      if (state.method !== 'delivery') return '';
      return v.trim().length < 3 ? 'Укажите улицу и номер дома' : '';
    },
    floor: (v) => {
      if (state.method !== 'delivery') return '';
      if (!v && state.lift === 'no') return 'Укажите этаж — без лифта подъём считаем по этажам';
      return v && Number(v) < 1 ? 'Этаж — число от 1, например 4' : '';
    },
    consent: () => (form.elements.consent.checked ? '' : 'Нужно согласие на обработку персональных данных'),
  };

  const STEP_FIELDS = { 1: ['name', 'phone', 'email'], 2: ['street', 'floor'], 3: ['consent'] };

  function fieldError(name) {
    return VALIDATORS[name](form.elements[name].value);
  }

  function showFieldError(name, message) {
    const input = form.elements[name];
    input.classList.toggle('checkout-field__input--invalid', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    form.querySelector(`[data-error="${name}"]`).textContent = message;
  }

  function scheduleReady() {
    return Boolean(state.date && state.slot);
  }

  function stepValid(step) {
    const fieldsOk = STEP_FIELDS[step].every((name) => !fieldError(name));
    return step === 2 ? fieldsOk && scheduleReady() : fieldsOk;
  }

  const canReach = (step) => [1, 2, 3].filter((n) => n < step).every(stepValid);

  /* ---------- Выбор даты и времени ---------- */
  // ctx: { method, city, madeToOrder, date, slot } — общий для шага 2 и переноса доставки
  function normalizeSchedule(ctx) {
    const days = scheduleDays(ctx).filter((d) => !isSunday(d)).map(toKey);
    if (!days.includes(ctx.date)) {
      ctx.date = '';
      ctx.slot = '';
    }
    const slot = ctx.date && slotsFor(ctx.method, ctx.date).find((s) => s.id === ctx.slot);
    if (!slot || slot.busy) ctx.slot = '';
  }

  function renderSchedule(root, ctx) {
    const datesEl = root.querySelector('[data-dates]');
    const slotsWrap = root.querySelector('[data-slots-wrap]');
    const slotsEl = root.querySelector('[data-slots]');
    const days = scheduleDays(ctx);

    datesEl.setAttribute('role', 'group');
    datesEl.setAttribute('aria-label', ctx.method === 'pickup' ? 'Дата самовывоза' : 'Дата доставки');

    // Ленту пересобираем только при смене набора дат, чтобы не сбрасывать прокрутку
    const datesSig = `${toKey(days[0])}|${ctx.method}`;
    if (datesEl.dataset.sig !== datesSig) {
      datesEl.dataset.sig = datesSig;
      datesEl.replaceChildren(...days.map((date) => {
        const off = isSunday(date);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `date-card${off ? ' date-card--off' : ''}`;
        button.dataset.date = toKey(date);
        button.disabled = off;
        button.setAttribute('aria-label', `${WEEKDAY_NOM[date.getDay()]}, ${dayMonth(date)}${off ? ', выходной' : ''}`);
        button.innerHTML = `
          <span class="date-card__wd">${WEEKDAY_SHORT[date.getDay()]}</span>
          <span class="date-card__day">${date.getDate()}</span>
          <span class="date-card__month">${off ? 'выходной' : MONTH_SHORT[date.getMonth()]}</span>`;
        return button;
      }));
    }
    datesEl.querySelectorAll('.date-card').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.date === ctx.date));
    });

    slotsWrap.hidden = !ctx.date;
    if (!ctx.date) return;

    const slotsSig = `${ctx.date}|${ctx.method}`;
    if (slotsEl.dataset.sig !== slotsSig) {
      slotsEl.dataset.sig = slotsSig;
      slotsEl.classList.toggle('slots--pickup', ctx.method === 'pickup');
      slotsEl.replaceChildren(...slotsFor(ctx.method, ctx.date).map((slot) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `slot${slot.busy ? ' slot--busy' : ''}`;
        button.dataset.slot = slot.id;
        button.disabled = slot.busy;
        const note = slot.busy ? 'занято' : slot.extra ? `+${formatPrice(slot.extra)}` : '';
        button.innerHTML = `<span class="slot__time">${slot.from}–${slot.to}</span>${note ? `<span class="slot__note">${note}</span>` : ''}`;
        return button;
      }));
    }
    slotsEl.querySelectorAll('.slot').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.slot === ctx.slot));
    });
  }

  // getCtx — функция: контекст переноса даты создаётся заново при каждом открытии
  function bindSchedule(root, getCtx, onChange) {
    root.addEventListener('click', (event) => {
      const ctx = getCtx();
      const dateBtn = event.target.closest('.date-card');
      const slotBtn = event.target.closest('.slot');
      const arrow = event.target.closest('[data-scroll]');

      if (dateBtn && !dateBtn.disabled) {
        ctx.date = dateBtn.dataset.date;
        normalizeSchedule(ctx);
        onChange();
        // На телефоне подкручиваем к окнам времени
        root.querySelector('[data-slots-wrap]').scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
      }
      if (slotBtn && !slotBtn.disabled) {
        ctx.slot = slotBtn.dataset.slot;
        onChange();
      }
      if (arrow) {
        const dates = root.querySelector('[data-dates]');
        dates.scrollBy({ left: Number(arrow.dataset.scroll) * dates.clientWidth * 0.8, behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    });
  }

  function whenText(ctx, long = true) {
    const date = parseKey(ctx.date);
    const slot = findSlot(ctx.method, ctx.slot);
    const at = `${WEEKDAY_ACC[date.getDay()]}, ${dayMonth(date)}, с ${slot.from} до ${slot.to}`;
    if (!long) return `${WEEKDAY_NOM[date.getDay()]}, ${dayMonth(date)}, с ${slot.from} до ${slot.to}`;
    return ctx.method === 'pickup'
      ? `Ждём вас в шоуруме в ${at}. Адрес: наб. реки Мойки, 102. Заказ будет упакован и готов к выдаче.`
      : `Привезём в ${at}. За час до приезда водитель позвонит. Сборка займёт около 30 минут.`;
  }

  function addressText() {
    if (state.method === 'pickup') return `Самовывоз: ${SHOWROOM}`;
    const parts = [CITIES[state.city].label, state.street.trim()];
    if (state.flat.trim()) parts.push(`кв. ${state.flat.trim()}`);
    if (state.floor) parts.push(`${state.floor} этаж`);
    parts.push(LIFT_LABELS[state.lift]);
    return parts.join(', ');
  }

  /* ---------- Элементы страницы ---------- */
  const $ = (selector, root = document) => root.querySelector(selector);
  const filled = $('[data-checkout-filled]');
  const empty = $('[data-checkout-empty]');
  const done = $('[data-checkout-done]');
  const head = $('[data-checkout-head]');
  const schedule = $('[data-schedule]');
  const nextBtn = $('[data-next]');
  const backBtn = $('[data-back]');
  const status = $('[data-status]');
  const summary = $('[data-summary]');
  const commentBody = $('#comment-body');
  const commentToggle = $('[data-comment-toggle]');

  const scheduleCtx = { method: state.method, city: state.city, madeToOrder: false, date: state.date, slot: state.slot };

  /* ---------- Заполнение формы из черновика ---------- */
  function fillForm() {
    Object.keys(DEFAULTS).forEach((name) => {
      const field = form.elements[name];
      if (!field) return;
      if (field instanceof RadioNodeList) field.value = state[name];
      else if (field.type === 'checkbox') field.checked = Boolean(state[name]);
      else field.value = state[name];
    });
    if (state.comment) setCommentOpen(true);
  }

  function setCommentOpen(open) {
    commentBody.hidden = !open;
    commentToggle.hidden = open;
    commentToggle.setAttribute('aria-expanded', String(open));
  }

  /* ---------- Отрисовка ---------- */
  function createOrderItem({ id, qty }) {
    const product = PRODUCTS[id];
    const item = document.createElement('li');
    item.className = 'order-item';
    item.innerHTML = `
      <div class="order-item__image">
        <img src="${product.image}" alt="${product.title}">
      </div>
      <div class="order-item__body">
        <div>
          <div class="order-item__top">
            <h3 class="order-item__title">${product.title}</h3>
            <p class="order-item__price">${formatPrice(product.price * qty)}</p>
          </div>
          <p class="order-item__qty">${qty} шт.${qty > 1 ? ` × ${formatPrice(product.price)}` : ''}</p>
        </div>
        <p class="order-item__stock">${product.inStock === false ? 'Под заказ · 4–6 недель' : 'В наличии'}</p>
      </div>`;
    return item;
  }

  function renderSummary(totals) {
    const { cart, lines, total } = totals;
    const qty = getCartQty(cart);
    const countText = `${qty} ${pluralize(qty, 'предмет', 'предмета', 'предметов')}`;

    $('[data-order-count]').textContent = countText;
    $('[data-order-count-short]').textContent = `· ${countText}`;
    $('[data-order-list]').replaceChildren(...cart.map(createOrderItem));
    $('[data-order-lines]').innerHTML = lines
      .map((line) => `<p class="order-summary__line"><span>${line.label}</span><strong>${line.value}</strong></p>`)
      .join('');
    $('[data-order-total]').textContent = formatPrice(total);
    $('[data-order-total-short]').textContent = formatPrice(total);
  }

  function renderDelivery(totals) {
    const isDelivery = state.method === 'delivery';
    $('[data-address]').hidden = !isDelivery;
    $('[data-delivery-price]').textContent = totals.subtotal >= FREE_DELIVERY_FROM ? 'Бесплатно' : formatPrice(DELIVERY_PRICE);

    // Подсказка про подъём без лифта
    const liftNote = $('[data-lift-note]');
    const lift = liftExtra();
    liftNote.hidden = !(isDelivery && state.lift === 'no');
    liftNote.textContent = lift
      ? `Подъём без лифта: +500 ₽ за этаж. На ${state.floor} этаж — +${formatPrice(lift)}.`
      : 'Подъём без лифта: +500 ₽ за этаж.';

    const noun = isDelivery ? 'доставки' : 'самовывоза';
    $('[data-date-title]').textContent = isDelivery ? 'Дата доставки' : 'Когда придёте в шоурум';
    $('[data-slot-title]').textContent = isDelivery ? 'Время доставки' : 'Во сколько придёте';

    const note = $('[data-made-to-order]');
    const firstDay = scheduleDays(scheduleCtx).find((d) => !isSunday(d));
    if (scheduleCtx.madeToOrder) {
      note.hidden = false;
      note.textContent = `Изделие делается под заказ, ближайшая дата ${noun} — ${dayMonth(firstDay)}.`;
    } else if (isDelivery && state.city === 'msk') {
      note.hidden = false;
      note.textContent = `До Москвы везём 4 дня, ближайшая дата доставки — ${dayMonth(firstDay)}.`;
    } else {
      note.hidden = true;
    }

    renderSchedule(schedule, scheduleCtx);

    const when = $('[data-when]');
    when.hidden = !scheduleReady();
    if (scheduleReady()) when.textContent = whenText(scheduleCtx);

    $('[data-comment-label]').textContent = isDelivery ? 'Комментарий для водителя' : 'Комментарий для шоурума';
    $('#f-comment').placeholder = isDelivery ? 'Код домофона, где удобно поставить машину' : 'Например: приеду на машине, помогите погрузить';
  }

  function renderPayment(totals) {
    $('[data-split-amount]').textContent = `4 × ${formatPrice(totals.part)}`;
    $('[data-split-hint]').textContent = `${formatPrice(totals.part)} сейчас и ещё 3 платежа раз в две недели`;

    const items = totals.cart
      .map(({ id, qty }) => `${PRODUCTS[id].title}${qty > 1 ? ` × ${qty}` : ''}`)
      .join(', ');
    const rows = [
      { label: 'Заказ', value: items, href: 'cart.html' },
      { label: 'Получатель', value: `${state.name.trim()}, ${state.phone}, ${state.email.trim()}`, go: 1 },
      { label: state.method === 'pickup' ? 'Самовывоз' : 'Адрес', value: state.method === 'pickup' ? SHOWROOM : addressText(), go: 2 },
      { label: 'Дата и время', value: scheduleReady() ? whenText(scheduleCtx, false) : '—', go: 2 },
    ];
    $('[data-recap]').innerHTML = rows.map((row) => `
      <div class="recap__row">
        <dt>${row.label}</dt>
        <dd>${escapeHTML(row.value)}</dd>
        ${row.href
          ? `<a class="recap__edit" href="${row.href}">Изменить</a>`
          : `<button class="recap__edit" type="button" data-go="${row.go}">Изменить</button>`}
      </div>`).join('') + `
      <div class="recap__row recap__row--total">
        <dt>Итого</dt>
        <dd>${formatPrice(totals.total)}${state.payment === 'split' ? ` <span>4 платежа по ${formatPrice(totals.part)}</span>` : ''}</dd>
      </div>`;
  }

  function renderNav(totals) {
    const step = state.step;
    backBtn.textContent = step === 1 ? '← В корзину' : '← Назад';
    $('[data-trust]').hidden = step !== 3;
    form.dataset.step = step;

    let label = 'Далее';
    let disabled = false;
    if (step === 2 && !scheduleReady()) {
      const noun = state.method === 'pickup' ? 'самовывоза' : 'доставки';
      label = state.date ? `Выберите время ${noun}` : `Выберите дату ${noun}`;
      disabled = true;
    }
    if (step === 3) {
      label = `Оформить заказ на ${formatPrice(totals.total)}`;
    }
    if (!nextBtn.dataset.busy) {
      nextBtn.textContent = label;
      nextBtn.disabled = disabled;
    }

    // Прогресс сверху
    document.querySelectorAll('.checkout-steps__btn').forEach((button) => {
      const n = Number(button.dataset.go);
      button.classList.toggle('checkout-steps__btn--current', n === step);
      button.classList.toggle('checkout-steps__btn--done', n < step);
      button.disabled = n !== step && !canReach(n);
      if (n === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }

  function render() {
    const cart = getCart();
    if (!cart.length) {
      filled.hidden = true;
      empty.hidden = false;
      return;
    }
    filled.hidden = false;
    empty.hidden = true;

    scheduleCtx.method = state.method;
    scheduleCtx.city = state.city;
    scheduleCtx.madeToOrder = hasMadeToOrder(cart);
    normalizeSchedule(scheduleCtx);
    state.date = scheduleCtx.date;
    state.slot = scheduleCtx.slot;

    const totals = getTotals(cart);
    renderSummary(totals);
    renderDelivery(totals);
    renderPayment(totals);
    renderNav(totals);

    document.querySelectorAll('[data-step]').forEach((section) => {
      if (section.tagName === 'SECTION') section.hidden = Number(section.dataset.step) !== state.step;
    });
    saveDraft();
  }

  function escapeHTML(text) {
    return String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  /* ---------- Переходы между шагами ---------- */
  function scrollToTop() {
    const top = head.getBoundingClientRect().top + window.scrollY - 96;
    if (window.scrollY > top) window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  function goTo(step, { push = true, focus = true } = {}) {
    let target = step;
    while (target > 1 && !canReach(target)) target -= 1;
    state.step = target;
    status.textContent = '';
    if (push && location.hash !== `#step-${target}`) history.pushState(null, '', `#step-${target}`);
    render();
    if (focus) {
      scrollToTop();
      $(`#step${target}-title`).focus({ preventScroll: true });
    }
  }

  function validateStep(step) {
    let firstInvalid = null;
    STEP_FIELDS[step].forEach((name) => {
      if (form.elements[name].closest('[hidden]')) return;
      const message = fieldError(name);
      showFieldError(name, message);
      if (message && !firstInvalid) firstInvalid = form.elements[name];
    });
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
      status.textContent = 'Проверьте поля, отмеченные красным.';
      return false;
    }
    return step !== 2 || scheduleReady();
  }

  /* ---------- Отправка заказа и «Заказ оформлен» ---------- */
  function orderPayload(order, totals) {
    const items = totals.cart
      .map(({ id, qty }) => `${PRODUCTS[id].title} × ${qty} — ${formatPrice(PRODUCTS[id].price * qty)}`)
      .join('\n');
    const delivery = [
      `${order.method === 'pickup' ? 'Самовывоз' : 'Доставка'}: ${order.address}`,
      whenText(order, false),
      state.crate ? 'Деревянный кофр' : '',
    ].filter(Boolean).join('\n');
    const payment = order.payment === 'split'
      ? `Частями — 4 платежа по ${formatPrice(order.part)}`
      : 'Картой онлайн';

    return {
      type: 'Новый заказ',
      name: order.name,
      phone: state.phone,
      email: order.email,
      items,
      delivery,
      payment,
      total: formatPrice(order.total),
      comment: state.comment.trim(),
      website: form.elements.website.value,
    };
  }

  async function submitOrder() {
    const totals = getTotals();
    const order = {
      number: `AR-${String(Date.now()).slice(-6)}`,
      name: state.name.trim(),
      email: state.email.trim(),
      telegram: state.telegram,
      method: state.method,
      city: state.city,
      madeToOrder: scheduleCtx.madeToOrder,
      date: state.date,
      slot: state.slot,
      address: state.method === 'pickup' ? SHOWROOM : addressText(),
      total: totals.total,
      part: totals.part,
      payment: state.payment,
    };

    nextBtn.dataset.busy = '1';
    nextBtn.disabled = true;
    nextBtn.textContent = 'Отправляем…';
    status.textContent = '';

    try {
      await sendLead(orderPayload(order, totals));
    } catch {
      // Корзину и черновик не трогаем — можно попробовать ещё раз
      delete nextBtn.dataset.busy;
      renderNav(getTotals());
      status.textContent = SEND_ERROR_TEXT;
      return;
    }

    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
    localStorage.removeItem(DRAFT_KEY);
    saveCart([]);
    delete nextBtn.dataset.busy;
    history.replaceState(null, '', '#done');
    showDone(order);
  }

  function showDone(order) {
    filled.hidden = true;
    empty.hidden = true;
    head.hidden = true;
    done.hidden = false;

    const isPickup = order.method === 'pickup';
    $('[data-done-number]').textContent = order.number;
    $('[data-done-text]').textContent = order.telegram
      ? `Спасибо, ${order.name}! Заказ принят — менеджер скоро позвонит, чтобы подтвердить детали и оплату. Статус заказа будем присылать в Telegram.`
      : `Спасибо, ${order.name}! Заказ принят — менеджер скоро позвонит, чтобы подтвердить детали и оплату. Статус заказа пришлём на ${order.email}.`;
    $('[data-done-when-label]').textContent = isPickup ? 'Самовывоз' : 'Доставка';
    $('[data-done-when]').textContent = whenText(order, false);
    $('[data-done-address]').textContent = order.address;
    $('[data-done-paid]').textContent = order.payment === 'split'
      ? `${formatPrice(order.total)} — 4 платежа по ${formatPrice(order.part)}`
      : `${formatPrice(order.total)} картой`;
    $('[data-reschedule]').textContent = isPickup ? 'Изменить дату самовывоза' : 'Изменить дату доставки';

    window.scrollTo({ top: 0 });
    $('#done-title').focus({ preventScroll: true });
  }

  /* ---------- Календарь: .ics ---------- */
  function icsDate(dateKey, time) {
    // Москва и Петербург живут по UTC+3 круглый год
    const [y, m, d] = dateKey.split('-').map(Number);
    const [h, min] = time.split(':').map(Number);
    return new Date(Date.UTC(y, m - 1, d, h - 3, min)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  const icsEscape = (text) => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

  // Строки длиннее 75 байт переносятся по стандарту iCalendar
  function icsFold(line) {
    const encoder = new TextEncoder();
    let result = '';
    let bytes = 0;
    for (const ch of line) {
      const size = encoder.encode(ch).length;
      if (bytes + size > 73) {
        result += '\r\n ';
        bytes = 1;
      }
      result += ch;
      bytes += size;
    }
    return result;
  }

  function downloadIcs(order) {
    const slot = findSlot(order.method, order.slot);
    const isPickup = order.method === 'pickup';
    const summaryText = isPickup ? `Самовывоз ARKETIP, заказ ${order.number}` : `Доставка мебели ARKETIP, заказ ${order.number}`;
    const description = isPickup
      ? `Шоурум ARKETIP, наб. реки Мойки, 102. Вопросы: +7 (812) 980-12-34`
      : `За час до приезда водитель позвонит. Сборка займёт около 30 минут. Вопросы: +7 (812) 980-12-34`;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ARKETIP//Checkout//RU',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${order.number}-${order.date}@arketip.ru`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART:${icsDate(order.date, slot.from)}`,
      `DTEND:${icsDate(order.date, slot.to)}`,
      `SUMMARY:${icsEscape(summaryText)}`,
      `LOCATION:${icsEscape(order.address.replace(/^Самовывоз: /, ''))}`,
      `DESCRIPTION:${icsEscape(description)}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(summaryText)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    const blob = new Blob([`${lines.map(icsFold).join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `arketip-${order.number}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  /* ---------- Перенос даты после оплаты ---------- */
  function initReschedule() {
    const box = $('[data-reschedule-box]');
    const toggle = $('[data-reschedule]');
    const save = $('[data-reschedule-save]');
    const note = $('[data-r-note]');
    let ctx = null;

    const renderBox = () => {
      renderSchedule(box, ctx);
      const order = loadJSON(ORDER_KEY);
      const ready = Boolean(ctx.date && ctx.slot);
      const oldExtra = findSlot(order.method, order.slot)?.extra || 0;
      const newExtra = ready ? findSlot(ctx.method, ctx.slot)?.extra || 0 : oldExtra;
      note.textContent = newExtra > oldExtra
        ? `Вечернее окно стоит +${formatPrice(newExtra)} — доплатите водителю при получении.`
        : newExtra < oldExtra
          ? `${formatPrice(oldExtra)} за вечернее окно вернём на карту.`
          : '';
      save.disabled = !ready;
      save.textContent = ready ? `Перенести на ${whenText(ctx, false).replace(/^\S+ /, '')}` : 'Выберите дату и время';
    };

    toggle.addEventListener('click', () => {
      const open = box.hidden;
      box.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (!open) return;
      const order = loadJSON(ORDER_KEY);
      ctx = { method: order.method, city: order.city, madeToOrder: order.madeToOrder, date: '', slot: '' };
      renderBox();
      box.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    });

    bindSchedule(box, () => ctx, renderBox);

    save.addEventListener('click', () => {
      const order = loadJSON(ORDER_KEY);
      Object.assign(order, { date: ctx.date, slot: ctx.slot });
      localStorage.setItem(ORDER_KEY, JSON.stringify(order));
      box.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      showDone(order);
      $('[data-done-text]').textContent = `Готово, перенесли: ${whenText(order, false)}. Не забудьте обновить событие в календаре.`;
    });
  }

  /* ---------- События формы ---------- */
  function readField(field) {
    if (!field.name || !(field.name in DEFAULTS)) return;
    if (field.type === 'checkbox') state[field.name] = field.checked;
    else if (field.type === 'radio') {
      if (field.checked) state[field.name] = field.value;
    } else state[field.name] = field.value;
  }

  form.addEventListener('input', (event) => {
    const field = event.target;
    if (field.name === 'phone') applyPhoneMask(field);
    if (field.name === 'floor') field.value = field.value.replace(/\D/g, '').slice(0, 2);
    readField(field);
    // Ошибку убираем, как только поле исправлено
    if (VALIDATORS[field.name] && field.getAttribute('aria-invalid') === 'true') {
      showFieldError(field.name, fieldError(field.name));
    }
    if (field.name === 'floor' || field.name === 'street') render();
    else saveDraft();
  });

  form.addEventListener('change', (event) => {
    readField(event.target);
    if (event.target.name === 'lift' && form.elements.floor.getAttribute('aria-invalid') === 'true') {
      showFieldError('floor', fieldError('floor'));
    }
    render();
  });

  // Ошибка появляется, когда человек ушёл из заполненного поля
  form.addEventListener('focusout', (event) => {
    const field = event.target;
    if (!VALIDATORS[field.name] || field.type === 'checkbox') return;
    if (field.name === 'phone' && !phoneDigits(field.value)) {
      field.value = '';
      state.phone = '';
    }
    if (field.value.trim()) showFieldError(field.name, fieldError(field.name));
    renderNav(getTotals());
  });

  form.elements.phone.addEventListener('focus', (event) => {
    if (!event.target.value) event.target.value = '+7 (';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (nextBtn.dataset.busy) return;
    if (!validateStep(state.step)) return;
    if (state.step < 3) goTo(state.step + 1);
    else submitOrder();
  });

  backBtn.addEventListener('click', () => {
    if (state.step === 1) location.href = 'cart.html';
    else goTo(state.step - 1);
  });

  document.addEventListener('click', (event) => {
    const go = event.target.closest('[data-go]');
    if (go && !go.disabled) goTo(Number(go.dataset.go));
  });

  bindSchedule(schedule, () => scheduleCtx, () => {
    state.date = scheduleCtx.date;
    state.slot = scheduleCtx.slot;
    render();
  });

  commentToggle.addEventListener('click', () => {
    setCommentOpen(true);
    form.elements.comment.focus();
  });

  // «Ваш заказ» на телефоне сворачивается в строку с суммой
  $('[data-summary-toggle]').addEventListener('click', (event) => {
    const open = !summary.classList.contains('order-summary--open');
    summary.classList.toggle('order-summary--open', open);
    event.currentTarget.setAttribute('aria-expanded', String(open));
  });

  $('[data-ics]').addEventListener('click', () => downloadIcs(loadJSON(ORDER_KEY)));

  window.addEventListener('popstate', () => {
    const match = location.hash.match(/^#step-([123])$/);
    if (match && done.hidden) goTo(Number(match[1]), { push: false });
  });

  window.addEventListener('storage', (event) => {
    if (event.key === CART_KEY && done.hidden) render();
  });

  /* ---------- Старт ---------- */
  initReschedule();
  const lastOrder = loadJSON(ORDER_KEY);

  if (location.hash === '#done' && lastOrder && !getCart().length) {
    showDone(lastOrder);
  } else {
    fillForm();
    const match = location.hash.match(/^#step-([123])$/);
    goTo(match ? Number(match[1]) : state.step, { push: false, focus: false });
    history.replaceState(null, '', `#step-${state.step}`);
  }
})();
