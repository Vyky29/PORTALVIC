(function () {
  // Source consumed by staff_dashboard_spreadsheet_adapter.js
  window.STAFF_DASHBOARD_SOURCE = {
  "staffPhotosBaseUrl": "portal/staff_photos/",
  "staffPhotoExtension": "jpg",
  "sundayDateOverrides": {
  "2026-06-07": {
    "leadOnDuty": "John",
    "replaceInstructor": {
      "JOHN, BERTA": "JOHN"
    }
  },
  "2026-06-14": {
    "leadOnDuty": "Berta",
    "replaceInstructor": {
      "JOHN, BERTA": "BERTA"
    }
  },
  "2026-06-21": {
    "leadOnDuty": "John",
    "replaceInstructor": {
      "JOHN, BERTA": "JOHN"
    }
  },
  "2026-06-28": {
    "leadOnDuty": "John",
    "replaceInstructor": {
      "JOHN, BERTA": "JOHN"
    }
  },
  "2026-07-05": {
    "leadOnDuty": "John",
    "replaceInstructor": {
      "JOHN, BERTA": "JOHN"
    }
  },
  "2026-07-12": {
    "leadOnDuty": "Berta",
    "replaceInstructor": {
      "JOHN, BERTA": "BERTA"
    }
  }
},
  "staffProfiles": {
    "sandra": {
      "staffId": "sandra",
      "staffName": "Sandra",
      "avatarFile": "portal/staff_photos/sandra.jpg",
      "staffRoleTrack": "fitness",
      "canViewAll": false
    },
    "roberto": {
      "staffId": "roberto",
      "staffName": "Roberto",
      "avatarFile": "portal/staff_photos/roberto.png",
      "staffRoleTrack": "swimming",
      "canViewAll": false
    },
    "dan": {
      "staffId": "dan",
      "staffName": "Dan",
      "avatarFile": "portal/staff_photos/dan.jpg",
      "staffRoleTrack": "swimming",
      "canViewAll": false
    },
    "angel": {
      "staffId": "angel",
      "staffName": "Angel",
      "avatarFile": "portal/staff_photos/angel.png?v=20260605-angel-buena",
      "staffRoleTrack": "swimming",
      "canViewAll": false
    },
    "youssef": {
      "staffId": "youssef",
      "staffName": "Youssef",
      "avatarFile": "portal/staff_photos/youssef.png",
      "staffRoleTrack": "swimming",
      "canViewAll": false
    },
    "john": {
      "staffId": "john",
      "staffName": "John",
      "avatarFile": "portal/staff_photos/john.png",
      "staffRoleTrack": "support_lead",
      "canViewAll": false
    },
    "bismark": {
      "staffId": "bismark",
      "staffName": "Bismark",
      "avatarFile": "portal/staff_photos/bismark.jpg",
      "staffRoleTrack": "support",
      "canViewAll": false
    },
    "giuseppe": {
      "staffId": "giuseppe",
      "staffName": "Giuseppe",
      "avatarFile": "portal/staff_photos/giuseppe.jpg",
      "staffRoleTrack": "support",
      "canViewAll": false
    },
    "godsway": {
      "staffId": "godsway",
      "staffName": "Godsway",
      "avatarFile": "portal/staff_photos/godsway.png",
      "staffRoleTrack": "support",
      "canViewAll": false
    },
    "javier": {
      "staffId": "javier",
      "staffName": "Javier",
      "avatarFile": "portal/staff_photos/javier.png",
      "staffRoleTrack": "swimming",
      "canViewAll": false
    },
    "aurora": {
      "staffId": "aurora",
      "staffName": "Aurora",
      "avatarFile": "portal/staff_photos/aurora.png?v=20260605-aurora-buena",
      "staffRoleTrack": "swimming",
      "canViewAll": false
    },
    "berta": {
      "staffId": "berta",
      "staffName": "Berta",
      "avatarFile": "portal/staff_photos/berta.png",
      "staffRoleTrack": "support_lead",
      "canViewAll": false
    },
    "victor": {
      "staffId": "victor",
      "staffName": "Victor",
      "avatarFile": "portal/staff_photos/victor.png",
      "staffRoleTrack": "manager",
      "canViewAll": true
    },
    "carlos": {
      "staffId": "carlos",
      "staffName": "Carlos",
      "avatarFile": "portal/staff_photos/carlos.png",
      "staffRoleTrack": "climbing",
      "canViewAll": false
    },
    "alex": {
      "staffId": "alex",
      "staffName": "Alex",
      "avatarFile": "portal/staff_photos/alex.png",
      "staffRoleTrack": "climbing",
      "canViewAll": false
    },
    "javi": {
      "staffId": "javi",
      "staffName": "Javi",
      "avatarFile": "portal/staff_photos/javi.png?v=20260605-javi-arranz",
      "staffRoleTrack": "manager",
      "canViewAll": true
    },
    "raul": {
      "staffId": "raul",
      "staffName": "Raul",
      "avatarFile": "portal/staff_photos/raul.png",
      "staffRoleTrack": "manager",
      "canViewAll": true
    },
    "sevitha": {
      "staffId": "sevitha",
      "staffName": "Sevitha",
      "avatarFile": "portal/staff_photos/sevitha.png",
      "staffRoleTrack": "admin",
      "canViewAll": true
    },
    "lulia": {
      "staffId": "lulia",
      "staffName": "Lulia",
      "avatarFile": "portal/staff_photos/lulia.jpg",
      "staffRoleTrack": "support",
      "canViewAll": false
    },
    "michelle": {
      "staffId": "michelle",
      "staffName": "Michelle",
      "avatarFile": "portal/staff_photos/michelle.png",
      "staffRoleTrack": "support",
      "canViewAll": false
    },
    "simon": {
      "staffId": "simon",
      "staffName": "Simon",
      "avatarFile": "portal/staff_photos/simon.png",
      "staffRoleTrack": "swimming",
      "canViewAll": false
    },
    "teflon": {
      "staffId": "teflon",
      "staffName": "Teflon",
      "avatarFile": "portal/staff_photos/youssef.png",
      "staffRoleTrack": "swimming",
      "canViewAll": false
    }
  },
  "expectedSessionsByWeekday": {
    "Monday": {
      "morning": 4,
      "afternoon": 16,
      "total": 20
    },
    "Tuesday": {
      "morning": 2,
      "afternoon": 18,
      "total": 20
    },
    "Wednesday": {
      "morning": 5,
      "afternoon": 16,
      "total": 21
    }
  },
  "sundayFeedbackMerges": [
    {
      "day": "Wednesday",
      "client_name": "Cyrus",
      "instructors": "JAVIER",
      "mergeKey": "cyrus_javier_wed_swim",
      "slots": [
        {
          "time_slot": "4 to 4.30",
          "service": "Aquatic Activity"
        },
        {
          "time_slot": "4.30 to 5.15",
          "service": "Multi-Activity"
        }
      ]
    }
  ],
  "overviewOmitRosterSlots": [
    {
      "weekday": "Wednesday",
      "client_slug": "cyrus",
      "time_slot": "4 to 4.30",
      "service": "Aquatic Activity"
    }
  ],
  "rows": [
  {
    "client_name": "Q6 College",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Pools",
    "time_slot": "11 to 12",
    "venue": "SwimFarm",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Ikram",
    "day": "Wednesday",
    "instructors": "RAUL, LULIYA",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Fadi",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.15",
    "venue": "Acton",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Tyson",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Vithura",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Tinashe",
    "day": "Wednesday",
    "instructors": "JOHN, GODSWAY, BISMARK",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Ruben",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Amar Ra",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Mia",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Amber",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Kayden",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-13"
  },
  {
    "client_name": "Fadi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Cyrus",
    "day": "Thursday",
    "instructors": "VICTOR",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "3.30 to 5",
    "venue": "SwimFarm",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Elijah",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Tom",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Ayman",
    "day": "Thursday",
    "instructors": "JAVI",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 5",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Thushyan",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Yassir",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Aqsa",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Khalid Ab",
    "day": "Thursday",
    "instructors": "JAVI",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Yossi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Yuri",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Karo",
    "day": "Thursday",
    "instructors": "JAVI",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Eiji",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Mohammed",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "JAVI",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Maiyar",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-14"
  },
  {
    "client_name": "Timi",
    "day": "Friday",
    "instructors": "VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-15"
  },
  {
    "client_name": "Ikram",
    "day": "Friday",
    "instructors": "RAUL, LULIYA",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-05-15"
  },
  {
    "client_name": "Fadi",
    "day": "Friday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-15"
  },
  {
    "client_name": "Adam Pi",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-15"
  },
  {
    "client_name": "Tinashe",
    "day": "Friday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-05-15"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-15"
  },
  {
    "client_name": "Emani",
    "day": "Saturday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10.30 to 11",
    "venue": "Acton",
    "session_date": "2026-05-16"
  },
  {
    "client_name": "Matthias",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SwallowEnd)",
    "time_slot": "11 to 11.30",
    "venue": "Acton",
    "session_date": "2026-05-16"
  },
  {
    "client_name": "Saaib",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12 to 12.30",
    "venue": "Acton",
    "session_date": "2026-05-16"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "GODSWAY",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "GODSWAY",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "GODSWAY",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Scott",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Serine",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "GODSWAY",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Max",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Faris",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Shaan",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Yoan",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Shire",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Simon",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "GODSWAY",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-05-17"
  },
  {
    "client_name": "Timi",
    "day": "Monday",
    "instructors": "VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Ikram",
    "day": "Monday",
    "instructors": "RAUL, LULIYA",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 12",
    "venue": "SwimFarm",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Ikram",
    "day": "Monday",
    "instructors": "ROBERTO, LULIYA, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Fadi",
    "day": "Monday",
    "instructors": "RAUL, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Ikram",
    "day": "Monday",
    "instructors": "ROBERTO, LULIYA",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Ayaan",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "4 to 5",
    "venue": "Westway",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Adam Pi",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Eddie",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Kirushy",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Yunis",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Tinashe",
    "day": "Monday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Gemma",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Joel",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Amar Ra",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Serine",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "5 to 6",
    "venue": "Westway",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Steven Ce",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Zayana",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Northolt",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Abodi P",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Aadam Ah",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Mario",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Yamik (Trial 18/05)",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-05-18"
  },
  {
    "client_name": "Ikram",
    "day": "Tuesday",
    "instructors": "ROBERTO, LULIYA",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Fadi",
    "day": "Tuesday",
    "instructors": "VICTOR, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Ikram",
    "day": "Tuesday",
    "instructors": "VICTOR, LULIYA, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "3 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Jad",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Adam Me",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Bediako",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Cayra",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Serine",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30-5.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Amir",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Junaid F",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Linda",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Logan",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Serine",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30-5.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Rayan Ta",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Kareena",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Richard",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-19"
  },
  {
    "client_name": "Timi",
    "day": "Wednesday",
    "instructors": "RAUL, CARLOS",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Ikram",
    "day": "Wednesday",
    "instructors": "RAUL, LULIYA",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Fadi",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.15",
    "venue": "Acton",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Tyson",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Vithura",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Tinashe",
    "day": "Wednesday",
    "instructors": "JOHN, GODSWAY, BISMARK",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Ruben",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Amar Ra",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Mia",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Amber",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Kayden",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-20"
  },
  {
    "client_name": "Fadi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Cyrus",
    "day": "Thursday",
    "instructors": "VICTOR",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "3.30 to 5",
    "venue": "SwimFarm",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Elijah",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Tom",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Ayman",
    "day": "Thursday",
    "instructors": "JAVI",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 5",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Thushyan",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Yassir",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Aqsa",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Khalid Ab",
    "day": "Thursday",
    "instructors": "JAVI",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Yossi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Yuri",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Karo",
    "day": "Thursday",
    "instructors": "JAVI",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Eiji",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Mohammed",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "JAVI",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Maiyar",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-05-21"
  },
  {
    "client_name": "Timi",
    "day": "Friday",
    "instructors": "VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-22"
  },
  {
    "client_name": "Ikram",
    "day": "Friday",
    "instructors": "RAUL, LULIYA",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-05-22"
  },
  {
    "client_name": "Fadi",
    "day": "Friday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-05-22"
  },
  {
    "client_name": "Adam Pi",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-05-22"
  },
  {
    "client_name": "Tinashe",
    "day": "Friday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-05-22"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-05-22"
  },
  {
    "client_name": "Timi",
    "day": "Monday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "ACAT",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 12",
    "venue": "SwimFarm",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Ikram",
    "day": "Monday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Fadi",
    "day": "Monday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "CLOSED",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Ayaan",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "4 to 5",
    "venue": "Westway",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Adam Pi",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Eddie",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Kirushy",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Yunis",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Tinashe",
    "day": "Monday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Gemma",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Joel",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Amar Ra",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Serine",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "5 to 6",
    "venue": "Westway",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Steven C",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Zayana",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Abodi P",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Mario",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Yamik",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-01"
  },
  {
    "client_name": "Ikram",
    "day": "Tuesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Fadi",
    "day": "Tuesday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Jad",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Adam Me",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Bediako",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Cayra",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Serine",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Amir",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Junaid",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Linda",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Logan",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Rayan Ta",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Kareena",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Richard",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-02"
  },
  {
    "client_name": "Ikram",
    "day": "Wednesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Fadi",
    "day": "Wednesday",
    "instructors": "ROBERTO, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Tyson",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Vithura",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Tinashe",
    "day": "Wednesday",
    "instructors": "JOHN, GODSWAY, BISMARK",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Ruben",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Amar Ra",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Mia",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Amber",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Kayden",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-03"
  },
  {
    "client_name": "Fadi",
    "day": "Thursday",
    "instructors": "ROBERTO, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Cyrus",
    "day": "Thursday",
    "instructors": "VICTOR",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "3.30 to 5",
    "venue": "SwimFarm",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Elijah",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Tom",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Ayman",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 5",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Thushyan",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Yassir",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Aqsa",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Khalid Ab",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Yossi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Yuri",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Karo",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Eiji",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Mohammed",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Maiyar",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-04"
  },
  {
    "client_name": "Timi",
    "day": "Friday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-05"
  },
  {
    "client_name": "Emmanuel",
    "day": "Friday",
    "instructors": "VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-05"
  },
  {
    "client_name": "Ikram",
    "day": "Friday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-05"
  },
  {
    "client_name": "Fadi",
    "day": "Friday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-05"
  },
  {
    "client_name": "Adam Pi",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-05"
  },
  {
    "client_name": "Tinashe",
    "day": "Friday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-05"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-05"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10 to 10.30",
    "venue": "Acton",
    "session_date": "2026-06-06"
  },
  {
    "client_name": "Emani",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10.30 to 11",
    "venue": "Acton",
    "session_date": "2026-06-06"
  },
  {
    "client_name": "Matthias",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SwallowEnd)",
    "time_slot": "11 to 11.30",
    "venue": "Acton",
    "session_date": "2026-06-06"
  },
  {
    "client_name": "Saaib",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12 to 12.30",
    "venue": "Acton",
    "session_date": "2026-06-06"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12.30 to 1",
    "venue": "Acton",
    "session_date": "2026-06-06"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "9.30 to 10",
    "venue": "Acton",
    "session_date": "2026-06-06"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Scott",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Serine",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Max",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Ayden W",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Patrick",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Faris",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Shaan",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Yoan",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Shire",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Simon",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-07"
  },
  {
    "client_name": "Timi",
    "day": "Monday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "ACAT",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 12",
    "venue": "SwimFarm",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Ikram",
    "day": "Monday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Fadi",
    "day": "Monday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "CLOSED",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Ayaan",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "4 to 5",
    "venue": "Westway",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Adam Pi",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Eddie",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Kirushy",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Yunis",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Tinashe",
    "day": "Monday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Gemma",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Joel",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Amar Ra",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Serine",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "5 to 6",
    "venue": "Westway",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Steven C",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Zayana",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Abodi P",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Mario",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Yamik",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-08"
  },
  {
    "client_name": "Ikram",
    "day": "Tuesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Fadi",
    "day": "Tuesday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Jad",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Adam Me",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Bediako",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Cayra",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Serine",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Amir",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Junaid",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Linda",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Logan",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Rayan Ta",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Kareena",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Richard",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-09"
  },
  {
    "client_name": "Ikram",
    "day": "Wednesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Fadi",
    "day": "Wednesday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Tyson",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Vithura",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Tinashe",
    "day": "Wednesday",
    "instructors": "JOHN, GODSWAY, BISMARK",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Ruben",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Amar Ra",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Mia",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Amber",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Kayden",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-10"
  },
  {
    "client_name": "Fadi",
    "day": "Thursday",
    "instructors": "ROBERTO, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Cyrus",
    "day": "Thursday",
    "instructors": "VICTOR",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "3.30 to 5",
    "venue": "SwimFarm",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Elijah",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Tom",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Ayman",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 5",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Thushyan",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Yassir",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Aqsa",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Khalid Ab",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Yossi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Yuri",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Karo",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Eiji",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Mohammed",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Maiyar",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-11"
  },
  {
    "client_name": "Timi",
    "day": "Friday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-12"
  },
  {
    "client_name": "Emmanuel",
    "day": "Friday",
    "instructors": "VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-12"
  },
  {
    "client_name": "Ikram",
    "day": "Friday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-12"
  },
  {
    "client_name": "Fadi",
    "day": "Friday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-12"
  },
  {
    "client_name": "Adam Pi",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-12"
  },
  {
    "client_name": "Tinashe",
    "day": "Friday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-12"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-12"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10 to 10.30",
    "venue": "Acton",
    "session_date": "2026-06-13"
  },
  {
    "client_name": "Emani",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10.30 to 11",
    "venue": "Acton",
    "session_date": "2026-06-13"
  },
  {
    "client_name": "Matthias",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SwallowEnd)",
    "time_slot": "11 to 11.30",
    "venue": "Acton",
    "session_date": "2026-06-13"
  },
  {
    "client_name": "Saaib",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12 to 12.30",
    "venue": "Acton",
    "session_date": "2026-06-13"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12.30 to 1",
    "venue": "Acton",
    "session_date": "2026-06-13"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "9.30 to 10",
    "venue": "Acton",
    "session_date": "2026-06-13"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Scott",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Serine",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Max",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Ayden W",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Patrick",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Faris",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Shaan",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Yoan",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Shire",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Simon",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-14"
  },
  {
    "client_name": "Timi",
    "day": "Monday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "ACAT",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 12",
    "venue": "SwimFarm",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Ikram",
    "day": "Monday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Fadi",
    "day": "Monday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "CLOSED",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Ayaan",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "4 to 5",
    "venue": "Westway",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Adam Pi",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Eddie",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Kirushy",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Yunis",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Tinashe",
    "day": "Monday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Gemma",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Joel",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Amar Ra",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Serine",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "5 to 6",
    "venue": "Westway",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Steven C",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Zayana",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Abodi P",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Mario",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Yamik",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-15"
  },
  {
    "client_name": "Ikram",
    "day": "Tuesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Fadi",
    "day": "Tuesday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Jad",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Adam Me",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Bediako",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Cayra",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Serine",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Amir",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Junaid",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Linda",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Logan",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Rayan Ta",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Kareena",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Richard",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-16"
  },
  {
    "client_name": "Ikram",
    "day": "Wednesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Fadi",
    "day": "Wednesday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Tyson",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Vithura",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Tinashe",
    "day": "Wednesday",
    "instructors": "JOHN, GODSWAY, BISMARK",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Ruben",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Amar Ra",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Mia",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Amber",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Kayden",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-17"
  },
  {
    "client_name": "Fadi",
    "day": "Thursday",
    "instructors": "ROBERTO, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Cyrus",
    "day": "Thursday",
    "instructors": "VICTOR",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "3.30 to 5",
    "venue": "SwimFarm",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Elijah",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Tom",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Ayman",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 5",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Thushyan",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Yassir",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Aqsa",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Khalid Ab",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Yossi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Yuri",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Karo",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Eiji",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Mohammed",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Maiyar",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-18"
  },
  {
    "client_name": "Timi",
    "day": "Friday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-19"
  },
  {
    "client_name": "Emmanuel",
    "day": "Friday",
    "instructors": "VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-19"
  },
  {
    "client_name": "Ikram",
    "day": "Friday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-19"
  },
  {
    "client_name": "Fadi",
    "day": "Friday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-19"
  },
  {
    "client_name": "Adam Pi",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-19"
  },
  {
    "client_name": "Tinashe",
    "day": "Friday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-19"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-19"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10 to 10.30",
    "venue": "Acton",
    "session_date": "2026-06-20"
  },
  {
    "client_name": "Emani",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10.30 to 11",
    "venue": "Acton",
    "session_date": "2026-06-20"
  },
  {
    "client_name": "Matthias",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SwallowEnd)",
    "time_slot": "11 to 11.30",
    "venue": "Acton",
    "session_date": "2026-06-20"
  },
  {
    "client_name": "Saaib",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12 to 12.30",
    "venue": "Acton",
    "session_date": "2026-06-20"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12.30 to 1",
    "venue": "Acton",
    "session_date": "2026-06-20"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "9.30 to 10",
    "venue": "Acton",
    "session_date": "2026-06-20"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Scott",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Serine",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Max",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Ayden W",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Patrick",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Faris",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Shaan",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Yoan",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Shire",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Simon",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-21"
  },
  {
    "client_name": "Timi",
    "day": "Monday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "ACAT",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 12",
    "venue": "SwimFarm",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Ikram",
    "day": "Monday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Fadi",
    "day": "Monday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "CLOSED",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Ayaan",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "4 to 5",
    "venue": "Westway",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Adam Pi",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Eddie",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Kirushy",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Yunis",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Tinashe",
    "day": "Monday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Gemma",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Joel",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Amar Ra",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Serine",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "5 to 6",
    "venue": "Westway",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Steven C",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Zayana",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Abodi P",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Mario",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Yamik",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-22"
  },
  {
    "client_name": "Ikram",
    "day": "Tuesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Fadi",
    "day": "Tuesday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Jad",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Adam Me",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Bediako",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Cayra",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Serine",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Amir",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Junaid",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Linda",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Logan",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Rayan Ta",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Kareena",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Richard",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-23"
  },
  {
    "client_name": "Ikram",
    "day": "Wednesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Fadi",
    "day": "Wednesday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Tyson",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Vithura",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "RAUL",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Tinashe",
    "day": "Wednesday",
    "instructors": "JOHN, GODSWAY, BISMARK",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Ruben",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Amar Ra",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "RAUL",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Mia",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Amber",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Kayden",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-24"
  },
  {
    "client_name": "Fadi",
    "day": "Thursday",
    "instructors": "ROBERTO, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Cyrus",
    "day": "Thursday",
    "instructors": "VICTOR",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "3.30 to 5",
    "venue": "SwimFarm",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Elijah",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Tom",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Ayman",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 5",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Thushyan",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Yassir",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Aqsa",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Khalid Ab",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Yossi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Yuri",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Karo",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Eiji",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Mohammed",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Maiyar",
    "day": "Thursday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-25"
  },
  {
    "client_name": "Timi",
    "day": "Friday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-26"
  },
  {
    "client_name": "Emmanuel",
    "day": "Friday",
    "instructors": "VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-26"
  },
  {
    "client_name": "Ikram",
    "day": "Friday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-26"
  },
  {
    "client_name": "Fadi",
    "day": "Friday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-26"
  },
  {
    "client_name": "Adam Pi",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-26"
  },
  {
    "client_name": "Tinashe",
    "day": "Friday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-26"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-26"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10 to 10.30",
    "venue": "Acton",
    "session_date": "2026-06-27"
  },
  {
    "client_name": "Emani",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10.30 to 11",
    "venue": "Acton",
    "session_date": "2026-06-27"
  },
  {
    "client_name": "Matthias",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SwallowEnd)",
    "time_slot": "11 to 11.30",
    "venue": "Acton",
    "session_date": "2026-06-27"
  },
  {
    "client_name": "Saaib",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12 to 12.30",
    "venue": "Acton",
    "session_date": "2026-06-27"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12.30 to 1",
    "venue": "Acton",
    "session_date": "2026-06-27"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "9.30 to 10",
    "venue": "Acton",
    "session_date": "2026-06-27"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Scott",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Serine",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Max",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Ayden W",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Patrick",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Faris",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Shaan",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Yoan",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Shire",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Simon",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "DAN",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-06-28"
  },
  {
    "client_name": "Timi",
    "day": "Monday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "ACAT",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 12",
    "venue": "SwimFarm",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Ikram",
    "day": "Monday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Fadi",
    "day": "Monday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "CLOSED",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Ayaan",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "4 to 5",
    "venue": "Westway",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Adam Pi",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Eddie",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Kirushy",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Yunis",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Tinashe",
    "day": "Monday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Gemma",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Joel",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Amar Ra",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Serine",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "5 to 6",
    "venue": "Westway",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Steven C",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Zayana",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Northolt",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Abodi P",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Mario",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Yamik",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-06-29"
  },
  {
    "client_name": "Ikram",
    "day": "Tuesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Fadi",
    "day": "Tuesday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Jad",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Adam Me",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Bediako",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Cayra",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Serine",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Amir",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Junaid",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Linda",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Logan",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Rayan Ta",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Kareena",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Richard",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-06-30"
  },
  {
    "client_name": "Ikram",
    "day": "Wednesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Fadi",
    "day": "Wednesday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Tyson",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Vithura",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Tinashe",
    "day": "Wednesday",
    "instructors": "JOHN, GODSWAY, BISMARK",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Ruben",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Amar Ra",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Mia",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Amber",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Kayden",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-01"
  },
  {
    "client_name": "Fadi",
    "day": "Thursday",
    "instructors": "ROBERTO, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Cyrus",
    "day": "Thursday",
    "instructors": "VICTOR",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "3.30 to 5",
    "venue": "SwimFarm",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Elijah",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Tom",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Ayman",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 5",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Thushyan",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Yassir",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Aqsa",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Khalid Ab",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Yossi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Yuri",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Karo",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Eiji",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Mohammed",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Maiyar",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-02"
  },
  {
    "client_name": "Timi",
    "day": "Friday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-03"
  },
  {
    "client_name": "Emmanuel",
    "day": "Friday",
    "instructors": "VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-03"
  },
  {
    "client_name": "Ikram",
    "day": "Friday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-03"
  },
  {
    "client_name": "Fadi",
    "day": "Friday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-03"
  },
  {
    "client_name": "Adam Pi",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-03"
  },
  {
    "client_name": "Tinashe",
    "day": "Friday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-07-03"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-03"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10 to 10.30",
    "venue": "Acton",
    "session_date": "2026-07-04"
  },
  {
    "client_name": "Emani",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10.30 to 11",
    "venue": "Acton",
    "session_date": "2026-07-04"
  },
  {
    "client_name": "Matthias",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SwallowEnd)",
    "time_slot": "11 to 11.30",
    "venue": "Acton",
    "session_date": "2026-07-04"
  },
  {
    "client_name": "Saaib",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12 to 12.30",
    "venue": "Acton",
    "session_date": "2026-07-04"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12.30 to 1",
    "venue": "Acton",
    "session_date": "2026-07-04"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "9.30 to 10",
    "venue": "Acton",
    "session_date": "2026-07-04"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Scott",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Serine",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Max",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Ayden W",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Patrick",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Faris",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Shaan",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Yoan",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Shire",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Simon",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "JOHN",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-05"
  },
  {
    "client_name": "Timi",
    "day": "Monday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "ACAT",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 12",
    "venue": "SwimFarm",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Ikram",
    "day": "Monday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Fadi",
    "day": "Monday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "CLOSED",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Ayaan",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "4 to 5",
    "venue": "Westway",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Adam Pi",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Eddie",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Kirushy",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Yunis",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Tinashe",
    "day": "Monday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Gemma",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Joel",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Amar Ra",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Serine",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "5 to 6",
    "venue": "Westway",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Steven C",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Zayana",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Northolt",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Abodi P",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Mario",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Yamik",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-07-06"
  },
  {
    "client_name": "Ikram",
    "day": "Tuesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Fadi",
    "day": "Tuesday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Jad",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Adam Me",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Bediako",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Cayra",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Serine",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Amir",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Junaid",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Linda",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Logan",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Rayan Ta",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Kareena",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Richard",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-07"
  },
  {
    "client_name": "Ikram",
    "day": "Wednesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Fadi",
    "day": "Wednesday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Tyson",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Vithura",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Tinashe",
    "day": "Wednesday",
    "instructors": "JOHN, GODSWAY, BISMARK",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Ruben",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Amar Ra",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Mia",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Amber",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Kayden",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-08"
  },
  {
    "client_name": "Fadi",
    "day": "Thursday",
    "instructors": "ROBERTO, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Cyrus",
    "day": "Thursday",
    "instructors": "VICTOR",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "3.30 to 5",
    "venue": "SwimFarm",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Elijah",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Tom",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Ayman",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 5",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Thushyan",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Yassir",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Aqsa",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Khalid Ab",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Yossi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Yuri",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Karo",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Eiji",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Mohammed",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Maiyar",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-09"
  },
  {
    "client_name": "Timi",
    "day": "Friday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-10"
  },
  {
    "client_name": "Emmanuel",
    "day": "Friday",
    "instructors": "VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-10"
  },
  {
    "client_name": "Ikram",
    "day": "Friday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-10"
  },
  {
    "client_name": "Fadi",
    "day": "Friday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-10"
  },
  {
    "client_name": "Adam Pi",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-10"
  },
  {
    "client_name": "Tinashe",
    "day": "Friday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-07-10"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-10"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10 to 10.30",
    "venue": "Acton",
    "session_date": "2026-07-11"
  },
  {
    "client_name": "Emani",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10.30 to 11",
    "venue": "Acton",
    "session_date": "2026-07-11"
  },
  {
    "client_name": "Matthias",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SwallowEnd)",
    "time_slot": "11 to 11.30",
    "venue": "Acton",
    "session_date": "2026-07-11"
  },
  {
    "client_name": "Saaib",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12 to 12.30",
    "venue": "Acton",
    "session_date": "2026-07-11"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12.30 to 1",
    "venue": "Acton",
    "session_date": "2026-07-11"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "9.30 to 10",
    "venue": "Acton",
    "session_date": "2026-07-11"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Scott",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Serine",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Max",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Ayden W",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Patrick",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Faris",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Shaan",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Yoan",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Shire",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Simon",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm",
    "session_date": "2026-07-12"
  },
  {
    "client_name": "Timi",
    "day": "Monday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "ACAT",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 12",
    "venue": "SwimFarm",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Ikram",
    "day": "Monday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Fadi",
    "day": "Monday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "CLOSED",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Ayaan",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "4 to 5",
    "venue": "Westway",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Adam Pi",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Eddie",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Kirushy",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Yunis",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Tinashe",
    "day": "Monday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Gemma",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Joel",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Amar Ra",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Serine",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "5 to 6",
    "venue": "Westway",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Steven C",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Zayana",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Northolt",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Abodi P",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Mario",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Yamik",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-07-13"
  },
  {
    "client_name": "Ikram",
    "day": "Tuesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Fadi",
    "day": "Tuesday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Jad",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Adam Me",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Bediako",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Cayra",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Serine",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Amir",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Junaid",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Linda",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Logan",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Rayan Ta",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Kareena",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Richard",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-14"
  },
  {
    "client_name": "Ikram",
    "day": "Wednesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Fadi",
    "day": "Wednesday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Tyson",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Vithura",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Tinashe",
    "day": "Wednesday",
    "instructors": "JOHN, GODSWAY, BISMARK",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Ruben",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Amar Ra",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Mia",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Amber",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Kayden",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-15"
  },
  {
    "client_name": "Fadi",
    "day": "Thursday",
    "instructors": "ROBERTO, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Cyrus",
    "day": "Thursday",
    "instructors": "VICTOR",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "3.30 to 5",
    "venue": "SwimFarm",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Elijah",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Tom",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Ayman",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 5",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Thushyan",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Yassir",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Aqsa",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Khalid Ab",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Yossi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Yuri",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Karo",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Eiji",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Mohammed",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Maiyar",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton",
    "session_date": "2026-07-16"
  },
  {
    "client_name": "Timi",
    "day": "Friday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-17"
  },
  {
    "client_name": "Emmanuel",
    "day": "Friday",
    "instructors": "VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-17"
  },
  {
    "client_name": "Ikram",
    "day": "Friday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm",
    "session_date": "2026-07-17"
  },
  {
    "client_name": "Fadi",
    "day": "Friday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm",
    "session_date": "2026-07-17"
  },
  {
    "client_name": "Adam Pi",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton",
    "session_date": "2026-07-17"
  },
  {
    "client_name": "Tinashe",
    "day": "Friday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm",
    "session_date": "2026-07-17"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton",
    "session_date": "2026-07-17"
  },
  {
    "client_name": "Timi",
    "day": "Friday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Emmanuel",
    "day": "Friday",
    "instructors": "VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Ikram",
    "day": "Friday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Fadi",
    "day": "Friday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Adam Pi",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Tinashe",
    "day": "Friday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Friday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Timi",
    "day": "Monday",
    "instructors": "RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "1 to 3",
    "venue": "SwimFarm"
  },
  {
    "client_name": "ACAT",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 12",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Ikram",
    "day": "Monday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Fadi",
    "day": "Monday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm"
  },
  {
    "client_name": "CLOSED",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton"
  },
  {
    "client_name": "Ayaan",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "4 to 5",
    "venue": "Westway"
  },
  {
    "client_name": "Adam Pi",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Eddie",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton"
  },
  {
    "client_name": "Kirushy",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt"
  },
  {
    "client_name": "Yunis",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt"
  },
  {
    "client_name": "Tinashe",
    "day": "Monday",
    "instructors": "BISMARK, GIUSEPPE, JOHN",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Gemma",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt"
  },
  {
    "client_name": "Joel",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Amar Ra",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt"
  },
  {
    "client_name": "Serine",
    "day": "Monday",
    "instructors": "SANDRA",
    "service": "Physical Activity",
    "area": "Gym",
    "time_slot": "5 to 6",
    "venue": "Westway"
  },
  {
    "client_name": "Steven C",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Zayana",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Northolt"
  },
  {
    "client_name": "Abodi P",
    "day": "Monday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Monday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt"
  },
  {
    "client_name": "Mario",
    "day": "Monday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton"
  },
  {
    "client_name": "Yamik",
    "day": "Monday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10 to 10.30",
    "venue": "Acton"
  },
  {
    "client_name": "Emani",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "10.30 to 11",
    "venue": "Acton"
  },
  {
    "client_name": "Matthias",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SwallowEnd)",
    "time_slot": "11 to 11.30",
    "venue": "Acton"
  },
  {
    "client_name": "Saaib",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12 to 12.30",
    "venue": "Acton"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12.30 to 1",
    "venue": "Acton"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Saturday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "9.30 to 10",
    "venue": "Acton"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "1 to 2",
    "venue": "Westway"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "JOHN, BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "1.15 to 2",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "10 to 11",
    "venue": "Westway"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "JOHN, BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "10.15 to 11",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "JOHN, BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "11 to 12",
    "venue": "Westway"
  },
  {
    "client_name": "Arthur Ma",
    "day": "Sunday",
    "instructors": "JOHN, BERTA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Arthur Mo",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Cyrus",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Eiji",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11.45 to 12.30",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Gabriel",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Hazem",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "11 to 11.45",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Scott",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway"
  },
  {
    "client_name": "Serine",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "12 to 1",
    "venue": "Westway"
  },
  {
    "client_name": "Adaam Ah",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Amaar Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Erik",
    "day": "Sunday",
    "instructors": "JOHN, BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Haneef",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "12.30 to 1.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Max",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Rodin",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Zakariya",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2 to 2.30",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Ayden W",
    "day": "Sunday",
    "instructors": "ALEX",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway"
  },
  {
    "client_name": "Patrick",
    "day": "Sunday",
    "instructors": "CARLOS",
    "service": "Climbing Activity",
    "area": "Wall",
    "time_slot": "2 to 3",
    "venue": "Westway"
  },
  {
    "client_name": "Faris",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Shaan",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Yoan",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "2.30 to 3",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 10.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Shire",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Big Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Simon",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Small Pool",
    "time_slot": "9 to 9.30",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Adam Ab",
    "day": "Sunday",
    "instructors": "AURORA",
    "service": "Multi-Activity",
    "area": "Small Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Jack S",
    "day": "Sunday",
    "instructors": "BISMARK",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Jack W",
    "day": "Sunday",
    "instructors": "JOHN, BERTA",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Samer",
    "day": "Sunday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Yusuf Ah",
    "day": "Sunday",
    "instructors": "ROBERTO",
    "service": "Multi-Activity",
    "area": "Big Pool",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Zaid",
    "day": "Sunday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Hub Room",
    "time_slot": "9.30 to 10.15",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Fadi",
    "day": "Thursday",
    "instructors": "ROBERTO, RAUL",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Cyrus",
    "day": "Thursday",
    "instructors": "VICTOR",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "3.30 to 5",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Elijah",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton"
  },
  {
    "client_name": "Tom",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton"
  },
  {
    "client_name": "Ayman",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4 to 5",
    "venue": "Acton"
  },
  {
    "client_name": "Thushyan",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton"
  },
  {
    "client_name": "Yassir",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton"
  },
  {
    "client_name": "Aqsa",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Khalid Ab",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Yossi",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Yuri",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Karo",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Eiji",
    "day": "Thursday",
    "instructors": "SIMON",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton"
  },
  {
    "client_name": "Mohammed",
    "day": "Thursday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton"
  },
  {
    "client_name": "Hazem",
    "day": "Thursday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton"
  },
  {
    "client_name": "Maiyar",
    "day": "Thursday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton"
  },
  {
    "client_name": "Ikram",
    "day": "Tuesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Fadi",
    "day": "Tuesday",
    "instructors": "ROBERTO, VICTOR",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Ayman",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4 to 4.30",
    "venue": "Acton"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton"
  },
  {
    "client_name": "CLOSED",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton"
  },
  {
    "client_name": "Jad",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton"
  },
  {
    "client_name": "Adam Me",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Acton"
  },
  {
    "client_name": "Bediako",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "4.30 to 5",
    "venue": "Acton"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Acton"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Acton"
  },
  {
    "client_name": "Serine",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "4.30 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Amir",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Junaid",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Linda",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Logan",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Acton"
  },
  {
    "client_name": "Aydaan Ah",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "5.30 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Rayan Ta",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Rayyan Fi",
    "day": "Tuesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "5.30 to 6.30",
    "venue": "Acton"
  },
  {
    "client_name": "Eiji",
    "day": "Tuesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton"
  },
  {
    "client_name": "Hazem",
    "day": "Tuesday",
    "instructors": "AURORA",
    "service": "Aquatic Activity",
    "area": "Lane (DE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton"
  },
  {
    "client_name": "Kareena",
    "day": "Tuesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton"
  },
  {
    "client_name": "Richard",
    "day": "Tuesday",
    "instructors": "ANGEL",
    "service": "Aquatic Activity",
    "area": "Lane (SE)",
    "time_slot": "6 to 6.30",
    "venue": "Acton"
  },
  {
    "client_name": "Ikram",
    "day": "Wednesday",
    "instructors": "LULIA, MICHELLE",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "11 to 4",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Fadi",
    "day": "Wednesday",
    "instructors": "ROBERTO, YOUSSEF",
    "service": "Day Centre",
    "area": "Hub Room",
    "time_slot": "12.30 to 3",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4 to 4.30",
    "venue": "Acton"
  },
  {
    "client_name": "Tyson",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt"
  },
  {
    "client_name": "Vithura",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5",
    "venue": "Northolt"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "4.30 to 5.15",
    "venue": "Acton"
  },
  {
    "client_name": "Tinashe",
    "day": "Wednesday",
    "instructors": "JOHN, GODSWAY, BISMARK",
    "service": "Bespoke Programme",
    "area": "Hub Room",
    "time_slot": "4.30 to 6",
    "venue": "SwimFarm"
  },
  {
    "client_name": "Ruben",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 5.30",
    "venue": "Northolt"
  },
  {
    "client_name": "Amar Ra",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5 to 6",
    "venue": "Northolt"
  },
  {
    "client_name": "Adam Ab",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Cyrus",
    "day": "Wednesday",
    "instructors": "GIUSEPPE",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Scott",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Multi-Activity",
    "area": "Teaching Pool",
    "time_slot": "5.15 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Stephanie",
    "day": "Wednesday",
    "instructors": "BERTA",
    "service": "Multi-Activity",
    "area": "Room 2",
    "time_slot": "5.15 to 6",
    "venue": "Acton"
  },
  {
    "client_name": "Mia",
    "day": "Wednesday",
    "instructors": "DAN",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "5.30 to 6.30",
    "venue": "Northolt"
  },
  {
    "client_name": "Amber",
    "day": "Wednesday",
    "instructors": "ROBERTO",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Northolt"
  },
  {
    "client_name": "Kayden",
    "day": "Wednesday",
    "instructors": "JAVIER",
    "service": "Aquatic Activity",
    "area": "Lane",
    "time_slot": "6 to 6.30",
    "venue": "Acton"
  },
  {
    "client_name": "NO CLIENT",
    "day": "Wednesday",
    "instructors": "YOUSSEF",
    "service": "Aquatic Activity",
    "area": "Teaching Pool",
    "time_slot": "6 to 6.30",
    "venue": "Acton"
  }
],
  "clientsInfo": []
};
})();
