(function () {
  function startModuleFlow() {
  var portal = document.querySelector('.portal[data-provisional-induction]');
  if (!portal) return;

  var moduleNum = portal.getAttribute('data-induction-module');
  var storageKey = 'provisional-induction-module-' + moduleNum;
  var stageOrder = ['journey', 'outcomes', 'video', 'complete', 'quiz'];
  var totalStages = stageOrder.length;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {}
    if (typeof window.provisionalRefreshPathway === 'function') {
      window.provisionalRefreshPathway();
    }
    try {
      window.dispatchEvent(new CustomEvent('portal:induction-progress', { detail: { module: moduleNum } }));
    } catch (_e) {}
  }

  function section(id) {
    return document.getElementById(id);
  }

  function showQuizSection() {
    var el = section('quiz');
    if (!el) return;
    el.classList.remove('gated-locked');
    el.classList.add('is-unlocked', 'quiz-visible');
    var banner = el.querySelector('.section-lock-banner');
    if (banner) banner.style.display = 'none';
  }

  function unlockStage(id) {
    var el = section(id);
    if (!el) return;
    el.classList.remove('gated-locked');
    el.classList.add('is-unlocked');
    var banner = el.querySelector('.section-lock-banner');
    if (banner) banner.style.display = 'none';
  }

  function startQuizFlow() {
    var state = loadState();
    if (!state.video) return false;
    state.quizStarted = true;
    saveState(state);
    showQuizSection();
    return true;
  }

  function isStageDone(id, state) {
    if (id === 'journey') return !!state.journey;
    if (id === 'outcomes') return !!state.outcomes;
    if (id === 'video') return !!state.video;
    if (id === 'quiz') return !!state.quizPass;
    var check = document.querySelector('[data-stage-check="' + id + '"]');
    return check && check.checked;
  }

  function refreshProgress() {
    var state = loadState();
    var done = 0;
    stageOrder.forEach(function (id) {
      if (isStageDone(id, state)) done++;
    });
    var pct = Math.round((done / totalStages) * 100);
    var fill = document.getElementById('overallProgressFill');
    var text = document.getElementById('overallProgressText');
    var count = document.getElementById('overallProgressCount');
    var modFill = document.getElementById('moduleProgressFill');
    var modText = document.getElementById('moduleProgressText');
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = pct + '% completed';
    if (count) count.textContent = done + ' / ' + totalStages;
    if (modFill) modFill.style.width = pct + '%';
    if (modText) modText.textContent = pct + '% completed';
    return state;
  }

  var refreshOutcomesUi = null;

  function afterUnlockRefresh() {
    if (refreshOutcomesUi) refreshOutcomesUi();
  }

  function restoreStageChecks(state) {
    if (state.journey) {
      document.querySelectorAll('[data-stage-check="journey"]').forEach(function (input) {
        input.checked = true;
      });
    }
    if (state.outcomes) {
      document.querySelectorAll('[data-stage-check="outcomes"]').forEach(function (input) {
        input.checked = true;
      });
    }
  }

  function applyUnlocks(state) {
    restoreStageChecks(state);
    if (isStageDone('journey', state)) {
      unlockStage('outcomes');
    }
    if (isStageDone('outcomes', state)) {
      unlockStage('video');
    }
    if (state.video) {
      unlockStage('complete');
      var wrap = document.getElementById('videoCompleteWrap');
      if (wrap) wrap.hidden = false;
      var vCheck = document.getElementById('videoCompleteCheck');
      if (vCheck) {
        vCheck.disabled = false;
        vCheck.checked = true;
      }
    }
    if (state.quizStarted || state.quizPass) {
      showQuizSection();
    }
    afterUnlockRefresh();
  }

  function initOutcomes() {
    var outcomesSection = document.getElementById('outcomes');
    if (!outcomesSection) return;

    var outcomesCheck = document.getElementById('outcomesCheck');
    var helper = document.getElementById('outcomesHelper');

    function getOutcomeItems() {
      return outcomesSection.querySelectorAll('[data-outcome-item]');
    }

    function reviewedCount() {
      var n = 0;
      getOutcomeItems().forEach(function (item) {
        if (item.classList.contains('clicked')) n++;
      });
      return n;
    }

    function updateOutcomesHelper() {
      if (!helper) return;
      var total = getOutcomeItems().length;
      var done = reviewedCount();
      var unlocked = outcomesSection.classList.contains('is-unlocked');
      if (!unlocked) {
        helper.textContent =
          'Complete the Induction Journey section to unlock Learning Outcomes.';
        return;
      }
      if (done >= total) {
        helper.textContent =
          'All learning outcomes opened. Tick the confirmation box below when you are ready to continue.';
      } else if (done === 0) {
        helper.textContent =
          'Click or tap each learning outcome in the list above. Every item must highlight before you can tick the confirmation box below.';
      } else {
        helper.textContent =
          'Click or tap each learning outcome above (' +
          done +
          ' of ' +
          total +
          ' opened). All must be highlighted before you can tick the confirmation box below.';
      }
    }

    function updateOutcomesCheck() {
      if (!outcomesCheck) return;
      var unlocked = outcomesSection.classList.contains('is-unlocked');
      var total = getOutcomeItems().length;
      var allReviewed = total > 0 && reviewedCount() >= total;
      outcomesCheck.disabled = !unlocked || !allReviewed;
      if (!unlocked) {
        outcomesCheck.checked = false;
      }
    }

    refreshOutcomesUi = function () {
      updateOutcomesHelper();
      updateOutcomesCheck();
    };

    if (!outcomesSection.dataset.outcomesBound) {
      outcomesSection.dataset.outcomesBound = '1';

      function toggleOutcomeItem(item) {
        if (!item || !outcomesSection.classList.contains('is-unlocked')) return;
        item.classList.toggle('clicked');
        item.setAttribute('aria-pressed', item.classList.contains('clicked') ? 'true' : 'false');
        refreshOutcomesUi();
      }

      outcomesSection.addEventListener('click', function (e) {
        toggleOutcomeItem(e.target.closest('[data-outcome-item]'));
      });

      outcomesSection.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var item = e.target.closest('[data-outcome-item]');
        if (!item) return;
        e.preventDefault();
        toggleOutcomeItem(item);
      });

      document.querySelectorAll('[data-stage-check="outcomes"]').forEach(function (input) {
        input.addEventListener('change', function () {
          var state = loadState();
          state.outcomes = input.checked;
          saveState(state);
          applyUnlocks(state);
          refreshProgress();
          if (refreshOutcomesUi) refreshOutcomesUi();
        });
      });
    }

    refreshOutcomesUi();
  }

  document.querySelectorAll('[data-stage-check="journey"]').forEach(function (input) {
    input.addEventListener('change', function () {
      var state = loadState();
      state.journey = input.checked;
      saveState(state);
      applyUnlocks(state);
      refreshProgress();
      afterUnlockRefresh();
    });
  });

  var video = document.getElementById('moduleVideo');
  var statusEl = document.getElementById('moduleVideoStatus');
  var SEEK_TOLERANCE = 0.35;
  var maxWatchedTime = 0;
  var suppressSeekGuard = false;

  function formatWatchProgress() {
    if (!video || !video.duration || !isFinite(video.duration)) {
      return 'Watched 0%';
    }
    var pct = Math.min(100, Math.round((maxWatchedTime / video.duration) * 100));
    return 'Watched ' + pct + '%';
  }

  function persistMaxWatched(state) {
    if (maxWatchedTime > (state.maxWatchedTime || 0)) {
      state.maxWatchedTime = maxWatchedTime;
      saveState(state);
    }
  }

  function clampForwardSeek() {
    if (!video || suppressSeekGuard) return;
    var state = loadState();
    if (state.video) return;

    var cap = Math.max(0, maxWatchedTime);
    if (video.currentTime > cap + SEEK_TOLERANCE) {
      suppressSeekGuard = true;
      video.currentTime = cap;
      suppressSeekGuard = false;
      if (statusEl && !state.video) {
        statusEl.textContent = formatWatchProgress();
        statusEl.classList.remove('is-done');
      }
    }
  }

  function markVideoComplete() {
    var state = loadState();
    if (state.video) return;
    state.video = true;
    if (video && video.duration && isFinite(video.duration)) {
      state.maxWatchedTime = video.duration;
      maxWatchedTime = video.duration;
    }
    saveState(state);
    if (statusEl) {
      statusEl.textContent = 'Video completed. You can now open Ready for the Quiz.';
      statusEl.classList.add('is-done');
    }
    applyUnlocks(state);
    refreshProgress();
  }

  if (video) {
    var initialState = loadState();
    maxWatchedTime = Number(initialState.maxWatchedTime) || 0;
    if (initialState.video) {
      maxWatchedTime = Math.max(maxWatchedTime, video.duration || 0);
    } else if (statusEl) {
      statusEl.textContent = formatWatchProgress();
    }

    video.addEventListener('loadedmetadata', function () {
      var state = loadState();
      if (state.video) return;
      maxWatchedTime = Math.min(Number(state.maxWatchedTime) || 0, video.duration || 0);
      if (maxWatchedTime > 0) {
        suppressSeekGuard = true;
        video.currentTime = maxWatchedTime;
        suppressSeekGuard = false;
      }
      if (statusEl && !state.video) statusEl.textContent = formatWatchProgress();
    });

    video.addEventListener('timeupdate', function () {
      var state = loadState();
      if (state.video) return;
      var t = video.currentTime;
      if (t > maxWatchedTime + SEEK_TOLERANCE) {
        clampForwardSeek();
        return;
      }
      if (t > maxWatchedTime) {
        maxWatchedTime = t;
        persistMaxWatched(state);
      }
      if (statusEl && !state.video) statusEl.textContent = formatWatchProgress();
    });

    video.addEventListener('seeking', clampForwardSeek);
    video.addEventListener('seeked', clampForwardSeek);

    video.addEventListener('ended', function () {
      var state = loadState();
      if (state.video) return;
      if (video.duration && maxWatchedTime < video.duration - SEEK_TOLERANCE) {
        clampForwardSeek();
        if (statusEl) {
          statusEl.textContent = formatWatchProgress();
        }
        return;
      }
      markVideoComplete();
    });
  }

  document.querySelectorAll('a[href="#quiz"], #startQuizBtn').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var state = loadState();
      if (!state.video) {
        e.preventDefault();
        alert('Please watch the module video before starting the quiz.');
        return;
      }
      e.preventDefault();
      startQuizFlow();
      location.hash = 'quiz';
      var quiz = section('quiz');
      if (quiz) quiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  if (location.hash === '#quiz') {
    var st = loadState();
    if (st.video) {
      unlockStage('complete');
      if (st.quizStarted || st.quizPass) {
        showQuizSection();
      }
    }
  }

  document.querySelectorAll('[data-scroll]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sel = btn.getAttribute('data-scroll');
      var target = document.querySelector(sel);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  window.provisionalInductionMarkQuizPass = function () {
    var state = loadState();
    state.quizPass = true;
    saveState(state);
    applyUnlocks(state);
    refreshProgress();
  };

  window.provisionalInductionGetState = loadState;
  window.inductionRefreshProgress = refreshProgress;

  initOutcomes();
  var state = loadState();
  applyUnlocks(state);
  refreshProgress();
  }

  function boot() {
    var ready = window.__portalInductionProgressReady;
    if (ready && typeof ready.then === 'function') {
      ready.then(startModuleFlow).catch(startModuleFlow);
      return;
    }
    startModuleFlow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
