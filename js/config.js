// ─── STAŁE KONFIGURACYJNE ──────────────────────────────────
    const APP_VERSION = '2.0';
    const KCAL_LOW     = 500;   // Próg "nisko-kaloryczne" (kcal)
    const KCAL_HIGH    = 700;   // Próg "wysoko-kaloryczne" (kcal)
    const DEBOUNCE_DELAY      = 150;  // ms — opóźnienie dla listy zakupów
    const SYNC_RETRY_ATTEMPTS = 3;    // ile razy ponawiamy nieudany push
    const SYNC_RETRY_DELAY    = 800;  // ms — bazowe opóźnienie retry (podwaja się)

    // ─── BEZPIECZEŃSTWO: sanitizacja HTML ─────────────────────
    function sanitize(str) {
        if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
        // Fallback — escape podstawowych znaków HTML
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ─── DEBOUNCE ──────────────────────────────────────────────
    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    const DAYS = [
        {id:'mon',name:'Poniedziałek'},{id:'tue',name:'Wtorek'},{id:'wed',name:'Środa'},
        {id:'thu',name:'Czwartek'},{id:'fri',name:'Piątek'},{id:'sat',name:'Sobota'},{id:'sun',name:'Niedziela'}
    ];
    const MEALS = [
        {id:'breakfast',name:'Śniadanie'},{id:'lunch',name:'Obiad'},{id:'dinner',name:'Kolacja'}
    ];
    const UNIT_CONVERSIONS = {
        'banan': {grams:120,unit:'szt'}, 'jabłko': {grams:150,unit:'szt'}, 'gruszka': {grams:130,unit:'szt'},
        'papryka czerwona': {grams:170,unit:'szt'}, 'ogórek świeży': {grams:150,unit:'szt'},
        'cebula': {grams:80,unit:'szt'}, 'pomidor': {grams:160,unit:'szt'}, 'cukinia': {grams:200,unit:'szt'},
        'ser twarogowy': {grams:275,unit:'opak.'}, 'serek wiejski bez laktozy': {grams:200,unit:'opak.'},
        'jogurt skyr bez laktozy': {grams:140,unit:'opak.'}, 'tuńczyk w sosie własnym': {grams:120,unit:'opak.'},
        'tofu naturalne': {grams:180,unit:'opak.'}, 'tofu wędzone': {grams:180,unit:'opak.'}
    };

    // ─── STORAGE ───────────────────────────────────────────────
    const DATA_VERSION = '2';
    if (localStorage.getItem('dataVersion') !== DATA_VERSION) {
        // Nowa wersja danych - wyczyść stary plan i przeliczenia
        localStorage.removeItem('mealPlan');
        localStorage.removeItem('checkedItems');
        localStorage.removeItem('ownedAmounts');
        localStorage.removeItem('previousWeekPlan');
        localStorage.setItem('dataVersion', DATA_VERSION);
    }

    let currentPlan    = JSON.parse(localStorage.getItem('mealPlan')      || '{}');
    let checkedItems   = JSON.parse(localStorage.getItem('checkedItems')   || '[]');
    let ownedAmounts   = JSON.parse(localStorage.getItem('ownedAmounts')   || '{}');
    let customProducts = JSON.parse(localStorage.getItem('customProducts') || '[]');
    let recipeHistory  = JSON.parse(localStorage.getItem('recipeHistory')  || '{}');
    let favorites      = JSON.parse(localStorage.getItem('favorites')      || '[]');
    // recipeHistory: { recipeName: lastUsedTimestamp }

    function savePlan(plan, changedKey) {
        localStorage.setItem('mealPlan', JSON.stringify(plan));
        updateRecipeHistory(plan);
        updateShoppingList();
        // Sync do Supabase
        if (!isSyncing && syncPairId && changedKey) {
            const parts = changedKey.split('-');
            const person = parts.pop();
            const mealId = parts.pop();
            const dayKey = parts.join('-');
            pushPlanEntry(dayKey, mealId, person, plan[changedKey] || null);
        }
    }
    function saveCheckedItems(arr, changedKey, checked) {
        localStorage.setItem('checkedItems', JSON.stringify(arr));
        // Sync do Supabase
        if (!isSyncing && syncPairId && changedKey !== undefined) {
            pushCheckedItem(changedKey, checked);
        }
    }
    function saveOwnedAmounts(obj)   { localStorage.setItem('ownedAmounts',   JSON.stringify(obj)); }
    function saveCustomProducts(arr) { localStorage.setItem('customProducts', JSON.stringify(arr)); }
    function saveRecipeHistory(obj)  { localStorage.setItem('recipeHistory',  JSON.stringify(obj)); }
    function saveFavorites(arr)      { localStorage.setItem('favorites',      JSON.stringify(arr)); }

    // Aktualizuj historię gdy plan się zmienia
    function updateRecipeHistory(plan) {
        const now = Date.now();
        Object.values(plan).forEach(name => {
            if (name) recipeHistory[name] = now;
        });
        saveRecipeHistory(recipeHistory);
    }

    // ─── SUGESTIE PRZEPISÓW ────────────────────────────────────
    let currentSuggestions = [];

    function getSuggestions() {
        const now = Date.now();
        const DAY_MS = 86400000;
        const usedInPlan = new Set(Object.values(currentPlan).filter(Boolean));

        // Kategorie przepisów
        const neverUsed   = [];  // Nigdy nie użyte
        const longAgo     = [];  // Nie używane > 14 dni

        PRZEPISY_DATA.przepisy.forEach(name => {
            if (usedInPlan.has(name)) return; // Pomijaj już zaplanowane
            const lastUsed = recipeHistory[name];
            if (!lastUsed) {
                neverUsed.push(name);
            } else {
                const daysAgo = Math.floor((now - lastUsed) / DAY_MS);
                if (daysAgo >= 14) longAgo.push({ name, daysAgo });
            }
        });

        // Posortuj longAgo od najdawniejszego
        longAgo.sort((a, b) => b.daysAgo - a.daysAgo);

        const suggestions = [];

        // Dodaj 2 dawno nieużywane (jeśli są)
        longAgo.slice(0, 2).forEach(r => {
            suggestions.push({ name: r.name, type: 'long', daysAgo: r.daysAgo });
        });

        // Uzupełnij nigdy nieużywanymi
        const shuffledNever = neverUsed.sort(() => Math.random() - 0.5);
        shuffledNever.slice(0, Math.max(0, 4 - suggestions.length)).forEach(name => {
            suggestions.push({ name, type: 'never' });
        });

        // Jeśli nadal mało - losowe z puli
        if (suggestions.length < 4) {
            const others = PRZEPISY_DATA.przepisy
                .filter(n => !usedInPlan.has(n) && !suggestions.find(s => s.name === n))
                .sort(() => Math.random() - 0.5);
            others.slice(0, 4 - suggestions.length).forEach(name => {
                const lastUsed = recipeHistory[name];
                const daysAgo = lastUsed ? Math.floor((now - lastUsed) / DAY_MS) : null;
                suggestions.push({ name, type: 'random', daysAgo });
            });
        }

        return suggestions.slice(0, 4);
    }

    function refreshSuggestions() {
        currentSuggestions = getSuggestions();
        renderSuggestionsSection();
    }

    function renderSuggestionsSection() {
        const el = document.getElementById('suggestions-container');
        if (!el || !currentSuggestions.length) return;

        const badgeMap = {
            long:   { cls: 'badge-long',   icon: '⏰', label: s => `${s.daysAgo} dni temu` },
            never:  { cls: 'badge-never',  icon: '✨', label: () => 'Nigdy nie używany' },
            random: { cls: 'badge-random', icon: '🎲', label: s => s.daysAgo ? `${s.daysAgo} dni temu` : 'Wypróbuj!' }
        };

        el.innerHTML = `
            <div class="suggestions-section">
                <div class="suggestions-title">
                    💡 Zapomniane przepisy
                    <button class="suggestions-refresh" onclick="refreshSuggestions()">↻ Odśwież</button>
                </div>
                <div class="suggestions-grid">
                    ${currentSuggestions.map(s => {
                        const b = badgeMap[s.type];
                        return `<div class="suggestion-card" onclick="goToRecipe('${s.name.replace(/'/g, "\\'")}')">
                            <div class="suggestion-badge ${b.cls}">${b.icon} ${b.label(s)}</div>
                            <div class="suggestion-name">${s.name}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    // ─── WŁASNE PRODUKTY ───────────────────────────────────────
    function addCustomProduct() {
        const inp = document.getElementById('custom-product-input');
        const name = inp.value.trim();
        if (!name) return;
        customProducts.push({ id: Date.now(), name, checked: false });
        saveCustomProducts(customProducts);
        inp.value = '';
        inp.focus();
        updateShoppingList();
    }

    function toggleCustomProduct(id) {
        const p = customProducts.find(p => p.id === id);
        if (p) { p.checked = !p.checked; saveCustomProducts(customProducts); updateShoppingList(); }
    }

    function deleteCustomProduct(id) {
        customProducts = customProducts.filter(p => p.id !== id);
        saveCustomProducts(customProducts);
        updateShoppingList();
    }

    // ─── DARK MODE ─────────────────────────────────────────────
    function initDarkMode() {
        const saved = localStorage.getItem('darkMode');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = saved !== null ? saved === 'true' : prefersDark;
        if (isDark) applyDark(true, false);
    }
    function applyDark(on, save = true) {
        document.body.classList.toggle('dark', on);
        document.getElementById('dark-btn').textContent = on ? '☀️' : '🌙';
        if (save) localStorage.setItem('darkMode', on);
    }
    function toggleDarkMode() {
        const isDark = document.body.classList.contains('dark');
        applyDark(!isDark);
    }

    // ─── NAWIGACJA TYGODNIA ────────────────────────────────────
    // ─── KALENDARZ - pasek tygodnia ─────────────────────────────
    let calWeekOffset = 0; // 0 = bieżący tydzień, +1/-1 = następny/poprzedni
    let selectedDate = null; // 'YYYY-MM-DD'

    function dateKey(y, m, d) {
        return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }

    function todayKey() {
        const n = new Date();
        return dateKey(n.getFullYear(), n.getMonth(), n.getDate());
    }

    function getWeekDays(offset) {
        // Zwróć tablicę 7 dat (Pn-Nd) dla danego tygodnia
        const now = new Date();
        const dow = now.getDay(); // 0=nd, 1=pn...
        const monday = new Date(now);
        monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
        monday.setHours(0,0,0,0);
        return Array.from({length:7}, (_, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            return d;
        });
    }

    function calPrevWeek() { calWeekOffset--; renderCalendar(); }
    function calNextWeek() { calWeekOffset++; renderCalendar(); }
    function calGoToday()  { calWeekOffset = 0; selectedDate = todayKey(); renderCalendar(); }

    function renderCalendar() {
        const strip = document.getElementById('cal-strip');
        const label = document.getElementById('cal-week-label');
        if (!strip) return;

        const days  = getWeekDays(calWeekOffset);
        const today = todayKey();
        const dows  = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];
        const months = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

        // Etykieta tygodnia
        if (label) {
            const first = days[0], last = days[6];
            if (first.getMonth() === last.getMonth()) {
                label.textContent = `${first.getDate()}–${last.getDate()} ${months[first.getMonth()]} ${first.getFullYear()}`;
            } else {
                label.textContent = `${first.getDate()} ${months[first.getMonth()]} – ${last.getDate()} ${months[last.getMonth()]}`;
            }
        }

        strip.innerHTML = days.map((d, i) => {
            const k = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
            const isToday    = k === today;
            const isSelected = k === selectedDate;
            const hasMeals   = Object.keys(currentPlan).some(key => key.startsWith(k + '-'));
            const numCls = ['cal-strip-num',
                isToday    ? 'today'    : '',
                isSelected ? 'selected' : '',
                hasMeals   ? 'has-meals': '',
            ].filter(Boolean).join(' ');
            return `<div class="cal-strip-day ${isSelected ? 'selected-day' : ''}" onclick="selectDay('${k}')">
                <div class="cal-strip-dow">${dows[i]}</div>
                <div class="${numCls}">${d.getDate()}</div>
            </div>`;
        }).join('');

        // Scroll do wybranego dnia
        if (selectedDate) {
            setTimeout(() => {
                const sel = strip.querySelector('.selected-day');
                if (sel) sel.scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'});
            }, 50);
        }

        // Renderuj panel dnia
        if (selectedDate) {
            renderDayPanel(selectedDate);
        } else {
            // Domyślnie zaznacz dzisiaj
            selectedDate = today;
            renderCalendar();
        }
    }

    function selectDay(k) {
        selectedDate = k;
        // Jeśli wybrany dzień jest poza aktualnym tygodniem, przeskocz do właściwego
        const days = getWeekDays(calWeekOffset);
        const keys = days.map(d => dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
        if (!keys.includes(k)) {
            // Oblicz offset tygodnia dla wybranej daty
            const selDate = new Date(k + 'T00:00:00');
            const today = new Date();
            const todayMon = new Date(today);
            const dow = today.getDay();
            todayMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
            todayMon.setHours(0,0,0,0);
            const selMon = new Date(selDate);
            const selDow = selDate.getDay();
            selMon.setDate(selDate.getDate() - (selDow === 0 ? 6 : selDow - 1));
            calWeekOffset = Math.round((selMon - todayMon) / (7 * 86400000));
        }
        renderCalendar();
    }

    // ─── PANEL MAKROSKŁADNIKÓW ─────────────────────────────────
    const KCAL_LIMITS = { person1: 1800, person2: 2000 };

    function calcPersonMacro(dayId, person) {
        const total = { kcal: 0, b: 0, w: 0, t: 0 };
        let count = 0;
        MEALS.forEach(meal => {
            const name = currentPlan[`${dayId}-${meal.id}-${person}`];
            if (name && NUTRITION_DATA[name]) {
                const n = NUTRITION_DATA[name];
                total.kcal += n.kcal;
                total.b += n.b;
                total.w += n.w;
                total.t += n.t;
                count++;
            }
        });
        return count > 0 ? {
            kcal: Math.round(total.kcal),
            b: Math.round(total.b * 10) / 10,
            w: Math.round(total.w * 10) / 10,
            t: Math.round(total.t * 10) / 10
        } : null;
    }

    function drawDonut(canvas, data, colors) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const size = 140;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        ctx.scale(dpr, dpr);
        const cx = size / 2, cy = size / 2, R = 62, r = 42;
        const total = data.reduce((a, d) => a + d, 0);
        if (!total) return;
        let angle = -Math.PI / 2;
        data.forEach((val, i) => {
            const sweep = (val / total) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx + R * Math.cos(angle), cy + R * Math.sin(angle));
            ctx.arc(cx, cy, R, angle, angle + sweep);
            ctx.arc(cx, cy, r, angle + sweep, angle, true);
            ctx.closePath();
            ctx.fillStyle = colors[i];
            ctx.fill();
            angle += sweep;
        });
        const bg = document.body.classList.contains('dark') ? '#252525' : '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();
    }

    function renderMacroPanelHTML(dayId) {
        const p1 = calcPersonMacro(dayId, 'person1');
        const p2 = calcPersonMacro(dayId, 'person2');
        if (!p1 && !p2) return '';
        const C = { b: '#2EC4B6', w: '#FF6B35', t: '#FFB347' };
        function card(macro, limit, label) {
            if (!macro) return `<div class="macro-person-card"><div class="macro-empty">Brak posiłków</div></div>`;
            const progress = Math.min(Math.round(macro.kcal / limit * 100), 100);
            const over = macro.kcal > limit;
            return `<div class="macro-person-card">
                <div class="macro-person-header"><div class="macro-person-name">${label}</div><div class="macro-person-limit">Limit: ${limit} kcal</div></div>
                <div style="text-align:center;font-size:26px;font-weight:700;color:var(--primary);margin:10px 0;">${macro.kcal} kcal</div>
                <div class="macro-progress-bar"><div class="macro-progress-fill ${over?'macro-progress-over':'macro-progress-ok'}" style="width:${progress}%"></div></div>
                <div class="macro-stats" style="margin-top:10px;">
                    <div class="macro-row"><div class="macro-dot" style="background:${C.b}"></div><div class="macro-row-label">Białko</div><div class="macro-row-val">${macro.b}g</div></div>
                    <div class="macro-row"><div class="macro-dot" style="background:${C.w}"></div><div class="macro-row-label">Węglowodany</div><div class="macro-row-val">${macro.w}g</div></div>
                    <div class="macro-row"><div class="macro-dot" style="background:${C.t}"></div><div class="macro-row-label">Tłuszcze</div><div class="macro-row-val">${macro.t}g</div></div>
                </div>
            </div>`;
        }
        return `<div class="macro-panel" style="margin-top:14px;">
            <div class="macro-panel-title">📊 Makroskładniki dnia</div>
            <div class="macro-people-grid">
                ${card(p1, 1800, '💁‍♀️ Ona')}
                ${card(p2, 2000, '💁‍♂️ On')}
            </div>
        </div>`;
    }

    function renderMacroPanel(dayId) {
        const el = document.getElementById('macro-panel-container');
        if (!el) return;

        const p1 = calcPersonMacro(dayId, 'person1');
        const p2 = calcPersonMacro(dayId, 'person2');

        if (!p1 && !p2) {
            el.innerHTML = '';
            return;
        }

        const C = { b: '#2EC4B6', w: '#FF6B35', t: '#FFB347' };

        function renderPersonCard(person, macro, limit, label) {
            if (!macro) return `<div class="macro-person-card"><div class="macro-empty">Brak posiłków</div></div>`;

            const bKcal = macro.b * 4, wKcal = macro.w * 4, tKcal = macro.t * 9;
            const tot = bKcal + wKcal + tKcal || 1;
            const bPct = Math.round(bKcal / tot * 100);
            const wPct = Math.round(wKcal / tot * 100);
            const tPct = 100 - bPct - wPct;
            const progress = Math.round(macro.kcal / limit * 100);
            const over = macro.kcal > limit;

            return `<div class="macro-person-card">
                <div class="macro-person-header">
                    <div class="macro-person-name">${label}</div>
                    <div class="macro-person-limit">Limit: ${limit} kcal</div>
                </div>
                <div class="macro-chart-wrap">
                    <canvas id="macro-donut-${person}" class="macro-canvas"></canvas>
                    <div class="macro-kcal-center">
                        <div class="macro-kcal-num">${macro.kcal}</div>
                        <div class="macro-kcal-label">kcal</div>
                        <div class="macro-kcal-limit">${progress}%</div>
                    </div>
                </div>
                <div class="macro-progress-bar">
                    <div class="macro-progress-fill ${over ? 'macro-progress-over' : 'macro-progress-ok'}" 
                         style="width:${Math.min(progress, 100)}%"></div>
                </div>
                <div class="macro-stats">
                    ${[
                        { l: 'Białko', v: macro.b, p: bPct, c: C.b },
                        { l: 'Węglowodany', v: macro.w, p: wPct, c: C.w },
                        { l: 'Tłuszcze', v: macro.t, p: tPct, c: C.t }
                    ].map(r => `<div>
                        <div class="macro-row">
                            <div class="macro-dot" style="background:${r.c}"></div>
                            <div class="macro-row-label">${r.l}</div>
                            <div class="macro-row-val">${r.v}g</div>
                            <span class="macro-row-pct">${r.p}%</span>
                        </div>
                        <div class="macro-bar-wrap">
                            <div class="macro-bar" style="width:${r.p}%;background:${r.c}"></div>
                        </div>
                    </div>`).join('')}
                </div>
            </div>`;
        }

        el.innerHTML = `
            <div class="macro-panel">
                <div class="macro-panel-title">📊 Makroskładniki dnia</div>
                <div class="macro-people-grid">
                    ${renderPersonCard('person1', p1, KCAL_LIMITS.person1, '💁‍♀️ Ona')}
                    ${renderPersonCard('person2', p2, KCAL_LIMITS.person2, '💁‍♂️ On')}
                </div>
            </div>`;

        requestAnimationFrame(() => {
            if (p1) {
                const cv1 = document.getElementById('macro-donut-person1');
                if (cv1) drawDonut(cv1, [p1.b * 4, p1.w * 4, p1.t * 9], [C.b, C.w, C.t]);
            }
            if (p2) {
                const cv2 = document.getElementById('macro-donut-person2');
                if (cv2) drawDonut(cv2, [p2.b * 4, p2.w * 4, p2.t * 9], [C.b, C.w, C.t]);
            }
        });
    }

    function switchTab(name) {
        document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', ['today','plan','shopping','recipes','settings'][i] === name));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById('tab-' + name).classList.add('active');
        if (name === 'shopping') { initShopDates(); updateShoppingList(); }
        if (name === 'recipes')  renderRecipes();
        if (name === 'today')    renderToday();
        if (name === 'plan')     { renderCalendar(); renderStats(); }
        if (name === 'settings') initSettingsTab();
    }
