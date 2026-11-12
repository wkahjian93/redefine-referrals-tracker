// api = the Google Apps Script /exec URL of the team server; appUrl = this app's public link (used in WhatsApp shares).
// firebase + vapidKey = Firebase web settings (public values, safe here) for lock-screen pop-ups. Same Firebase project as REDEFINE Calendar.
window.RRT_CONFIG = {
  api: 'https://script.google.com/macros/s/AKfycbwGwiZTn-y6gTpZFRCDbvnYoyhwM3kLfvLK6yESCvMzchR0DC0mAerWhv0wk_dhWbEF/exec',
  appUrl: 'https://wkahjian93.github.io/redefine-referrals-tracker/',
  firebase: {
    apiKey: 'AIzaSyAgImD0Ymcz2xxJqxrLAY4pWKPq5LU_s80',
    authDomain: 'redefine-calendar.firebaseapp.com',
    projectId: 'redefine-calendar',
    storageBucket: 'redefine-calendar.firebasestorage.app',
    messagingSenderId: '6378826198',
    appId: '1:6378826198:web:6eb6e904b430037d715c77'
  },
  vapidKey: 'BDXnbHzWr_2YQdgruNn_zrQCejdefoXDHC3dSL0r52uT32tdxk3zryUrm96NIo1vGbPhVEJjRJfcTMRK7J7PsCM'
};
