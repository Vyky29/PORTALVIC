    /* Non-visual: demo login wiring below; replace with server auth when ready. */

    /**
     * WordPress / Elementor: each page has its own URL. Paste your permalinks here
     * (path or full URL). Leave "" to use local fallbacks under Dashboards/Dashboard/.
     */
    const PORTAL_URLS = {
      admin: "",
      staff: "",
      lead: ""
    };

    function portalRedirect(kind) {
      var custom = (PORTAL_URLS[kind] || "").trim();
      if (custom) return custom;
      var fallback = {
        admin: "../Dashboards/Dashboard/admin_dashboard.html",
        staff: "../Dashboards/Dashboard/staff_dashboard.html",
        lead: "../Dashboards/Dashboard/lead_dashboard.html"
      };
      return fallback[kind];
    }

    /**
     * Demo credentials — swap for API / DB lookup later
     * Vic + 0 -> admin | Vic + 1 -> staff | Vic + 2 -> lead
     */
    const users = {
      vic: {
        admin: "0",
        staff: "1",
        lead: "2"
      }
    };

    const errorEl = document.getElementById("error-msg");
    const nameInput = document.getElementById("name");
    const passwordInput = document.getElementById("password");
    const form = document.getElementById("login-form");

    function hideError() {
      errorEl.textContent = "";
      errorEl.classList.remove("visible");
    }

    function showError() {
      errorEl.textContent = "Invalid login details";
      errorEl.classList.add("visible");
    }

    function loginUser() {
      hideError();

      const name = nameInput.value.trim();
      const password = passwordInput.value;
      const account = users[name.toLowerCase()];

      if (!account) {
        showError();
        return;
      }

      if (password === account.admin) {
        window.location.href = portalRedirect("admin");
        return;
      }
      if (password === account.staff) {
        window.location.href = portalRedirect("staff");
        return;
      }
      if (password === account.lead) {
        window.location.href = portalRedirect("lead");
        return;
      }

      showError();
    }

    document.getElementById("btn-login").addEventListener("click", function (e) {
      e.preventDefault();
      loginUser();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      loginUser();
    });

    [nameInput, passwordInput].forEach(function (el) {
      el.addEventListener("input", hideError);
    });
