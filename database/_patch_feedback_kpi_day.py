# -*- coding: utf-8 -*-
"""Add day-scoped feedback KPI visual panel (gauge + emotions + independence bars)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "working_ui" / "admin_dashboard.html",
    ROOT / "working_ui" / "portal" / "admin_embed.html",
]

CSS_INSERT = """
    /* Session feedback · day KPI (Engagement gauge, emotions, independence bars) */
    .c4k-sf-kpi-slab-host{min-width:0}
    .c4k-sf-kpi-slab--feedback-day .c4k-sf-kpi-row--tri{
      grid-template-columns:minmax(0,1fr) minmax(0,1.35fr) minmax(0,1fr);
    }
    .c4k-reg-eng-gauge{position:relative;max-width:220px;margin:0 auto;padding:4px 0 0;min-width:0}
    .c4k-reg-eng-gauge__svg{display:block;width:100%;max-width:220px;height:auto;margin:0 auto}
    .c4k-reg-eng-gauge__seg{fill:none;stroke-width:14;stroke-linecap:round}
    .c4k-reg-eng-gauge__seg--r{stroke:#f87171}
    .c4k-reg-eng-gauge__seg--o{stroke:#fb923c}
    .c4k-reg-eng-gauge__seg--y{stroke:#facc15}
    .c4k-reg-eng-gauge__seg--g{stroke:#22c55e}
    .c4k-reg-eng-gauge__val{fill:rgba(34,197,94,.55);stroke:none}
    .c4k-reg-eng-gauge__needle{stroke:#0f172a;stroke-width:2.5;stroke-linecap:round}
    .c4k-reg-eng-gauge__hub{fill:#0f172a}
    .c4k-reg-eng-gauge__center{text-align:center;margin-top:-8px;min-width:0}
    .c4k-reg-eng-gauge__pct{display:block;font-size:2rem;font-weight:800;color:#15803d;line-height:1.05;font-variant-numeric:tabular-nums}
    .c4k-reg-eng-gauge__avg{display:block;margin-top:4px;font-size:13px;font-weight:700;color:var(--muted)}
    .c4k-reg-emo-circ--sf-day{
      display:flex;flex-direction:row;flex-wrap:nowrap;justify-content:center;align-items:flex-start;
      gap:8px 18px;width:100%;margin-top:2px;padding:2px 4px 4px;overflow-x:auto;-webkit-overflow-scrolling:touch;min-width:0;
    }
    .c4k-reg-emo-circ--sf-day .c4k-reg-emo-circ__item{
      flex:0 0 auto;min-width:0;display:flex;flex-direction:column;align-items:center;padding:0 4px;
    }
    .c4k-reg-emo-circ--sf-day .c4k-reg-emo-circ__ico{
      line-height:0;margin-bottom:6px;display:flex;align-items:center;justify-content:center;
    }
    .c4k-reg-emo-circ--sf-day .c4k-reg-emo-circ__ico svg{width:26px;height:26px}
    .c4k-reg-emo-circ--sf-day .c4k-reg-emo-donut-wrap{width:92px;height:92px;margin:0 0 6px}
    .c4k-reg-emo-circ--sf-day .c4k-reg-emo-donut__inner{width:60px;height:60px;font-size:15px}
    .c4k-reg-emo-circ--sf-day .c4k-reg-emo-circ__lbl{font-size:9px;max-width:5.25rem;margin-top:4px}
    .c4k-reg-ind-bars{
      display:flex;align-items:flex-end;justify-content:center;gap:12px 16px;
      min-height:148px;padding:4px 6px 0;min-width:0;width:100%;
    }
    .c4k-reg-ind-bar__item{
      flex:1 1 0;max-width:76px;min-width:0;display:flex;flex-direction:column;align-items:center;
      gap:6px;height:148px;justify-content:flex-end;
    }
    .c4k-reg-ind-bar__pct{font-size:11px;font-weight:800;color:#6d28d9;line-height:1.2;font-variant-numeric:tabular-nums;min-width:0;text-align:center}
    .c4k-reg-ind-bar__track{
      flex:1 1 auto;width:100%;max-width:52px;min-height:72px;border-radius:10px 10px 4px 4px;
      background:#f5f3ff;border:1px solid #ddd6fe;display:flex;align-items:flex-end;overflow:hidden;box-sizing:border-box;
    }
    .c4k-reg-ind-bar__fill{width:100%;min-height:3px;border-radius:8px 8px 2px 2px;box-sizing:border-box}
    .c4k-reg-ind-bar__lbl{
      font-size:9px;font-weight:700;color:var(--ink);text-align:center;line-height:1.25;
      max-width:100%;overflow-wrap:break-word;min-width:0;
    }
"""

JS_INSERT = r"""
    function adminC4kPctLabelUk(n){
      n = Number(n);
      if(!(n >= 0) || isNaN(n)) return '0%';
      if(n > 0 && n < 0.05) return '<1%';
      var rounded = Math.round(n * 10) / 10;
      var s = rounded % 1 === 0 || rounded >= 10 ? String(Math.round(rounded)) : String(rounded);
      return s.replace('.', ',') + '%';
    }
    function adminC4kSfKpiDaySubtitle(st){
      st = st || sessionFeedbackEnsureState();
      var rf = String(st.rangeFrom || '').trim();
      var rt = String(st.rangeTo || '').trim();
      if(rf && rt){
        return adminFormatUkDateFromIso(rf + 'T12:00:00') + ' \u2013 ' + adminFormatUkDateFromIso(rt + 'T12:00:00');
      }
      var sel = String(st.selectedIso || '').trim();
      if(sel){
        var d = bookingParseIsoLocal(sel);
        if(d) return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
        return sel;
      }
      return 'This week';
    }
    function adminC4kSfKpiScopeRows(all, st){
      all = all || [];
      st = st || sessionFeedbackEnsureState();
      var rf = String(st.rangeFrom || '').trim();
      var rt = String(st.rangeTo || '').trim();
      if(rf && rt){
        return all.filter(function(d){
          var iso = adminC4kRegisterRowIso10(d) || '';
          return iso >= rf && iso <= rt;
        });
      }
      var sel = String(st.selectedIso || '').trim();
      if(sel){
        return all.filter(function(d){ return adminC4kRegisterRowIso10(d) === sel; });
      }
      var days = bookingWeekIsoRangeMonSun(st.anchorIso || isoDateLocal(new Date()));
      if(!days.length) return all;
      var set = {};
      for(var di = 0; di < days.length; di++) set[days[di]] = 1;
      return all.filter(function(d){
        var iso = adminC4kRegisterRowIso10(d) || '';
        return !!set[iso];
      });
    }
    function adminC4kIndependenceBucket(raw){
      var p = String(raw || '').trim().toLowerCase();
      if(!p || p === '\u2014' || p === '—') return null;
      if(/full\s*support|fully\s*supported/.test(p)) return 'full';
      if(/regular\s*support/.test(p)) return 'regular';
      if(/prompt|minimal/.test(p)) return 'prompts';
      if(/^independent$|independent\s+during|mostly\s+independent/.test(p)) return 'independent';
      if(/independent/.test(p)) return 'prompts';
      return 'other';
    }
    function adminC4kRegistersKpiEngagementGaugeHtml(list){
      var pairs = adminC4kRegistersKpiEngagementPairsFromList(list);
      if(!pairs.length){
        return '<p class="muted c4k-reg-kpi-cap" style="margin:0;text-align:center">No numeric engagement scores (1\u20135) for this scope.</p>';
      }
      var vals = pairs.map(function(p){ return p.v; });
      var avg = vals.reduce(function(a, b){ return a + b; }, 0) / vals.length;
      var pctInt = Math.min(100, Math.max(0, Math.round((avg / 5) * 100)));
      var ang = Math.PI - (pctInt / 100) * Math.PI;
      var cx = 110, cy = 108, r = 88;
      var nx = cx + r * Math.cos(ang);
      var ny = cy - r * Math.sin(ang);
      var large = pctInt > 50 ? 1 : 0;
      var valPath =
        'M ' + cx + ' ' + cy + ' L 22 ' + cy + ' A ' + r + ' ' + r + ' 0 ' + large + ' 0 ' + nx.toFixed(1) + ' ' + ny.toFixed(1) + ' Z';
      return (
        '<div class="c4k-reg-eng-gauge c4k-sf-kpi-col__body" style="min-width:0">' +
        '<svg class="c4k-reg-eng-gauge__svg" viewBox="0 0 220 120" role="img" aria-label="Engagement ' + esc(String(pctInt)) + ' percent, average ' + avg.toFixed(1) + ' out of 5">' +
        '<path class="c4k-reg-eng-gauge__seg c4k-reg-eng-gauge__seg--r" d="M 22 108 A 88 88 0 0 1 64.6 34.2" />' +
        '<path class="c4k-reg-eng-gauge__seg c4k-reg-eng-gauge__seg--o" d="M 64.6 34.2 A 88 88 0 0 1 110 20" />' +
        '<path class="c4k-reg-eng-gauge__seg c4k-reg-eng-gauge__seg--y" d="M 110 20 A 88 88 0 0 1 155.4 34.2" />' +
        '<path class="c4k-reg-eng-gauge__seg c4k-reg-eng-gauge__seg--g" d="M 155.4 34.2 A 88 88 0 0 1 198 108" />' +
        '<path class="c4k-reg-eng-gauge__val" d="' + valPath + '" />' +
        '<line class="c4k-reg-eng-gauge__needle" x1="' + cx + '" y1="' + cy + '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) + '" />' +
        '<circle class="c4k-reg-eng-gauge__hub" cx="' + cx + '" cy="' + cy + '" r="5" />' +
        '</svg>' +
        '<div class="c4k-reg-eng-gauge__center">' +
        '<span class="c4k-reg-eng-gauge__pct">' + esc(String(pctInt)) + '%</span>' +
        '<span class="c4k-reg-eng-gauge__avg">' + esc(avg.toFixed(1)) + ' / 5 avg</span>' +
        '</div>' +
        '<p class="muted c4k-reg-kpi-cap" style="margin:0;text-align:center;padding-top:4px">' +
        esc(String(vals.length)) + ' session' + (vals.length === 1 ? '' : 's') + ' with scores</p>' +
        '</div>'
      );
    }
    function adminC4kRegistersKpiMockEngagementGaugeHtml(){
      var demo = [];
      for(var i = 0; i < 16; i++) demo.push({ engNum: 4 + (i % 3 === 0 ? 0.2 : 0) });
      return adminC4kRegistersKpiEngagementGaugeHtml(demo);
    }
    function adminC4kRegistersKpiEmotionDayTagCounts(list){
      var counts = { happy: 0, anxious: 0, withdrawn: 0, outcontrol: 0 };
      for(var i = 0; i < list.length; i++){
        var parts = adminC4kEmotionTokensFromRaw(list[i].emoLabel);
        for(var j = 0; j < parts.length; j++){
          var cat = adminC4kEmotionLabelPalette(parts[j]);
          if(cat === 'default') continue;
          if(counts[cat] != null) counts[cat]++;
        }
      }
      return {
        counts: counts,
        grandTotal: counts.happy + counts.anxious + counts.withdrawn + counts.outcontrol
      };
    }
    function adminC4kRegistersKpiEmotionsDayVisualHtml(list){
      var pack = adminC4kRegistersKpiEmotionDayTagCounts(list);
      var canon = [
        { cat: 'happy', label: 'Happy / excited' },
        { cat: 'anxious', label: 'Anxious' },
        { cat: 'withdrawn', label: 'Withdrawn' },
        { cat: 'outcontrol', label: 'Out of control' }
      ];
      if(!pack.grandTotal){
        return '<p class="muted c4k-reg-kpi-cap" style="margin:0;text-align:center">No emotion / regulation tags for this scope.</p>';
      }
      var rows = canon
        .map(function(c){
          var n = pack.counts[c.cat] || 0;
          var pct = (n / pack.grandTotal) * 100;
          var pal = adminC4kEmotionPaletteCss(c.cat);
          var deg = Math.min(359.98, Math.round(pct * 36) / 10);
          var pctLabel = adminC4kPctLabelUk(pct);
          var bg =
            deg <= 0.05
              ? pal.track
              : 'conic-gradient(from -90deg, ' + pal.lo + ' 0deg, ' + pal.hi + ' ' + String(deg) + 'deg, ' + pal.track + ' ' + String(deg) + 'deg 360deg)';
          return (
            '<div class="c4k-reg-emo-circ__item">' +
            '<div class="c4k-reg-emo-circ__ico" aria-hidden="true">' + adminC4kEmotionFaceSvgForCat(c.cat) + '</div>' +
            '<div class="c4k-reg-emo-donut-wrap" title="' + esc(c.label + ': ' + String(n) + ' tags') + '">' +
            '<div class="c4k-reg-emo-donut" style="background:' + bg + '"></div>' +
            '<div class="c4k-reg-emo-donut__inner">' + esc(pctLabel) + '</div></div>' +
            '<div class="c4k-reg-emo-circ__lbl">' + esc(c.label) + '</div>' +
            '<div class="c4k-reg-emo-circ__sub">' + esc(String(n)) + ' tag' + (n === 1 ? '' : 's') + '</div></div>'
          );
        })
        .join('');
      return '<div class="c4k-reg-emo-circ c4k-reg-emo-circ--sf-day" role="list">' + rows + '</div>';
    }
    function adminC4kRegistersKpiMockEmotionsDayVisualHtml(){
      var demo = [];
      for(var i = 0; i < 14; i++) demo.push({ emoLabel: 'Happy/Excited' });
      for(var j = 0; j < 3; j++) demo.push({ emoLabel: 'Anxious' });
      demo.push({ emoLabel: 'Withdrawn' });
      return adminC4kRegistersKpiEmotionsDayVisualHtml(demo);
    }
    function adminC4kRegistersKpiIndependenceBarsHtml(list){
      var buckets = { independent: 0, prompts: 0, regular: 0, full: 0, other: 0 };
      var total = 0;
      for(var i = 0; i < list.length; i++){
        var b = adminC4kIndependenceBucket(list[i].indep);
        if(!b) continue;
        total++;
        if(buckets[b] != null) buckets[b]++;
        else buckets.other++;
      }
      if(!total){
        return '<p class="muted c4k-reg-kpi-cap" style="margin:0;text-align:center">No independence labels for this scope.</p>';
      }
      var order = [
        { key: 'independent', label: 'Independent', color: '#ddd6fe' },
        { key: 'prompts', label: 'With prompts', color: '#c4b5fd' },
        { key: 'regular', label: 'Regular support', color: '#a78bfa' },
        { key: 'full', label: 'Full support', color: '#7c3aed' }
      ];
      var bars = order
        .map(function(o){
          var n = buckets[o.key] || 0;
          var pct = (n / total) * 100;
          var h = Math.max(4, Math.round(pct));
          return (
            '<div class="c4k-reg-ind-bar__item">' +
            '<span class="c4k-reg-ind-bar__pct">' + esc(adminC4kPctLabelUk(pct)) + '</span>' +
            '<div class="c4k-reg-ind-bar__track" title="' + esc(o.label + ': ' + String(n)) + '">' +
            '<div class="c4k-reg-ind-bar__fill" style="height:' + String(h) + '%;background:' + o.color + '"></div></div>' +
            '<span class="c4k-reg-ind-bar__lbl">' + esc(o.label) + '</span></div>'
          );
        })
        .join('');
      return '<div class="c4k-reg-ind-bars" role="img" aria-label="Independence distribution">' + bars + '</div>';
    }
"""

OLD_SLAB = """    /** Session Feedback page: three term KPI panels (used inside the week completion card next to the donut). */
    function adminC4kSessionFeedbackKpiSlabHtml(all){
      all = all && all.length ? all : adminC4kDailyRegistersList();
      var usingPortal = adminSessionFeedbackPortalRows().length > 0;
      var kpiEngHead =
        '<div class="c4k-reg-kpi-card-head">' +
        '<h3 class="c4k-reg-kpi-card-title">Engagement</h3>' +
        '<p class="c4k-reg-kpi-card-sub">(' + esc(ADMIN_PORTAL_SESSION_FEEDBACK_TERM_TITLE) + ')</p>' +
        '</div>';
      var kpiEngBody = usingPortal ? adminC4kRegistersKpiEngagementVisualHtml(all) : adminC4kRegistersKpiMockEngagementVisualHtml();
      var kpiEmoHead =
        '<div class="c4k-reg-kpi-card-head">' +
        '<h3 class="c4k-reg-kpi-card-title">Regulation / emotions</h3>' +
        '<p class="c4k-reg-kpi-card-sub">(' + esc(ADMIN_PORTAL_SESSION_FEEDBACK_TERM_TITLE) + ')</p>' +
        '</div>';
      var kpiEmoBody = usingPortal ? adminC4kRegistersKpiEmotionsVisualHtml(all) : adminC4kRegistersKpiMockEmotionsVisualHtml();
      var kpiRelHead =
        '<div class="c4k-reg-kpi-card-head">' +
        '<h3 class="c4k-reg-kpi-card-title">Relevant Info</h3>' +
        '<p class="c4k-reg-kpi-card-sub">(' + esc(ADMIN_PORTAL_SESSION_FEEDBACK_TERM_TITLE) + ')</p>' +
        '</div>';
      var kpiRelBody = usingPortal ? adminC4kRegistersKpiRelevantReviewVisualHtml(all) : adminC4kRegistersKpiMockRelevantReviewVisualHtml();
      return (
        '<div class="c4k-sf-kpi-slab c4k-sf-kpi-slab--embed">' +
        '<div class="c4k-sf-kpi-row c4k-sf-kpi-row--tri">' +
        '<div class="c4k-sf-kpi-panel c4k-sf-kpi-panel--eng-sm">' +
        kpiEngHead +
        kpiEngBody +
        '</div>' +
        '<div class="c4k-sf-kpi-panel">' +
        kpiEmoHead +
        kpiEmoBody +
        '</div>' +
        '<div class="c4k-sf-kpi-panel">' +
        kpiRelHead +
        kpiRelBody +
        '</div>' +
        '</div></div>'
      );
    }"""

NEW_SLAB = """    /** Session Feedback · day/week KPI strip (Engagement gauge, emotions, independence bars). */
    function adminC4kSessionFeedbackKpiSlabHtml(all, st){
      all = all && all.length ? all : adminC4kDailyRegistersList();
      st = st || sessionFeedbackEnsureState();
      var scoped = adminC4kSfKpiScopeRows(all, st);
      var sub = adminC4kSfKpiDaySubtitle(st);
      var usingPortal = adminSessionFeedbackPortalRows().length > 0;
      var kpiEngHead =
        '<div class="c4k-reg-kpi-card-head">' +
        '<h3 class="c4k-reg-kpi-card-title">Engagement</h3>' +
        '<p class="c4k-reg-kpi-card-sub">(' + esc(sub) + ')</p></div>';
      var kpiEngBody = usingPortal ? adminC4kRegistersKpiEngagementGaugeHtml(scoped) : adminC4kRegistersKpiMockEngagementGaugeHtml();
      var kpiEmoHead =
        '<div class="c4k-reg-kpi-card-head">' +
        '<h3 class="c4k-reg-kpi-card-title">Regulation / emotions</h3>' +
        '<p class="c4k-reg-kpi-card-sub">(' + esc(sub) + ')</p></div>';
      var kpiEmoBody = usingPortal ? adminC4kRegistersKpiEmotionsDayVisualHtml(scoped) : adminC4kRegistersKpiMockEmotionsDayVisualHtml();
      var kpiIndHead =
        '<div class="c4k-reg-kpi-card-head">' +
        '<h3 class="c4k-reg-kpi-card-title">Independence</h3>' +
        '<p class="c4k-reg-kpi-card-sub">(' + esc(sub) + ')</p></div>';
      var kpiIndBody = adminC4kRegistersKpiIndependenceBarsHtml(scoped);
      return (
        '<div class="c4k-sf-kpi-slab c4k-sf-kpi-slab--feedback-day">' +
        '<div class="c4k-sf-kpi-row c4k-sf-kpi-row--tri">' +
        '<div class="c4k-sf-kpi-panel c4k-sf-kpi-panel--eng-sm">' + kpiEngHead + kpiEngBody + '</div>' +
        '<div class="c4k-sf-kpi-panel">' + kpiEmoHead + kpiEmoBody + '</div>' +
        '<div class="c4k-sf-kpi-panel">' + kpiIndHead + kpiIndBody + '</div>' +
        '</div></div>'
      );
    }"""

PANEL_OLD = """        '<div id="c4kSfWeekShell" role="region" aria-label="Session feedback completion this week">' +
        '<div id="c4kSfWeekInner"></div></div>' +
        '<div class="card card-pad" style="margin-bottom:12px;min-width:0">' +"""

PANEL_NEW = """        '<div id="c4kSfWeekShell" role="region" aria-label="Session feedback completion this week">' +
        '<div id="c4kSfWeekInner"></div></div>' +
        '<div id="c4kSfKpiSlab" class="c4k-sf-kpi-slab-host" style="margin-bottom:14px;min-width:0" aria-live="polite"></div>' +
        '<div class="card card-pad" style="margin-bottom:12px;min-width:0">' +"""

REFRESH_OLD = """      capHost.innerHTML = bookingWeekCapacityHtml(stripAnchor, {
        embedWeekTile: true,
        sessionFeedbackInlineKpi: adminC4kSessionFeedbackKpiSlabHtml(all),
        sessionFeedbackStrip: {
          rangeFrom: String(st.rangeFrom || '').trim(),
          rangeTo: String(st.rangeTo || '').trim(),
          selectedIso: String(st.selectedIso || '').trim(),
          anchorIso: String(st.anchorIso || '').trim()
        }
      });
      var fh = $('c4kSfFilterHint');"""

REFRESH_NEW = """      capHost.innerHTML = bookingWeekCapacityHtml(stripAnchor, {
        embedWeekTile: true,
        sessionFeedbackStrip: {
          rangeFrom: String(st.rangeFrom || '').trim(),
          rangeTo: String(st.rangeTo || '').trim(),
          selectedIso: String(st.selectedIso || '').trim(),
          anchorIso: String(st.anchorIso || '').trim()
        }
      });
      var kpiHost = $('c4kSfKpiSlab');
      if(kpiHost) kpiHost.innerHTML = adminC4kSessionFeedbackKpiSlabHtml(all, st);
      var fh = $('c4kSfFilterHint');"""

MARKER_CSS = "    .c4k-reg-split{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;min-width:0}"
MARKER_JS = "    /** Session Feedback page: three term KPI panels (used inside the week completion card next to the donut). */"


def patch_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if "adminC4kRegistersKpiEngagementGaugeHtml" in text:
        print("Already patched:", path)
        return False
    if MARKER_JS not in text:
        raise SystemExit(f"JS marker not found in {path}")
    text = text.replace(MARKER_JS, JS_INSERT + "\n" + MARKER_JS, 1)
    if OLD_SLAB not in text:
        raise SystemExit(f"KPI slab block not found in {path}")
    text = text.replace(OLD_SLAB, NEW_SLAB, 1)
    if PANEL_OLD not in text:
        raise SystemExit(f"Panel HTML block not found in {path}")
    text = text.replace(PANEL_OLD, PANEL_NEW, 1)
    if REFRESH_OLD not in text:
        raise SystemExit(f"refreshSessionFeedbackGrid block not found in {path}")
    text = text.replace(REFRESH_OLD, REFRESH_NEW, 1)
    if "c4k-reg-eng-gauge__pct" not in text:
        text = text.replace(MARKER_CSS, CSS_INSERT + MARKER_CSS, 1)
    path.write_text(text, encoding="utf-8")
    print("Patched", path)
    return True


def main():
    n = 0
    for p in TARGETS:
        if p.is_file() and patch_file(p):
            n += 1
    if not n:
        print("No files changed.")


if __name__ == "__main__":
    main()
