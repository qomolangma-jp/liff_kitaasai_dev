(function (global) {
  function normalizeMemberStatus(statusValue) {
    const normalized = String(statusValue ?? '').trim().toLowerCase();

    if (!normalized) return 'not_registered';
    if (['ok', 'active', 'approved', 'registered', 'enable', 'enabled'].includes(normalized)) return 'ok';
    if (['ng', 'suspended', 'suspend', 'restricted', 'blocked', 'inactive'].includes(normalized)) return 'suspended';
    return 'not_registered';
  }

  function normalizeMemberCheckResponse(raw) {
    const payload = raw && raw.data ? raw.data : raw;

    if (!payload || typeof payload !== 'object') {
      return { isRegistered: false, status: 'not_registered', fullName: '', registerFormUrl: '' };
    }

    const status = normalizeMemberStatus(
      payload.status || payload.member_status || payload.memberStatus || payload.state || payload.result || payload.level
    );

    const hasIdentity = Boolean(
      payload.fullName ||
      payload.member_name ||
      payload.memberName ||
      payload.display_name ||
      payload.displayName ||
      payload.user_id ||
      payload.uid
    );

    const isRegistered = payload.isRegistered === true || payload.is_registered === true || status === 'ok' || status === 'suspended' || (status === 'not_registered' && hasIdentity);

    const fullName = payload.fullName || payload.member_name || payload.memberName || payload.display_name || payload.displayName || '';
    const registerFormUrl = payload.registerFormUrl || payload.register_form_url || '';

    return {
      ...payload,
      isRegistered,
      status,
      fullName,
      registerFormUrl
    };
  }

  const api = { normalizeMemberStatus, normalizeMemberCheckResponse };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.MemberCheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
