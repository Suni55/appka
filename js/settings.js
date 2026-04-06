// ─── POWIADOMIENIA ────────────────────────────────────────
    const NOTIF_KEY = 'notifEnabled';
    const NOTIF_TIME_KEY = 'notifTime';

    function initSettingsTab() {
        const enabled = localStorage.getItem(NOTIF_KEY) === 'true';
        const time = localStorage.getItem(NOTIF_TIME_KEY) || '07:30';
        const toggle = document.getElementById('notif-toggle');
        const timeRow = document.getElementById('notif-time-row');
        const timePicker = document.getElementById('notif-time');
        const darkToggle = document.getElementById('dark-toggle-settings');

        if (toggle) toggle.checked = enabled;
        if (timePicker) timePicker.value = time;
        if (timeRow) timeRow.style.display = enabled ? 'flex' : 'none';
        if (darkToggle) darkToggle.checked = document.body.classList.contains('dark');

        updateNotifStatus();
        renderSyncUI();
    }

    function updateNotifStatus() {
        const el = document.getElementById('notif-status');
        if (!el) return;
        const enabled = localStorage.getItem(NOTIF_KEY) === 'true';
        if (!enabled) { el.innerHTML = ''; return; }

        if (!('Notification' in window)) {
            el.className = 'notif-status err';
            el.textContent = '❌ Twoja przeglądarka nie obsługuje powiadomień';
        } else if (Notification.permission === 'granted') {
            const time = localStorage.getItem(NOTIF_TIME_KEY) || '07:30';
            el.className = 'notif-status ok';
            el.textContent = `✅ Powiadomienia włączone — codziennie o ${time}`;
        } else if (Notification.permission === 'denied') {
            el.className = 'notif-status err';
            el.textContent = '❌ Powiadomienia zablokowane — zmień w ustawieniach Safari';
        } else {
            el.className = 'notif-status warn';
            el.textContent = '⏳ Oczekuje na zgodę...';
        }
    }

    async function toggleNotifications(enabled) {
        const timeRow = document.getElementById('notif-time-row');
        if (timeRow) timeRow.style.display = enabled ? 'flex' : 'none';

        if (!enabled) {
            localStorage.setItem(NOTIF_KEY, 'false');
            updateNotifStatus();
            return;
        }

        if (!('Notification' in window)) {
            showToast('❌ Ta przeglądarka nie obsługuje powiadomień');
            document.getElementById('notif-toggle').checked = false;
            return;
        }

        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
            localStorage.setItem(NOTIF_KEY, 'true');
            scheduleNotifications();
            showToast('✅ Powiadomienia włączone!');
        } else {
            localStorage.setItem(NOTIF_KEY, 'false');
            document.getElementById('notif-toggle').checked = false;
            showToast('❌ Nie przyznano zgody na powiadomienia');
        }
        updateNotifStatus();
    }

    function saveNotifTime(val) {
        localStorage.setItem(NOTIF_TIME_KEY, val);
        scheduleNotifications();
        updateNotifStatus();
        showToast(`⏰ Godzina powiadomień: ${val}`);
    }

    function scheduleNotifications() {
        // Planujemy następne powiadomienie przez SW
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.ready.then(reg => {
            const time = localStorage.getItem(NOTIF_TIME_KEY) || '07:30';
            const [h, m] = time.split(':').map(Number);
            const now = new Date();
            const next = new Date();
            next.setHours(h, m, 0, 0);
            if (next <= now) next.setDate(next.getDate() + 1);
            const delay = next.getTime() - now.getTime();

            // Wyślij wiadomość do SW z czasem
            reg.active?.postMessage({
                type: 'SCHEDULE_NOTIF',
                delay,
                title: '🍳 Dzień dobry! Co na śniadanie?',
                body: getBreakfastText(),
            });
        });
    }

    function getBreakfastText() {
        const dayMap = {0:'sun',1:'mon',2:'tue',3:'wed',4:'thu',5:'fri',6:'sat'};
        const dayId = dayMap[new Date().getDay()];
        const p1 = currentPlan[`${dayId}-breakfast-person1`];
        const p2 = currentPlan[`${dayId}-breakfast-person2`];
        if (p1 && p2 && p1 !== p2) return `Ona: ${p1} | On: ${p2}`;
        if (p1) return p1;
        if (p2) return p2;
        return 'Zajrzyj do planu posiłków';
    }

    // Uruchom schedule przy starcie jeśli włączone
    function initNotifications() {
        if (localStorage.getItem(NOTIF_KEY) === 'true' && Notification.permission === 'granted') {
            scheduleNotifications();
        }
        // Nasłuchuj prośby o reschedule od service workera (po 24h)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data && event.data.type === 'RESCHEDULE_NOTIF') {
                    if (localStorage.getItem(NOTIF_KEY) === 'true' && Notification.permission === 'granted') {
                        scheduleNotifications();
                    }
                }
            });
        }
    }
