(function () {
  var portal = document.querySelector('.portal[data-provisional-induction]');
  if (!portal) return;

  var moduleNum = portal.getAttribute('data-induction-module');
  var config = window.inductionQuizConfig;
  if (!config) return;

  var suffix = '_m' + moduleNum;
  var root = document.getElementById('quizInlineM' + moduleNum);
  if (!root) return;

  var total = 8;
  var correctAnswers = config.correct || {};
  var matchFeedback = config.matchFeedback || 'Review the correct matches.';
  var progressFill = document.getElementById('progressFillM' + moduleNum);
  var progressText = document.getElementById('progressTextM' + moduleNum);
  var quizForm = document.getElementById('quizFormM' + moduleNum);
  var pool8 = document.getElementById('pool8M' + moduleNum);
  var scoreCard = document.getElementById('scoreCardM' + moduleNum);
  var scoreValue = document.getElementById('scoreValueM' + moduleNum);
  var scoreMsg = document.getElementById('scoreMsgM' + moduleNum);
  var submitBtn = document.getElementById('submitBtnM' + moduleNum);
  var submitHint = document.getElementById('quizSubmitHintM' + moduleNum);
  var matchCount = root.querySelectorAll('.q-card[data-q="8"] .match-slot').length || 4;

  function multiKey(values) {
    return values.slice().sort().join('');
  }

  function countAnswered() {
    var n = 0;
    [1, 2, 3, 6, 7].forEach(function (i) {
      if (root.querySelector('input[name="q' + i + suffix + '"]:checked')) n++;
    });
    if (root.querySelectorAll('input[name="q4' + suffix + '"]:checked').length > 0) n++;
    if (root.querySelectorAll('input[name="q5' + suffix + '"]:checked').length > 0) n++;
    var filled = root.querySelectorAll('.q-card[data-q="8"] .match-slot .slot-drop .match-chip').length;
    if (filled === matchCount) n++;
    return n;
  }

  function updateProgress() {
    var answered = countAnswered();
    if (progressFill) progressFill.style.width = (answered / total) * 100 + '%';
    if (progressText) progressText.textContent = answered + ' of ' + total + ' answered';
    if (submitBtn) submitBtn.disabled = answered < total;
    if (submitHint) {
      submitHint.textContent =
        answered < total
          ? 'Answer all ' + total + ' questions to enable Submit (' + answered + ' of ' + total + ' done).'
          : 'All questions answered. You can submit your quiz.';
    }
  }

  if (quizForm) quizForm.addEventListener('change', updateProgress);

  function initMatch(container, poolEl) {
    if (!container || !poolEl) return;
    var slots = container.querySelectorAll('.match-slot');
    var dragged = null;
    var selectedChip = null;

    function clearSelected() {
      container.querySelectorAll('.match-chip.selected').forEach(function (el) {
        el.classList.remove('selected');
      });
      selectedChip = null;
    }

    function moveChipToSlot(chip, slot) {
      if (!chip || !slot) return;
      var dropZone = slot.querySelector('.slot-drop');
      if (!dropZone) return;
      var existing = dropZone.querySelector('.match-chip');
      if (existing) poolEl.appendChild(existing);
      dropZone.appendChild(chip);
      slot.classList.add('filled');
    }

    slots.forEach(function (slot) {
      slot.addEventListener('click', function () {
        if (!selectedChip) return;
        moveChipToSlot(selectedChip, slot);
        clearSelected();
        updateProgress();
      });
    });

    poolEl.querySelectorAll('.match-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        clearSelected();
        selectedChip = chip;
        chip.classList.add('selected');
      });
    });

    container.addEventListener('dragstart', function (e) {
      if (!e.target.classList.contains('match-chip')) return;
      dragged = e.target;
      e.dataTransfer.effectAllowed = 'move';
      dragged.classList.add('dragging');
    });
    container.addEventListener('dragend', function (e) {
      if (e.target.classList.contains('match-chip')) e.target.classList.remove('dragging');
      dragged = null;
    });
    container.addEventListener('dragover', function (e) {
      e.preventDefault();
    });
    container.addEventListener('drop', function (e) {
      e.preventDefault();
      var slot = e.target.closest('.match-slot');
      if (slot && dragged) {
        moveChipToSlot(dragged, slot);
        updateProgress();
      }
    });
  }

  initMatch(root.querySelector('.q-card[data-q="8"]'), pool8);

  function showFeedback(id, correct, msg) {
    var el = document.getElementById('f' + id + 'M' + moduleNum);
    if (!el) return;
    el.className = 'feedback ' + (correct ? 'correct' : 'incorrect');
    el.innerHTML = (correct ? '&#10003; ' : '&#10007; ') + msg;
    el.style.display = 'flex';
  }

  function tfLabel(value) {
    return value === 'T' ? 'True' : 'False';
  }

  if (quizForm) {
    quizForm.onsubmit = function (e) {
      e.preventDefault();
      if (countAnswered() < total) {
        alert('Please answer all 8 questions before submitting.');
        return;
      }

      var score = 0;
      var results = [];

      [1, 2, 3, 6, 7].forEach(function (i) {
        var input = root.querySelector('input[name="q' + i + suffix + '"]:checked');
        var v = input ? input.value : null;
        var ok = v === correctAnswers['q' + i];
        if (ok) score++;
        var answerHint = i <= 3 ? correctAnswers['q' + i] : tfLabel(correctAnswers['q' + i]);
        results.push({ i: i, ok: ok, msg: ok ? 'Correct.' : 'Incorrect. The correct answer is ' + answerHint + '.' });
      });

      var q4vals = Array.from(root.querySelectorAll('input[name="q4' + suffix + '"]:checked')).map(function (c) {
        return c.value;
      });
      var q4ok = multiKey(q4vals) === multiKey(correctAnswers.q4 || []);
      if (q4ok) score++;
      results.push({ i: 4, ok: q4ok, msg: q4ok ? 'Correct.' : 'Incorrect. Review the correct answers.' });

      var q5vals = Array.from(root.querySelectorAll('input[name="q5' + suffix + '"]:checked')).map(function (c) {
        return c.value;
      });
      var q5ok = multiKey(q5vals) === multiKey(correctAnswers.q5 || []);
      if (q5ok) score++;
      results.push({ i: 5, ok: q5ok, msg: q5ok ? 'Correct.' : 'Incorrect. Review the correct answers.' });

      var slots8 = root.querySelectorAll('.q-card[data-q="8"] .match-slot');
      var q8ok = slots8.length === matchCount;
      slots8.forEach(function (slot) {
        var chip = slot.querySelector('.slot-drop .match-chip');
        if (!chip || chip.dataset.value !== slot.dataset.correct) q8ok = false;
      });
      if (q8ok) score++;
      results.push({ i: 8, ok: q8ok, msg: q8ok ? 'Correct.' : 'Incorrect. ' + matchFeedback });

      results.forEach(function (r) {
        showFeedback(r.i, r.ok, r.msg);
      });

      var passed = score === total;
      var isFinalModule = moduleNum === '6';

      if (passed && isFinalModule && window.provisionalInductionCertificate) {
        if (typeof window.provisionalInductionMarkQuizPass === 'function') {
          window.provisionalInductionMarkQuizPass();
        }
        window.provisionalInductionCertificate.markTrainingCompleteIfReady();
        window.provisionalInductionCertificate.showModule6FinalResult(scoreCard, true);
        if (scoreCard) {
          scoreCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        if (scoreValue) scoreValue.textContent = passed ? 'Quiz passed - ' + score + '/' + total : score + '/' + total;
        if (scoreMsg) {
          scoreMsg.textContent = passed
            ? 'You passed this module quiz. Continue to the next module when you are ready.'
            : 'You need all 8 answers correct before moving on. Review the video and try again.';
        }
        if (scoreCard) {
          scoreCard.classList.add('show');
          scoreCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        var nextBtn = root.querySelector('.quiz-next-btn');
        if (nextBtn) nextBtn.style.display = passed ? 'inline-flex' : 'none';
      }

      if (passed && !isFinalModule && typeof window.provisionalInductionMarkQuizPass === 'function') {
        window.provisionalInductionMarkQuizPass();
      }
      if (
        passed &&
        !isFinalModule &&
        window.provisionalInductionCertificate &&
        typeof window.provisionalInductionCertificate.markTrainingCompleteIfReady === 'function'
      ) {
        window.provisionalInductionCertificate.markTrainingCompleteIfReady();
      }
      if (submitBtn) submitBtn.disabled = passed || countAnswered() < total;
    };
  }

  updateProgress();
})();
