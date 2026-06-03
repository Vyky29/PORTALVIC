(function () {
  var MODULES = 6;

  function stateFor(n) {
    try {
      return JSON.parse(localStorage.getItem('provisional-induction-module-' + n) || '{}');
    } catch (e) {
      return {};
    }
  }

  function statusFor(n) {
    var s = stateFor(n);
    if (s.quizPass) return { label: 'Completed', cls: 'status-complete' };
    if (s.video) return { label: 'Quiz pending', cls: 'status-in-progress' };
    if (s.journey || Object.keys(s).length) return { label: 'In progress', cls: 'status-in-progress' };
    return { label: 'Not started', cls: 'status-not-started' };
  }

  window.provisionalRefreshPathway = function () {
    for (var i = 1; i <= MODULES; i++) {
      var badge = document.getElementById('moduleStatus' + i);
      if (!badge) continue;
      var st = statusFor(i);
      badge.textContent = st.label;
      badge.className = 'module-status-badge ' + st.cls;
    }
    if (
      window.provisionalInductionCertificate &&
      typeof window.provisionalInductionCertificate.refreshDashboardPanel === 'function'
    ) {
      window.provisionalInductionCertificate.refreshDashboardPanel();
    }
  };

  provisionalRefreshPathway();
})();
