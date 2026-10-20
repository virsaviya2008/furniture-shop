/* ==========================================================================
   ARKETIP — анимации современного слоя (подключается после script.js)
   ========================================================================== */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Шапка: компактная после прокрутки, прячется при скролле вниз ---------- */
const siteHeader = document.querySelector('.header');
const scrollProgress = document.createElement('div');
scrollProgress.className = 'scroll-progress';
scrollProgress.setAttribute('aria-hidden', 'true');
document.body.prepend(scrollProgress);

let lastScrollY = window.scrollY;
let scrollTicking = false;

function onScrollFrame() {
  const y = window.scrollY;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

  if (siteHeader) {
    siteHeader.classList.toggle('header--scrolled', y > 24);
    // Не прячем шапку у самого верха, при открытом меню и при фокусе внутри неё
    const keepVisible = y < 200 || document.body.classList.contains('menu-open') || siteHeader.contains(document.activeElement);
    if (keepVisible || y < lastScrollY - 4) siteHeader.classList.remove('header--hidden');
    else if (y > lastScrollY + 4) siteHeader.classList.add('header--hidden');
  }

  scrollProgress.style.transform = `scaleX(${maxScroll > 0 ? y / maxScroll : 0})`;
  updateHeroParallax(y);

  lastScrollY = y;
  scrollTicking = false;
}

window.addEventListener('scroll', () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(onScrollFrame);
}, { passive: true });

/* ---------- Навигация: скользящая подложка под пунктами ---------- */
const navList = document.querySelector('.nav__list');

if (navList) {
  const indicator = document.createElement('span');
  indicator.className = 'nav__indicator';
  indicator.setAttribute('aria-hidden', 'true');
  navList.prepend(indicator);
  navList.closest('.nav').classList.add('nav--js');

  const activeLink = navList.querySelector('.nav__link--active');

  const moveIndicator = (link) => {
    if (!link) {
      indicator.classList.remove('nav__indicator--visible');
      return;
    }
    // Смещение считаем по <li>: у ссылки offsetParent — сам пункт списка
    indicator.style.width = `${link.offsetWidth}px`;
    indicator.style.transform = `translateX(${link.parentElement.offsetLeft}px)`;
    indicator.classList.add('nav__indicator--visible');
  };

  navList.querySelectorAll('.nav__link').forEach((link) => {
    link.addEventListener('mouseenter', () => moveIndicator(link));
    link.addEventListener('focus', () => moveIndicator(link));
  });
  navList.addEventListener('mouseleave', () => moveIndicator(activeLink));
  navList.addEventListener('focusout', () => moveIndicator(activeLink));

  // Позиция без анимации при загрузке и после загрузки шрифтов
  const placeActive = () => {
    indicator.style.transition = 'none';
    moveIndicator(activeLink);
    indicator.offsetWidth;
    indicator.style.transition = '';
  };
  placeActive();
  document.fonts?.ready.then(placeActive);
  window.addEventListener('resize', placeActive);
}

/* ---------- Корзина: «подпрыгивает» при изменении счётчика ---------- */
const headerCartBtn = document.querySelector('.cart-btn');
const headerCartCount = document.querySelector('.cart-btn__count');

if (headerCartBtn && headerCartCount) {
  new MutationObserver(() => {
    headerCartBtn.classList.remove('cart-btn--bump');
    headerCartBtn.offsetWidth;
    headerCartBtn.classList.add('cart-btn--bump');
  }).observe(headerCartCount, { childList: true });

  headerCartBtn.addEventListener('animationend', () => headerCartBtn.classList.remove('cart-btn--bump'));
}

/* ---------- Hero: лёгкий параллакс фотографии ---------- */
const heroImage = document.querySelector('.hero__visual img');

function updateHeroParallax(y) {
  if (!heroImage || prefersReducedMotion || y > window.innerHeight) return;
  heroImage.style.transform = `translateY(${y * 0.08}px) scale(1.08)`;
}

/* ---------- Появление блоков при прокрутке ---------- */
const REVEAL_SELECTOR = [
  '.section-head', '.product-card', '.category', '.project', '.interior',
  '.philosophy__content', '.philosophy__visual', '.facts__item',
  '.catalog-card', '.feature', '.material', '.custom-order',
  '.cart-item', '.summary', '.footer__grid',
  '.contacts__form-col', '.contacts__block', '.program',
].join(', ');

if ('IntersectionObserver' in window && !prefersReducedMotion) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('reveal--visible');
      revealObserver.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  const observeReveal = (element) => {
    // Соседние карточки в сетке появляются лесенкой
    const siblings = [...element.parentElement.children].filter((child) => child.matches(REVEAL_SELECTOR));
    const index = siblings.indexOf(element);
    element.style.setProperty('--reveal-delay', `${(index % 3) * 0.05}s`);
    element.classList.add('reveal');
    revealObserver.observe(element);
  };

  // Корзина, похожие товары и т. п. уже отрисованы script.js к этому моменту;
  // перерисованные позже элементы (кнопки ± в корзине) появляются без анимации
  document.querySelectorAll(REVEAL_SELECTOR).forEach(observeReveal);
}

/* ---------- Контакты: метка падает на карту, когда та появляется в кадре ---------- */
const contactsMap = document.querySelector('.map');

if (contactsMap && 'IntersectionObserver' in window) {
  const mapObserver = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    contactsMap.classList.add('map--visible');
    mapObserver.disconnect();
  }, { threshold: 0.35 });
  mapObserver.observe(contactsMap);
} else if (contactsMap) {
  contactsMap.classList.add('map--visible');
}

/* ---------- Коллекция: карточки «перетасовываются» при смене фильтра ---------- */
const animatedGrid = document.querySelector('.catalog__grid');

document.querySelectorAll('.filters__btn').forEach((button) => {
  button.addEventListener('click', () => {
    if (!animatedGrid) return;
    animatedGrid.classList.remove('catalog__grid--animate');
    animatedGrid.offsetWidth;
    animatedGrid.classList.add('catalog__grid--animate');
    animatedGrid.querySelectorAll('.catalog-card').forEach((card) => card.classList.add('reveal--visible'));
  });
});

/* ---------- Категории: световой блик за курсором ---------- */
document.querySelectorAll('.category').forEach((tile) => {
  tile.addEventListener('pointermove', (event) => {
    const rect = tile.getBoundingClientRect();
    tile.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    tile.style.setProperty('--my', `${event.clientY - rect.top}px`);
  });
});

/* ---------- Страница товара: рамка фото, свечение и лупа ---------- */
const productGallery = document.querySelector('.product__gallery');
const productPhoto = productGallery?.querySelector('[data-product-image]');

if (productPhoto && productPhoto.getAttribute('src')) {
  const frame = document.createElement('div');
  frame.className = 'product__frame';
  productPhoto.before(frame);
  frame.append(productPhoto);

  // Свечение под фото берёт цвета самого снимка
  productGallery.style.setProperty('--product-image', `url("${productPhoto.src}")`);

  if (window.matchMedia('(hover: hover)').matches) {
    frame.addEventListener('pointermove', (event) => {
      const rect = frame.getBoundingClientRect();
      frame.style.setProperty('--zoom-x', `${((event.clientX - rect.left) / rect.width) * 100}%`);
      frame.style.setProperty('--zoom-y', `${((event.clientY - rect.top) / rect.height) * 100}%`);
    });
    frame.addEventListener('pointerenter', () => frame.classList.add('product__frame--zoom'));
    frame.addEventListener('pointerleave', () => frame.classList.remove('product__frame--zoom'));
  }
}

onScrollFrame();
