/**
 * General Induction completion certificate (downloadable SVG with logo).
 *
 * Learner name for PORTALVIC (set any one before the learner opens induction):
 *   window.portalVicLearner = { displayName: 'Jane Smith' };
 *   sessionStorage.setItem('portalvic_staff_display_name', 'Jane Smith');
 *   localStorage.setItem('portalvic_staff_display_name', 'Jane Smith');
 *   URL: ?learnerName=Jane+Smith  or  ?name=Jane+Smith
 */
(function () {
  var MODULES = 6;
  var TRAINING_LABEL = 'clubSENsational General Induction';
  var LOGO_URL = '/induction-assets/clubsensational-portal-logo.png';
  var COMPLETE_KEY = 'provisional-induction-training-complete';
  var logoDataUriCache = null;

  function escapeXml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slugify(value) {
    return (
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'certificate'
    );
  }

  function formatDateLabel(date) {
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  function moduleState(n) {
    try {
      return JSON.parse(localStorage.getItem('provisional-induction-module-' + n) || '{}');
    } catch (e) {
      return {};
    }
  }

  function allModulesPassed() {
    for (var i = 1; i <= MODULES; i++) {
      if (!moduleState(i).quizPass) return false;
    }
    return true;
  }

  function markTrainingCompleteIfReady() {
    if (!allModulesPassed()) return false;
    try {
      localStorage.setItem(COMPLETE_KEY, '1');
      localStorage.setItem('provisional-induction-completed-at', new Date().toISOString());
    } catch (e) {}
    refreshDashboardPanel();
    return true;
  }

  function isTrainingMarkedComplete() {
    try {
      return localStorage.getItem(COMPLETE_KEY) === '1' || allModulesPassed();
    } catch (e) {
      return allModulesPassed();
    }
  }

  function readNameFromStorage(key) {
    try {
      var v = sessionStorage.getItem(key) || localStorage.getItem(key);
      return v && String(v).trim() ? String(v).trim() : '';
    } catch (e) {
      return '';
    }
  }

  function getLearnerName() {
    if (window.portalVicLearner) {
      var pv =
        window.portalVicLearner.displayName ||
        window.portalVicLearner.name ||
        window.portalVicLearner.fullName;
      if (pv && String(pv).trim()) return String(pv).trim().replace(/\s+/g, ' ');
    }
    if (window.clubSensationalLearner) {
      var cs =
        window.clubSensationalLearner.displayName ||
        window.clubSensationalLearner.name;
      if (cs && String(cs).trim()) return String(cs).trim().replace(/\s+/g, ' ');
    }

    var params = new URLSearchParams(window.location.search || '');
    var fromUrl = params.get('learnerName') || params.get('name') || params.get('staffName');
    if (fromUrl && String(fromUrl).trim()) {
      return decodeURIComponent(String(fromUrl).trim()).replace(/\s+/g, ' ');
    }

    var keys = [
      'portalvic_staff_display_name',
      'portalvic_learner_name',
      'PORTALVIC_STAFF_DISPLAY_NAME',
      'staff_display_name',
    ];
    for (var i = 0; i < keys.length; i++) {
      var stored = readNameFromStorage(keys[i]);
      if (stored) return stored.replace(/\s+/g, ' ');
    }

    return '';
  }

  function loadLogoDataUri() {
    if (logoDataUriCache) return Promise.resolve(logoDataUriCache);
    return fetch(LOGO_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('logo fetch failed');
        return res.blob();
      })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            logoDataUriCache = reader.result;
            resolve(logoDataUriCache);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      });
  }

  function buildCertificateSvg(meta) {
    var issuedOn = formatDateLabel(meta.date || new Date());
    var learnerName = escapeXml(meta.learnerName);
    var trainingLabel = escapeXml(meta.trainingLabel || TRAINING_LABEL);
    var logoHref = escapeXml(meta.logoDataUri || '');

    return [
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="1131" viewBox="0 0 1600 1131" role="img" aria-label="clubSENsational General Induction certificate">',
      '<defs>',
      '<linearGradient id="certBorder" x1="0%" y1="0%" x2="100%" y2="100%">',
      '<stop offset="0%" stop-color="#f0b323"/>',
      '<stop offset="55%" stop-color="#f5cc6a"/>',
      '<stop offset="100%" stop-color="#d79d15"/>',
      '</linearGradient>',
      '<linearGradient id="certHeader" x1="0%" y1="0%" x2="100%" y2="100%">',
      '<stop offset="0%" stop-color="#0f2840"/>',
      '<stop offset="100%" stop-color="#1a4a6e"/>',
      '</linearGradient>',
      '</defs>',
      '<rect width="1600" height="1131" fill="#fef8ec"/>',
      '<rect x="34" y="34" width="1532" height="1063" rx="34" fill="url(#certBorder)"/>',
      '<rect x="54" y="54" width="1492" height="1023" rx="28" fill="#ffffff"/>',
      '<rect x="86" y="86" width="1428" height="220" rx="28" fill="url(#certHeader)"/>',
      logoHref
        ? '<image xlink:href="' +
          logoHref +
          '" href="' +
          logoHref +
          '" x="1180" y="108" width="280" height="120" preserveAspectRatio="xMidYMid meet" opacity="0.98"/>'
        : '',
      '<text x="132" y="158" font-family="Montserrat, Arial, sans-serif" font-size="28" font-weight="800" fill="#f5cc6a" letter-spacing="3">CLUBSENSATIONAL</text>',
      '<text x="132" y="212" font-family="Montserrat, Arial, sans-serif" font-size="62" font-weight="800" fill="#ffffff">Certificate of Completion</text>',
      '<text x="132" y="258" font-family="Montserrat, Arial, sans-serif" font-size="22" font-weight="600" fill="rgba(255,255,255,0.9)">General Induction training completed successfully</text>',
      '<text x="800" y="400" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-size="30" fill="#5d7688">This certifies that</text>',
      '<text x="800" y="498" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-size="76" font-weight="700" fill="#0f2840">',
      learnerName,
      '</text>',
      '<line x1="426" y1="522" x2="1174" y2="522" stroke="#e8d4a8" stroke-width="2"/>',
      '<text x="800" y="604" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="30" font-weight="600" fill="#445e70">has successfully completed</text>',
      '<text x="800" y="676" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="50" font-weight="800" fill="#9a6b00">',
      trainingLabel,
      '</text>',
      '<text x="800" y="728" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="22" font-weight="600" fill="#5d7688">Six modules � Video learning � Module quizzes passed</text>',
      '<rect x="182" y="810" width="1236" height="168" rx="28" fill="#fffaf0" stroke="#f3e4c6" stroke-width="2"/>',
      '<text x="250" y="868" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#7a5200">Issued on</text>',
      '<text x="250" y="918" font-family="Montserrat, Arial, sans-serif" font-size="36" font-weight="800" fill="#0f2840">',
      escapeXml(issuedOn),
      '</text>',
      '<text x="1068" y="868" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#7a5200">Authorised by</text>',
      '<line x1="934" y1="900" x2="1202" y2="900" stroke="#f0b323" stroke-width="3"/>',
      '<text x="1068" y="942" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="24" font-weight="800" fill="#0f2840">clubSENsational</text>',
      '<text x="1068" y="972" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="18" font-weight="600" fill="#5d7688">Staff Learning � General Induction</text>',
      '</svg>',
    ].join('');
  }

  function downloadSvg(filename, content) {
    var blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function downloadCertificate() {
    var learnerName = getLearnerName();
    if (!learnerName) {
      alert(
        'Your name will appear on the certificate once General Induction is opened from PORTALVIC. ' +
          'For testing, PORTALVIC can set window.portalVicLearner.displayName or add ?learnerName=Your+Name to the URL.'
      );
      return false;
    }
    if (!allModulesPassed()) {
      alert('Complete all six module quizzes before downloading your certificate.');
      return false;
    }

    return loadLogoDataUri()
      .then(function (logoDataUri) {
        var svg = buildCertificateSvg({
          learnerName: learnerName,
          trainingLabel: TRAINING_LABEL,
          logoDataUri: logoDataUri,
          date: new Date(),
        });
        downloadSvg(
          slugify('general-induction-' + learnerName) + '-certificate.svg',
          svg
        );
        return true;
      })
      .catch(function () {
        var svg = buildCertificateSvg({
          learnerName: learnerName,
          trainingLabel: TRAINING_LABEL,
          date: new Date(),
        });
        downloadSvg(
          slugify('general-induction-' + learnerName) + '-certificate.svg',
          svg
        );
        return true;
      });
  }

  function ensureResultActions(scoreCard) {
    if (!scoreCard) return null;
    var wrap = scoreCard.querySelector('.module-result-actions');
    if (wrap) return wrap;
    wrap = document.createElement('div');
    wrap.className = 'module-result-actions';
    var nextBtn = scoreCard.querySelector('.quiz-next-btn');
    var certBtn = scoreCard.querySelector('[data-download-certificate]');
    if (certBtn) wrap.appendChild(certBtn);
    if (nextBtn) wrap.appendChild(nextBtn);
    scoreCard.appendChild(wrap);
    return wrap;
  }

  function showModule6FinalResult(scoreCard, passed) {
    if (!scoreCard || !passed) return;
    markTrainingCompleteIfReady();
    var title = scoreCard.querySelector('h2');
    var scoreValue = scoreCard.querySelector('.score-value');
    var scoreMsg = scoreCard.querySelector('.score-msg');
    var nextBtn = scoreCard.querySelector('.quiz-next-btn');
    var certBtn = scoreCard.querySelector('[data-download-certificate]');

    scoreCard.classList.add('module-result-card', 'show');
    ensureResultActions(scoreCard);

    if (!allModulesPassed()) {
      scoreCard.classList.remove('module-result-card--final', 'module-result-card--success');
      if (title) title.textContent = 'Module 6 passed';
      if (scoreValue) scoreValue.textContent = '8/8';
      if (scoreMsg) {
        scoreMsg.textContent =
          'You passed this module quiz. Complete any remaining modules on the pathway, then return here to download your certificate.';
      }
      if (certBtn) {
        certBtn.hidden = true;
        certBtn.style.display = 'none';
      }
      if (nextBtn) nextBtn.style.display = 'inline-flex';
      return;
    }

    scoreCard.classList.add('module-result-card--final');
    scoreCard.classList.remove('module-result-card--success');
    if (title) title.textContent = 'Congratulations';
    if (scoreValue) scoreValue.textContent = 'Training complete';
    if (scoreMsg) {
      scoreMsg.textContent =
        'You have completed all six modules of General Induction. Download your certificate to save your record.';
    }
    if (nextBtn) {
      nextBtn.textContent = 'Return to General Induction';
      nextBtn.style.display = 'inline-flex';
    }
    if (certBtn) {
      certBtn.hidden = false;
      certBtn.style.display = 'inline-flex';
      certBtn.onclick = function () {
        downloadCertificate();
      };
    }
  }

  function refreshDashboardPanel() {
    var panel = document.getElementById('inductionCertificatePanel');
    if (!panel) return;
    var ready = isTrainingMarkedComplete();
    panel.hidden = !ready;
    if (!ready) return;

    var nameEl = document.getElementById('inductionCertificateLearnerName');
    var name = getLearnerName();
    if (nameEl) {
      nameEl.textContent = name
        ? 'Certificate for ' + name
        : 'Your name will be added when you open induction from PORTALVIC.';
    }
  }

  function bindDashboardDownload() {
    var btn = document.getElementById('downloadInductionCertificate');
    if (!btn) return;
    btn.addEventListener('click', function () {
      downloadCertificate();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    refreshDashboardPanel();
    bindDashboardDownload();
  });

  window.provisionalInductionCertificate = {
    getLearnerName: getLearnerName,
    allModulesPassed: allModulesPassed,
    markTrainingCompleteIfReady: markTrainingCompleteIfReady,
    downloadCertificate: downloadCertificate,
    showModule6FinalResult: showModule6FinalResult,
    refreshDashboardPanel: refreshDashboardPanel,
  };
})();
