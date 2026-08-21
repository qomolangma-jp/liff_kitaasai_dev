(function (global) {
  function setAppState(root, state) {
    const states = {
      loading: 'app-loading',
      not_registered: 'app-status-card app-status-card--warning',
      suspended: 'app-status-card app-status-card--danger',
      app: 'app-screen'
    };

    const stateClass = states[state] || states.app;
    root.className = root.className.replace(/app-screen|app-status-card|app-loading/g, '').trim();
    if (stateClass) {
      root.classList.add(...stateClass.split(' '));
    }
  }

  function createMemberStatusCard(type, config = {}) {
    const icons = {
      not_registered: 'fa-user-plus',
      suspended: 'fa-user-slash',
      loading: 'fa-spinner'
    };

    const titles = {
      not_registered: '町民名簿に未登録です',
      suspended: '現在ご利用できません',
      loading: '読み込み中'
    };

    const text = config.text || '';
    const cta = config.cta || '';

    return `
      <div class="app-status-card ${type === 'suspended' ? 'app-status-card--danger' : ''}">
        <div class="app-status-card__icon"><i class="${icons[type] || 'fa-circle-info'}"></i></div>
        <h3 class="app-status-card__title">${titles[type] || '情報'}</h3>
        <p class="app-status-card__text">${text}</p>
        ${cta ? `<div class="mt-4">${cta}</div>` : ''}
      </div>
    `;
  }

  function buildAppHeader({ tabLabels = ['予約を申し込む', '空き状況カレンダー'], activeTab = 1 }) {
    return `
      <header class="app-header">
        <div class="app-header__tabbar">
          <button type="button" class="app-header__tab ${activeTab === 0 ? 'is-active' : ''}" data-tab="0">
            <i class="fa-solid fa-file-pen"></i>
            <span>${tabLabels[0]}</span>
          </button>
          <button type="button" class="app-header__tab ${activeTab === 1 ? 'is-active' : ''}" data-tab="1">
            <i class="fa-regular fa-calendar-days"></i>
            <span>${tabLabels[1]}</span>
          </button>
        </div>
      </header>
    `;
  }

  function buildUserSummary(userName, avatarUrl) {
    return `
      <article class="app-card app-card--soft">
        <div class="app-user-row">
          <img src="${avatarUrl || 'https://placehold.jp/96x96.png'}" alt="ユーザーアバター" class="app-user-row__avatar">
          <div>
            <div class="app-user-row__label">ログイン中の町民</div>
            <div class="app-user-row__name">${userName || '町民'} 様</div>
          </div>
        </div>
      </article>
    `;
  }

  const api = { setAppState, createMemberStatusCard, buildAppHeader, buildUserSummary };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.UiPatterns = api;
})(typeof window !== 'undefined' ? window : globalThis);
