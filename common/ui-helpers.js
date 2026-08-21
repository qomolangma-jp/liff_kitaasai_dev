(function (global) {
  function setScreenState({ loading, notRegistered, suspended, app }, next) {
    const map = {
      loading,
      not_registered: notRegistered,
      suspended,
      app
    };

    Object.entries(map).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle('hidden', key !== next);
    });

    return next;
  }

  function hideToast(toastEl) {
    if (!toastEl) return;
    toastEl.classList.add('hidden');
  }

  function showToast({ toast, toastInner, message, type = 'info', duration = 2600 }) {
    if (!toast || !toastInner) return;

    const palette = {
      info: 'bg-slate-900 text-white',
      success: 'bg-emerald-600 text-white',
      warning: 'bg-amber-500 text-white',
      error: 'bg-rose-600 text-white'
    };

    toastInner.className = `rounded-xl px-4 py-3 text-sm font-semibold shadow-xl ${palette[type] || palette.info}`;
    toastInner.textContent = message;
    toast.classList.remove('hidden');

    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => hideToast(toast), duration);
  }

  function bindDevPanel({ panel, buttons, onChange, defaultValue = 'ok' }) {
    if (!panel) return;
    panel.classList.remove('hidden');

    const items = Array.isArray(buttons) ? buttons : panel.querySelectorAll('[data-dev-state]');
    const setCurrent = (mode) => {
      items.forEach((btn) => {
        const active = btn.dataset.devState === mode;
        btn.classList.toggle('bg-emerald-500', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('font-semibold', active);
        btn.classList.toggle('bg-slate-700', !active);
        btn.classList.toggle('text-slate-300', !active);
      });
      if (typeof onChange === 'function') onChange(mode);
    };

    items.forEach((btn) => {
      btn.addEventListener('click', () => setCurrent(btn.dataset.devState));
    });

    setCurrent(defaultValue);
    return setCurrent;
  }

  function setTabState({ tabs, activeKey }) {
    if (!tabs || !Array.isArray(tabs)) return;
    tabs.forEach((tab) => {
      const isActive = String(tab.dataset.tab || tab.id).includes(String(activeKey));
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
  }

  const api = {
    setScreenState,
    showToast,
    hideToast,
    bindDevPanel,
    setTabState
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.AppUi = api;
})(typeof window !== 'undefined' ? window : globalThis);
