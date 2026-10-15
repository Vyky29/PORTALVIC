/*
 * Client registration PDF (jsPDF). Letterhead like the portal emails:
 * navy band with logo, gold line, participant card, requested place,
 * then two-column sections (label | answer) with a footer on every page.
 *
 * Browser: window.PortalRegistrationPdf.build(jsPDFClass, data)
 * Node (preview): require('./parent_registration_pdf.js').build(jsPDF, data)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PortalRegistrationPdf = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NAVY = [16, 37, 54];
  var GOLD = [249, 191, 46];
  var INK = [16, 37, 54];
  var MUTED = [96, 112, 128];
  var RULE = [221, 229, 236];
  var CARD = [241, 246, 249];
  var BAR = [226, 236, 243];

  var M = 14;
  var LABEL_W = 56;
  var LINE_H = 4.4;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* Standard PDF fonts only cover Latin-1: map smart punctuation, drop the rest. */
  function clean(value) {
    return String(value == null ? '' : value)
      .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
      .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
      .replace(/[\u2013\u2014\u2212]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/[\u00B7\u2022]/g, '|')
      .replace(/\u00A0/g, ' ')
      .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function isoParts(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }

  function longDate(iso) {
    var p = isoParts(iso);
    return p ? p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y : '';
  }

  function weekday(iso) {
    var p = isoParts(iso);
    return p ? DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] : '';
  }

  function ageOn(iso, now) {
    var p = isoParts(iso);
    if (!p) return null;
    var age = now.getFullYear() - p.y;
    if (now.getMonth() + 1 < p.m || (now.getMonth() + 1 === p.m && now.getDate() < p.d)) age -= 1;
    return age >= 0 && age < 120 ? age : null;
  }

  function stamp(now) {
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    return now.getDate() + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear() + ', ' + hh + ':' + mm;
  }

  function fitImage(doc, dataUrl, x, y, w, h) {
    if (!dataUrl) return false;
    try {
      var props = doc.getImageProperties(dataUrl);
      var iw = Number(props.width) || 1;
      var ih = Number(props.height) || 1;
      var scale = Math.min(w / iw, h / ih);
      var dw = iw * scale;
      var dh = ih * scale;
      var fmt = String(dataUrl).indexOf('image/png') >= 0 ? 'PNG' : 'JPEG';
      doc.addImage(dataUrl, fmt, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      return true;
    } catch (e) {
      return false;
    }
  }

  function build(JsPDF, data) {
    data = data || {};
    var doc = new JsPDF({ unit: 'mm', format: 'a4' });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var contentW = pageW - M * 2;
    var bottom = pageH - 18;
    var now = data.submittedAt instanceof Date ? data.submittedAt : new Date();
    var title = clean(data.title || 'Client registration');
    var participant = data.participant || {};
    var name = clean(participant.name) || 'Participant';
    var y = 0;

    function text(str, x, yy, opts) {
      doc.text(clean(str), x, yy, opts || {});
    }

    function font(style, size, rgb) {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    }

    function wrap(str, width) {
      return doc.splitTextToSize(clean(str), Math.max(10, width));
    }

    function header() {
      doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.rect(0, 0, pageW, 32, 'F');
      doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
      doc.rect(0, 32, pageW, 1.4, 'F');
      var textX = M;
      if (data.logoDataUrl && fitImage(doc, data.logoDataUrl, M, 5, 22, 22)) textX = M + 27;
      font('bold', 17, [255, 255, 255]);
      text('clubSENsational', textX, 15.5);
      font('bold', 8, GOLD);
      text(title.toUpperCase(), textX, 21.5, { charSpace: 0.6 });
      font('normal', 8, [214, 226, 235]);
      text('Submitted', pageW - M, 14.5, { align: 'right' });
      font('bold', 9, [255, 255, 255]);
      text(stamp(now), pageW - M, 19.5, { align: 'right' });
      return 42;
    }

    function slimHeader() {
      doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.rect(0, 0, pageW, 11, 'F');
      doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
      doc.rect(0, 11, pageW, 0.8, 'F');
      font('bold', 8.5, [255, 255, 255]);
      text('clubSENsational  |  ' + title + '  |  ' + name, M, 7.2);
      return 19;
    }

    function ensure(need) {
      if (y + need <= bottom) return;
      doc.addPage();
      y = slimHeader();
    }

    function sectionBar(label) {
      ensure(16);
      doc.setFillColor(BAR[0], BAR[1], BAR[2]);
      doc.rect(M, y, contentW, 7, 'F');
      doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.rect(M, y, 1.2, 7, 'F');
      font('bold', 9, INK);
      text(String(label || '').toUpperCase(), M + 4, y + 4.8, { charSpace: 0.4 });
      y += 9.5;
    }

    function rows(list) {
      var shown = (list || []).filter(function (row) {
        return row && clean(row[1]) !== '';
      });
      shown.forEach(function (row, i) {
        font('bold', 8.3, MUTED);
        var labelLines = wrap(row[0], LABEL_W - 4);
        font('normal', 9, INK);
        var valueLines = wrap(row[1], contentW - LABEL_W - 2);
        var h = Math.max(labelLines.length, valueLines.length) * LINE_H + 3;
        /* A very long answer runs on across pages instead of jumping whole. */
        ensure(h > bottom - 40 ? LINE_H * 3 : h);
        var first = y + 4;
        font('bold', 8.3, MUTED);
        labelLines.forEach(function (ln, k) {
          doc.text(ln, M + 2, first + k * LINE_H);
        });
        var labelLast = first + (labelLines.length - 1) * LINE_H;
        var samePage = doc.internal.getNumberOfPages();
        font('normal', 9, INK);
        var yy = first;
        var last = first;
        valueLines.forEach(function (ln) {
          if (yy > bottom) {
            doc.addPage();
            yy = slimHeader() + 4;
            font('normal', 9, INK);
          }
          doc.text(ln, M + LABEL_W, yy);
          last = yy;
          yy += LINE_H;
        });
        y = (doc.internal.getNumberOfPages() === samePage ? Math.max(labelLast, last) : last) + 2.2;
        if (i < shown.length - 1) {
          doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
          doc.setLineWidth(0.2);
          doc.line(M + 2, y, pageW - M, y);
        }
        y += 0.8;
      });
      y += 4;
    }

    function participantCard() {
      var photoSize = 34;
      var hasPhoto = !!data.photoDataUrl;
      var cardH = hasPhoto ? photoSize + 8 : 30;
      doc.setFillColor(CARD[0], CARD[1], CARD[2]);
      doc.roundedRect(M, y, contentW, cardH, 2.5, 2.5, 'F');
      var textW = contentW - 10 - (hasPhoto ? photoSize + 6 : 0);
      var ty = y + 9;
      font('bold', 7.5, MUTED);
      text('PARTICIPANT', M + 5, ty, { charSpace: 0.5 });
      ty += 7;
      font('bold', 16, INK);
      wrap(name, textW).slice(0, 2).forEach(function (ln) {
        doc.text(ln, M + 5, ty);
        ty += 6.5;
      });
      var age = ageOn(participant.dobIso, now);
      var facts = [
        participant.dobIso ? 'Born ' + longDate(participant.dobIso) + (age != null ? ' (age ' + age + ')' : '') : '',
        participant.gender,
        participant.school,
      ].map(clean).filter(Boolean);
      font('normal', 9, INK);
      facts.forEach(function (f) {
        wrap(f, textW).slice(0, 2).forEach(function (ln) {
          if (ty < y + cardH - 2) doc.text(ln, M + 5, ty);
          ty += LINE_H + 0.4;
        });
      });
      if (hasPhoto) {
        var px = pageW - M - photoSize - 4;
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(px, y + 4, photoSize, photoSize, 2, 2, 'F');
        fitImage(doc, data.photoDataUrl, px + 1, y + 5, photoSize - 2, photoSize - 2);
      } else if (data.photoNote) {
        font('italic', 8, MUTED);
        text(data.photoNote, pageW - M - 5, y + 9, { align: 'right' });
      }
      y += cardH + 7;
    }

    function placeBox(b) {
      var cols = [
        ['Service', [b.service, b.trial ? '(trial)' : ''].filter(Boolean).join(' ')],
        ['Date', b.dateIso ? weekday(b.dateIso) + ', ' + longDate(b.dateIso) : b.day],
        ['Time', b.time],
        ['Venue', b.venue],
      ].filter(function (c) { return clean(c[1]) !== ''; });
      if (!cols.length) return;
      ensure(26);
      var colW = contentW / cols.length;
      var lines = cols.map(function (c) {
        font('bold', 9.5, INK);
        return wrap(c[1], colW - 7).slice(0, 3);
      });
      var maxLines = Math.max.apply(null, lines.map(function (l) { return l.length; }));
      var boxH = 15 + maxLines * 4.6;
      doc.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
      doc.setLineWidth(0.5);
      doc.setFillColor(255, 251, 237);
      doc.roundedRect(M, y, contentW, boxH, 2.5, 2.5, 'FD');
      font('bold', 7.5, MUTED);
      text('REQUESTED PLACE', M + 5, y + 6.5, { charSpace: 0.5 });
      cols.forEach(function (c, i) {
        var x = M + 5 + i * colW;
        font('normal', 7.5, MUTED);
        text(c[0], x, y + 11.5);
        font('bold', 9.5, INK);
        lines[i].forEach(function (ln, k) {
          doc.text(ln, x, y + 16 + k * 4.6);
        });
      });
      y += boxH + 7;
    }

    y = header();
    participantCard();
    if (data.booking) placeBox(data.booking);
    (data.sections || []).forEach(function (s) {
      var hasAny = (s.rows || []).some(function (r) { return r && clean(r[1]) !== ''; });
      if (!hasAny) return;
      sectionBar(s.title);
      rows(s.rows);
    });

    var total = doc.internal.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.setLineWidth(0.3);
      doc.line(M, pageH - 12, pageW - M, pageH - 12);
      font('normal', 7.5, MUTED);
      text('clubSENsational  |  ' + title + '  |  ' + name + '  |  Confidential', M, pageH - 7.5);
      text('Page ' + p + ' of ' + total, pageW - M, pageH - 7.5, { align: 'right' });
    }
    return doc;
  }

  return { build: build, clean: clean };
});
