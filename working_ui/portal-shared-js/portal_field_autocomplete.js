/**
 * Portal form autofill — pick from roster/catalog (participants, staff, venues).
 * Requires participant_services.js (catalog helpers) + roster scripts loaded first.
 */
(function (global) {
  "use strict";

  function clean(v) {
    return String(v || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function norm(v) {
    return clean(v)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function catalogFromOpts(opts) {
    opts = opts || {};
    if (typeof opts.getNames === "function") return opts.getNames() || [];
    if (typeof global.portalCatalogForKind === "function" && opts.kind) {
      return global.portalCatalogForKind(opts.kind) || [];
    }
    return [];
  }

  function filterCatalog(catalog, query, opts) {
    opts = opts || {};
    var q = clean(query);
    if (!q) return [];
    var nq = norm(q);
    var mode = opts.match === "contains" ? "contains" : "startsWith";
    var max = Number(opts.max) > 0 ? Number(opts.max) : 16;
    var out = [];
    for (var i = 0; i < catalog.length; i++) {
      var name = catalog[i];
      var nn = norm(name);
      if (mode === "contains") {
        if (nn.indexOf(nq) === -1) continue;
      } else if (nn.indexOf(nq) !== 0) {
        continue;
      }
      out.push(name);
      if (out.length >= max) break;
    }
    return out;
  }

  function ensureSuggestBox(input, listEl) {
    if (listEl) return listEl;
    if (!input || !input.parentNode) return null;
    var id = input.id ? input.id + "Suggest" : "portalSuggest" + String(Math.random()).slice(2, 8);
    var box = global.document.createElement("div");
    box.id = id;
    box.className = "portal-name-suggest";
    box.setAttribute("role", "listbox");
    box.hidden = true;
    if (input.parentNode.classList && !input.parentNode.classList.contains("participant-field-wrap")) {
      var wrap = global.document.createElement("div");
      wrap.className = "participant-field-wrap";
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      wrap.appendChild(box);
    } else {
      input.parentNode.appendChild(box);
    }
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", id);
    return box;
  }

  function closeList(input, listEl) {
    if (!listEl) return;
    listEl.hidden = true;
    listEl.replaceChildren();
    if (input) input.setAttribute("aria-expanded", "false");
  }

  function openList(input, listEl, matches, opts) {
    opts = opts || {};
    if (!listEl || !input) return;
    listEl.replaceChildren();
    if (!matches.length) {
      closeList(input, listEl);
      return;
    }
    for (var i = 0; i < matches.length; i++) {
      (function (name, idx) {
        var btn = global.document.createElement("button");
        btn.type = "button";
        btn.className = "portal-name-suggest__item";
        btn.setAttribute("role", "option");
        btn.id = listEl.id + "-opt-" + idx;
        btn.textContent = name;
        btn.dataset.name = name;
        btn.addEventListener("mousedown", function (ev) {
          ev.preventDefault();
          input.value = name;
          closeList(input, listEl);
          if (typeof opts.onPick === "function") opts.onPick(name, input);
          try {
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          } catch (_ev) {}
        });
        listEl.appendChild(btn);
      })(matches[i], i);
    }
    listEl.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function resolveStrict(input, opts) {
    var catalog = catalogFromOpts(opts);
    if (!catalog.length || typeof global.portalResolveCatalogName !== "function") return clean(input.value);
    return global.portalResolveCatalogName(input.value, catalog, {
      match: opts.match === "contains" ? "contains" : "startsWith",
      strict: !!opts.strict,
      allowContains: opts.match === "contains",
    });
  }

  /**
   * @param {HTMLInputElement} input
   * @param {HTMLElement|null} listEl
   * @param {{ kind?: string, getNames?: function, strict?: boolean, match?: string, max?: number, onPick?: function, minChars?: number }} opts
   */
  function wireFieldSuggest(input, listEl, opts) {
    opts = opts || {};
    if (!input || input.dataset.portalSuggestWired === "1") return;
    input.dataset.portalSuggestWired = "1";
    listEl = ensureSuggestBox(input, listEl);
    if (!listEl) return;
    var blurTimer = null;
    var minChars = Number(opts.minChars) >= 0 ? Number(opts.minChars) : 1;

    function sync() {
      clearTimeout(blurTimer);
      var q = clean(input.value);
      if (q.length < minChars) {
        closeList(input, listEl);
        return;
      }
      var catalog = catalogFromOpts(opts);
      openList(input, listEl, filterCatalog(catalog, q, opts), opts);
    }

    function onBlurStrict() {
      blurTimer = global.setTimeout(function () {
        closeList(input, listEl);
        if (!opts.strict) return;
        var resolved = resolveStrict(input, opts);
        var typed = clean(input.value);
        if (!typed) return;
        if (!resolved) {
          input.value = "";
          input.setCustomValidity("Choose a name from the list.");
          try {
            input.reportValidity();
          } catch (_rv) {}
          return;
        }
        input.setCustomValidity("");
        if (resolved !== typed) input.value = resolved;
        if (typeof opts.onPick === "function") opts.onPick(resolved, input);
      }, 160);
    }

    input.addEventListener("input", sync);
    input.addEventListener("focus", sync);
    input.addEventListener("blur", onBlurStrict);
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeList(input, listEl);
    });
  }

  function wireSelector(selector, opts) {
    var nodes = global.document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      wireFieldSuggest(nodes[i], null, opts);
    }
  }

  global.portalWireFieldSuggest = wireFieldSuggest;
  global.portalWireFieldSuggestAll = wireSelector;
})(
  typeof window !== "undefined" ? window : globalThis
);
