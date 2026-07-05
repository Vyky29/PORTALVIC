/**
 * Searchable admin filter combobox — native <select> with many options renders as a blank
 * listbox inside admin_dashboard (overflow/layout). Same pattern as achievements inbox picker.
 */
(function (global) {
  "use strict";

  var registry = Object.create(null);

  function normText(v) {
    return String(v || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function normalizeOption(raw) {
    if (raw == null) return null;
    if (typeof raw === "string" || typeof raw === "number") {
      var s = String(raw).trim();
      return s ? { value: s, label: s } : null;
    }
    var value = String(raw.value != null ? raw.value : raw.label != null ? raw.label : "").trim();
    var label = String(raw.label != null ? raw.label : raw.value != null ? raw.value : "").trim();
    if (!value && !label) return null;
    if (!label) label = value;
    if (!value) value = label;
    return { value: value, label: label };
  }

  function normalizeOptions(list) {
    var out = [];
    var seen = Object.create(null);
    (list || []).forEach(function (raw) {
      var o = normalizeOption(raw);
      if (!o) return;
      var key = o.value.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(o);
    });
    out.sort(function (a, b) {
      return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
    });
    return out;
  }

  function findOption(options, value) {
    var v = String(value || "").trim();
    if (!v) return null;
    var vl = v.toLowerCase();
    for (var i = 0; i < options.length; i++) {
      if (options[i].value === v || options[i].label === v) return options[i];
      if (options[i].value.toLowerCase() === vl || options[i].label.toLowerCase() === vl) return options[i];
    }
    return null;
  }

  function mount(cfg) {
    cfg = cfg || {};
    var id = String(cfg.id || "").trim();
    if (!id) return null;

    var hid = document.getElementById(id);
    var inp = document.getElementById(id + "Input");
    var sug = document.getElementById(id + "Suggest");
    if (!hid || !inp || !sug) return null;

    if (registry[id]) {
      if (inp.getAttribute("data-portal-search-combo-bound") === "1") return registry[id];
      try {
        registry[id].destroy();
      } catch (_drop) {
        delete registry[id];
      }
    }
    if (inp.getAttribute("data-portal-search-combo-bound") === "1") return registry[id] || null;
    inp.setAttribute("data-portal-search-combo-bound", "1");

    var state = {
      id: id,
      options: normalizeOptions(cfg.options),
      allLabel: String(cfg.allLabel || cfg.placeholder || "All"),
      maxVisible: cfg.maxVisible > 0 ? cfg.maxVisible : 18,
      showAllOnEmptyFocus: cfg.showAllOnEmptyFocus !== false,
      onChange: typeof cfg.onChange === "function" ? cfg.onChange : null,
    };

    function notify() {
      if (state.onChange) {
        try {
          state.onChange(hid.value, inp.value);
        } catch (_e) {}
      }
      hid.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function closeList() {
      sug.hidden = true;
      while (sug.firstChild) sug.removeChild(sug.firstChild);
      inp.setAttribute("aria-expanded", "false");
    }

    function applyPick(opt) {
      if (!opt) {
        hid.value = "";
        inp.value = "";
      } else {
        hid.value = opt.value;
        inp.value = opt.label;
      }
      closeList();
      notify();
    }

    function renderList(query) {
      var q = normText(query);
      while (sug.firstChild) sug.removeChild(sug.firstChild);
      var matches = [];
      if (!q && state.showAllOnEmptyFocus) {
        matches = state.options.slice(0, state.maxVisible);
      } else if (q) {
        for (var i = 0; i < state.options.length; i++) {
          var o = state.options[i];
          if (normText(o.label).indexOf(q) !== -1 || normText(o.value).indexOf(q) !== -1) {
            matches.push(o);
            if (matches.length >= state.maxVisible) break;
          }
        }
      }

      var clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "portal-search-combo__opt portal-search-combo__opt--all";
      clearBtn.textContent = state.allLabel;
      clearBtn.addEventListener("mousedown", function (ev) {
        ev.preventDefault();
        applyPick(null);
      });
      sug.appendChild(clearBtn);

      matches.forEach(function (opt) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "portal-search-combo__opt";
        btn.setAttribute("role", "option");
        btn.textContent = opt.label;
        btn.addEventListener("mousedown", function (ev) {
          ev.preventDefault();
          applyPick(opt);
        });
        sug.appendChild(btn);
      });

      if (!matches.length && !q) {
        var empty = document.createElement("div");
        empty.className = "portal-search-combo__empty muted";
        empty.textContent = state.options.length ? "Type to search" : "No options loaded";
        sug.appendChild(empty);
      } else if (!matches.length && q) {
        var none = document.createElement("div");
        none.className = "portal-search-combo__empty muted";
        none.textContent = "No matches";
        sug.appendChild(none);
      }

      sug.hidden = false;
      inp.setAttribute("aria-expanded", "true");
    }

    inp.addEventListener("input", function () {
      hid.value = "";
      renderList(inp.value);
    });
    inp.addEventListener("focus", function () {
      renderList(inp.value);
    });
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        closeList();
        return;
      }
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      var first = sug.querySelector(".portal-search-combo__opt:not(.portal-search-combo__opt--all)");
      if (first) {
        first.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        return;
      }
      var typed = findOption(state.options, inp.value);
      if (typed) applyPick(typed);
    });
    inp.addEventListener("blur", function () {
      global.setTimeout(function () {
        if (!sug.contains(document.activeElement)) closeList();
      }, 140);
    });

    var api = {
      id: id,
      setOptions: function (options, opts) {
        opts = opts || {};
        var prev = String(hid.value || "").trim();
        state.options = normalizeOptions(options);
        if (opts.keepValue && prev) {
          var hit = findOption(state.options, prev);
          if (hit) {
            hid.value = hit.value;
            inp.value = hit.label;
          } else {
            hid.value = "";
            inp.value = "";
          }
        }
      },
      setValue: function (value, label) {
        var hit = findOption(state.options, value);
        if (hit) {
          hid.value = hit.value;
          inp.value = hit.label;
        } else if (value) {
          hid.value = String(value);
          inp.value = String(label != null ? label : value);
        } else {
          hid.value = "";
          inp.value = "";
        }
      },
      getValue: function () {
        return String(hid.value || "").trim();
      },
      getLabel: function () {
        return String(inp.value || "").trim();
      },
      destroy: function () {
        closeList();
        delete registry[id];
        inp.removeAttribute("data-portal-search-combo-bound");
      },
    };

    registry[id] = api;
    if (cfg.options) api.setOptions(cfg.options, { keepValue: true });
    if (cfg.value != null && String(cfg.value).trim()) api.setValue(cfg.value, cfg.label);
    return api;
  }

  function ensure(cfg) {
    var id = String((cfg && cfg.id) || "").trim();
    if (!id) return null;
    var existing = registry[id];
    if (existing) {
      // A re-render (innerHTML replacement) can detach the input this instance was
      // bound to; the fresh input in the DOM then has no listeners/options and the
      // combo looks dead ("No options loaded" / never opens). Re-mount in that case.
      var inp = document.getElementById(id + "Input");
      if (inp && inp.isConnected && inp.getAttribute("data-portal-search-combo-bound") === "1") {
        return existing;
      }
      try {
        existing.destroy();
      } catch (_drop) {}
      delete registry[id];
    }
    return mount(cfg);
  }

  function get(id) {
    return registry[String(id || "").trim()] || null;
  }

  function setOptions(id, options, opts) {
    var api = ensure({ id: id });
    if (!api) return false;
    api.setOptions(options, opts);
    return true;
  }

  function setValue(id, value, label) {
    var api = get(id) || ensure({ id: id });
    if (!api) {
      var hid = document.getElementById(id);
      if (hid) hid.value = String(value || "");
      return false;
    }
    api.setValue(value, label);
    return true;
  }

  function comboHtml(id, placeholder, maxWidth) {
    var ph = String(placeholder || "Search…");
    var w = maxWidth ? ' style="max-width:' + maxWidth + '"' : "";
    return (
      '<div class="portal-search-combo sched-combo-wrap sched-filter-combo"' +
      w +
      ' id="' +
      id +
      'Wrap">' +
      '<input type="hidden" id="' +
      id +
      '" value="" />' +
      '<input type="search" id="' +
      id +
      'Input" class="inp portal-search-combo__inp" placeholder="' +
      ph.replace(/"/g, "&quot;") +
      '" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-controls="' +
      id +
      'Suggest" aria-label="' +
      ph.replace(/"/g, "&quot;") +
      '" />' +
      '<div id="' +
      id +
      'Suggest" class="sched-suggest portal-search-combo__list" role="listbox" hidden></div></div>'
    );
  }

  global.PortalAdminSearchCombo = {
    mount: mount,
    ensure: ensure,
    get: get,
    setOptions: setOptions,
    setValue: setValue,
    comboHtml: comboHtml,
    normText: normText,
  };
})(typeof window !== "undefined" ? window : globalThis);
