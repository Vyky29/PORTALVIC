/**
 * Staff name → Supabase login email (same data as staff_login_map.json).
 * WordPress Media often blocks .json uploads; this plain script is the supported workaround.
 * Load BEFORE auth-handler.js (see working_ui/login.html).
 */
window.PORTAL_STAFF_LOGIN_MAP = {
  version: 1,
  staff_username_to_email: {
    Sandra: "stf001@staff.import.pending",
    Roberto: "stf002@staff.import.pending",
    Dan: "stf003@staff.import.pending",
    Angel: "stf004@staff.import.pending",
    Youssef: "stf005@staff.import.pending",
    Yusef: "stf005@staff.import.pending",
    John: "stf006@staff.import.pending",
    Bismark: "stf007@staff.import.pending",
    Giuseppe: "stf008@staff.import.pending",
    Godsway: "stf009@staff.import.pending",
    Javier: "stf010@staff.import.pending",
    Aurora: "stf011@staff.import.pending",
    Berta: "stf012@staff.import.pending",
    Victor: "stf013@staff.import.pending",
    Carlos: "stf014@staff.import.pending",
    Alex: "stf015@staff.import.pending",
    Javi: "stf017@staff.import.pending",
    Raul: "stf018@staff.import.pending",
    Sevitha: "stf019@staff.import.pending",
    Demo: "stf020@staff.import.pending",
    demo: "stf020@staff.import.pending",
  },
};
