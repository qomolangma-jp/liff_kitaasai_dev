(function (global) {
  function isLocalRuntime(locationObj = global.location || {}) {
    const hostname = (locationObj.hostname || '').toLowerCase();
    const protocol = (locationObj.protocol || '').toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || protocol === 'file:';
  }

  function normalizeMemberStatus(statusValue) {
    const normalized = String(statusValue ?? '').trim().toLowerCase();
    if (!normalized) return 'not_registered';
    if (['ok', 'active', 'approved', 'registered', 'enable', 'enabled'].includes(normalized)) return 'ok';
    if (['ng', 'suspended', 'suspend', 'restricted', 'blocked', 'inactive'].includes(normalized)) return 'suspended';
    return 'not_registered';
  }

  function resolveMemberAccess(memberInfo = {}) {
    const payload = memberInfo || {};
    const status = normalizeMemberStatus(payload.status || payload.member_status || payload.memberStatus || payload.state);
    const isRegistered = payload.isRegistered === true || payload.is_registered === true || status === 'ok' || status === 'suspended';

    if (!isRegistered || status === 'not_registered') {
      return {
        isAllowed: false,
        state: 'not_registered',
        member: payload,
        status: 'not_registered'
      };
    }

    if (status === 'suspended') {
      return {
        isAllowed: false,
        state: 'suspended',
        member: payload,
        status: 'suspended'
      };
    }

    return {
      isAllowed: true,
      state: 'app',
      member: {
        ...payload,
        fullName: payload.fullName || payload.member_name || payload.memberName || payload.display_name || payload.displayName || '町民',
        status: 'ok'
      },
      status: 'ok'
    };
  }

  const api = { isLocalRuntime, normalizeMemberStatus, resolveMemberAccess };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.LiffApp = api;
})(typeof window !== 'undefined' ? window : globalThis);
