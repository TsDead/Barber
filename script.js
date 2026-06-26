/* ============================================
   АНИМАЦИЯ СООБЩЕНИЙ В HERO
   ============================================ */
const tgMessages = [
  { type: 'in', text: '👋 Привет! Я — бот записи в барбершоп.<br><br>Помогу выбрать услугу, мастера и время.', time: '14:32' },
  { type: 'in', text: 'Что хотите сделать?', time: '14:32', menu: true, menuItems: [
    { text: '✂️ Записаться', primary: true },
    { text: '📅 Мои записи' },
    { text: '💰 Цены и акции' }
  ]},
  { type: 'out', text: 'Записаться', time: '14:33 ✓✓' },
  { type: 'in', text: 'Отлично! Какая услуга?', time: '14:33', menu: true, menuItems: [
    { text: '✂️ Стрижка · 1 500 ₽', primary: true },
    { text: '🪒 Бритьё · 1 200 ₽', primary: true },
    { text: '🎨 Окрашивание · 2 800 ₽', primary: true }
  ]},
  { type: 'out', text: '✂️ Стрижка', time: '14:34 ✓✓' },
  { type: 'in', text: '✅ Запись подтверждена!<br><br>📅 Завтра, 11:30<br>👨 Алексей<br>💰 1 500 ₽', time: '14:35 ✓✓', success: true }
];

function animateTgChat() {
  const body = document.getElementById('tgBody');
  if (!body) return;
  body.innerHTML = '';
  let delay = 800;

  tgMessages.forEach((msg) => {
    setTimeout(() => {
      const div = document.createElement('div');
      div.className = `tg-msg tg-msg--${msg.type === 'in' ? 'bot' : 'user'}`;
      let bubble = `<div class="tg-msg-bubble${msg.menu ? ' tg-msg-bubble--menu' : ''}${msg.success ? ' tg-msg-bubble--success' : ''}">${msg.text}`;
      if (msg.menu && msg.menuItems) {
        bubble += msg.menuItems.map(it =>
          `<div class="tg-btn${it.primary ? ' tg-btn--primary' : ''}">${it.text}</div>`
        ).join('');
      }
      bubble += '</div><div class="tg-time">' + msg.time + '</div>';
      div.innerHTML = bubble;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }, delay);
    delay += 1800;
  });

  setTimeout(animateTgChat, 13000);
}
setTimeout(animateTgChat, 1500);

/* ============================================
   АНИМАЦИЯ ЧАСТИЦ НА ФОНЕ
   ============================================ */
(function initParticles() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];
  const COUNT = 50;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5
    });
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255, 182, 39, 0.5)';
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = 'rgba(255, 182, 39, 0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
})();

/* ============================================
   АНИМАЦИЯ СЧЁТЧИКОВ СТАТИСТИКИ (ИСПРАВЛЕНО)
   ============================================ */
(function animateCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  function animate(el) {
    const target = parseInt(el.dataset.count, 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const duration = 2000;
    const startTime = performance.now();

    el.textContent = prefix + '0' + suffix;

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(target * eased);
      el.textContent = prefix + current + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = prefix + target + suffix;
      }
    }
    requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animate(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    counters.forEach(counter => io.observe(counter));
  } else {
    counters.forEach(animate);
  }
})();

/* ============================================
   КАЛЬКУЛЯТОР
   ============================================ */
(function () {
  const PRICES = {
    start: { price: 2490, label: 'Start' },
    standard: { price: 4990, label: 'Standard' },
    business: { price: 9990, label: 'Business' }
  };
  const PAYMENTS_EXTRA = 590;
  const LOYALTY_EXTRA = 390;

  const mastersSlider = document.getElementById('mastersSlider');
  const mastersVal = document.getElementById('mastersVal');
  const planGroup = document.getElementById('planGroup');
  const extraPayments = document.getElementById('extraPayments');
  const extraLoyalty = document.getElementById('extraLoyalty');

  const priceFromEl = document.getElementById('priceFrom');
  const planLabelEl = document.getElementById('planLabel');
  const tariffPriceEl = document.getElementById('tariffPrice');
  const paymentsPriceEl = document.getElementById('paymentsPrice');
  const loyaltyPriceEl = document.getElementById('loyaltyPrice');

  const formatPrice = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

  const getSelectedPlan = () => {
    const checked = planGroup.querySelector('input[name="plan"]:checked');
    return checked ? checked.value : 'standard';
  };

  const syncPlan = () => {
    const masters = parseInt(mastersSlider.value, 10) || 0;
    let target = 'start';
    if (masters > 3) target = 'standard';
    if (masters > 10) target = 'business';
    const radio = planGroup.querySelector(`input[value="${target}"]`);
    if (radio && !radio.checked) radio.checked = true;
  };

  function recalc() {
    const plan = getSelectedPlan();
    const planData = PRICES[plan];
    const paymentsExtra = extraPayments.checked ? PAYMENTS_EXTRA : 0;
    const loyaltyExtra = extraLoyalty.checked ? LOYALTY_EXTRA : 0;
    const total = planData.price + paymentsExtra + loyaltyExtra;

    animateNumber(priceFromEl, total);
    planLabelEl.textContent = planData.label;
    tariffPriceEl.textContent = formatPrice(planData.price);
    paymentsPriceEl.textContent = extraPayments.checked ? '+' + formatPrice(PAYMENTS_EXTRA) : '0 ₽';
    loyaltyPriceEl.textContent = extraLoyalty.checked ? '+' + formatPrice(LOYALTY_EXTRA) : '0 ₽';
  }

  function animateNumber(el, target) {
    const start = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
    const duration = 400;
    const startTime = performance.now();
    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = start + (target - start) * eased;
      el.textContent = new Intl.NumberFormat('ru-RU').format(Math.round(val));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  mastersSlider.addEventListener('input', () => {
    mastersVal.textContent = mastersSlider.value;
    syncPlan();
    recalc();
  });
  planGroup.addEventListener('change', recalc);
  extraPayments.addEventListener('change', recalc);
  extraLoyalty.addEventListener('change', recalc);

  recalc();

  /* ===== HEADER SCROLL ===== */
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  /* ===== MOBILE MENU ===== */
  const burger = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobileMenu');
  if (burger) {
    burger.addEventListener('click', () => {
      burger.classList.toggle('active');
      mobileMenu.classList.toggle('open');
    });
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        burger.classList.remove('active');
        mobileMenu.classList.remove('open');
      });
    });
  }

  /* ===== FORM ===== */
  const form = document.getElementById('leadForm');
  const success = document.getElementById('formSuccess');
  const error = document.getElementById('formError');
  const phone = document.getElementById('phone');
  const telegram = document.getElementById('telegram');
  const submitBtn = document.getElementById('submitBtn');

  phone.addEventListener('input', (e) => {
    let d = e.target.value.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0, 11);
    let f = '+7';
    if (d.length > 1) f += ' (' + d.slice(1, 4);
    if (d.length >= 5) f += ') ' + d.slice(4, 7);
    if (d.length >= 8) f += '-' + d.slice(7, 9);
    if (d.length >= 10) f += '-' + d.slice(9, 11);
    e.target.value = f;
  });

  telegram.addEventListener('input', (e) => {
    let v = e.target.value.replace(/[^a-zA-Z0-9_@]/g, '');
    if (v && !v.startsWith('@')) v = '@' + v;
    v = '@' + v.replace(/^@+/, '').slice(0, 32);
    e.target.value = v;
  });

  const shake = (el) => {
    el.style.animation = 'shake 0.4s';
    setTimeout(() => { el.style.animation = ''; }, 400);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const phoneVal = phone.value.replace(/\D/g, '');
    const agree = document.getElementById('agree').checked;

    if (name.length < 2) { document.getElementById('name').focus(); shake(document.getElementById('name')); return; }
    if (phoneVal.length < 11) { phone.focus(); shake(phone); return; }
    if (!agree) return;

    const originalText = submitBtn.querySelector('.btn__text').textContent;
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn__text').textContent = '...';
    error.hidden = true;
    success.hidden = true;

    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: phone.value,
          telegram: telegram.value.trim(),
          source: 'landing',
          timestamp: new Date().toISOString()
        })
      });
      if (!res.ok) throw new Error('Server error');

      success.hidden = false;
      submitBtn.querySelector('.btn__text').textContent = '✓ Отправлено';
      submitBtn.style.background = 'var(--success)';
      form.reset();
      document.getElementById('agree').checked = true;
      setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn__text').textContent = originalText;
        submitBtn.style.background = '';
        success.hidden = true;
        recalc();
      }, 4000);
    } catch (err) {
      error.hidden = false;
      submitBtn.disabled = false;
      submitBtn.querySelector('.btn__text').textContent = originalText;
    }
  });

  /* ===== SMOOTH SCROLL ===== */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId === '#' || targetId.length < 2) return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const headerHeight = header.offsetHeight;
        const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* ===== REVEAL ON SCROLL ===== */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

    document.querySelectorAll(
      '.section__head, .timeline__item, .demo-card, .feature, .calc, .form, .stat, .cta__content > *'
    ).forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${(i % 5) * 0.05}s`;
      io.observe(el);
    });
  }

  /* ===== PARALLAX HERO ===== */
  const heroMockup = document.querySelector('.hero__mockup');
  if (heroMockup && window.matchMedia('(min-width: 1024px)').matches) {
    window.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      heroMockup.style.transform = `translate(${x}px, ${y}px)`;
    }, { passive: true });
  }
})();

/* ===== KEYFRAMES ===== */
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-6px); }
    40%, 80% { transform: translateX(6px); }
  }
`;
document.head.appendChild(styleSheet);
