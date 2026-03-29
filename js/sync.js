// ─── SUPABASE SYNC ──────────────────────────────────────────
    const SUPABASE_URL = 'https://djvgpvypjezefvhomsuv.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_s-sAY-ovunyck6LUuFwu0Q_YLLmx75M';
    const PAIR_KEY     = 'syncPairId';
    const PAIR_PIN_KEY = 'syncPin';

    let syncPairId      = localStorage.getItem(PAIR_KEY)    || null;
    let syncPin         = localStorage.getItem(PAIR_PIN_KEY) || null;
    let sbChannel       = null;
    let syncStatus      = 'offline';
    let isSyncing       = false;
    let sbClient        = null; // Supabase JS client

    // ── Init klienta Supabase JS SDK ─────────────────────────────
    function initSupabaseClient() {
        if (typeof supabase === 'undefined') return null;
        return supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    // ── REST helpers (fallback bez SDK) ──────────────────────────
    async function sbFetch(path, opts = {}) {
        const { headers: extraHeaders, ...restOpts } = opts;
        const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
            ...restOpts,
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json',
                ...(extraHeaders || {})
            }
        });
        if (!res.ok) throw new Error('Supabase ' + res.status + ': ' + await res.text());
        const txt = await res.text();
        return txt ? JSON.parse(txt) : null;
    }

    // ── PIN ───────────────────────────────────────────────────────
    function generatePin() { return Math.floor(100000 + Math.random() * 900000).toString(); }

    async function createPair(pin) {
        const data = await sbFetch('pairs', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify({ pin })
        });
        return Array.isArray(data) ? data[0].id : data.id;
    }

    async function findPair(pin) {
        const data = await sbFetch('pairs?pin=eq.' + encodeURIComponent(pin) + '&select=id');
        return data && data.length > 0 ? data[0].id : null;
    }

    // ── Pull: Supabase → localStorage ────────────────────────────
    async function pullAll() {
        const [planRows, checkedRows] = await Promise.all([
            sbFetch('meal_plan?pair_id=eq.' + syncPairId + '&select=day_key,meal_id,person,recipe'),
            sbFetch('shopping_checked?pair_id=eq.' + syncPairId + '&select=item_key,checked')
        ]);

        isSyncing = true;
        // Plan
        const remotePlan = {};
        (planRows || []).forEach(r => {
            remotePlan[r.day_key + '-' + r.meal_id + '-' + r.person] = r.recipe;
        });
        currentPlan = remotePlan;
        localStorage.setItem('mealPlan', JSON.stringify(currentPlan));

        // Zakupy - odkoduj base64 z powrotem do oryginalnych kluczy
        const remoteChecked = (checkedRows || [])
            .filter(r => r.checked)
            .map(r => {
                try { return decodeURIComponent(escape(atob(r.item_key))); }
                catch(e) { return r.item_key; } // fallback dla starych wpisów
            });
        checkedItems = remoteChecked;
        localStorage.setItem('checkedItems', JSON.stringify(checkedItems));
        isSyncing = false;

        renderAll();
    }

    // ── Push: plan ───────────────────────────────────────────────
    async function pushPlanEntry(dayKey, mealId, person, recipe) {
        if (!syncPairId || isSyncing) return;
        try {
            if (recipe) {
                await sbFetch('meal_plan', {
                    method: 'POST',
                    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                    body: JSON.stringify({
                        pair_id: syncPairId, day_key: dayKey,
                        meal_id: mealId, person, recipe,
                        updated_at: new Date().toISOString()
                    })
                });
            } else {
                await sbFetch('meal_plan?pair_id=eq.' + syncPairId +
                    '&day_key=eq.' + encodeURIComponent(dayKey) +
                    '&meal_id=eq.' + encodeURIComponent(mealId) +
                    '&person=eq.' + encodeURIComponent(person), {
                    method: 'DELETE', headers: { 'Prefer': '' }
                });
            }
        } catch(e) { console.error('pushPlan:', e); }
    }

    // ── Push: zakupy ─────────────────────────────────────────────
    async function pushCheckedItem(itemKey, checked) {
        if (!syncPairId || isSyncing) return;
        // Enkoduj klucz do base64 żeby uniknąć znaków specjalnych (|, spacje itp.)
        const safeKey = btoa(unescape(encodeURIComponent(itemKey)));
        try {
            if (checked) {
                await sbFetch('shopping_checked', {
                    method: 'POST',
                    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                    body: JSON.stringify({
                        pair_id: syncPairId, item_key: safeKey,
                        checked: true, updated_at: new Date().toISOString()
                    })
                });
            } else {
                await sbFetch('shopping_checked?pair_id=eq.' + syncPairId +
                    '&item_key=eq.' + encodeURIComponent(safeKey), {
                    method: 'DELETE', headers: { 'Prefer': '' }
                });
            }
        } catch(e) { console.error('pushChecked:', e); }
    }

    // ── Realtime przez Supabase JS SDK ───────────────────────────
    function subscribeRealtime() {
        if (!sbClient) { sbClient = initSupabaseClient(); }
        if (!sbClient) { console.warn('Supabase SDK niedostępny'); return; }
        if (sbChannel) { sbClient.removeChannel(sbChannel); sbChannel = null; }

        sbChannel = sbClient
            .channel('pair-' + syncPairId)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'meal_plan',
                filter: 'pair_id=eq.' + syncPairId
            }, (payload) => {
                if (isSyncing) return;
                isSyncing = true;
                const { eventType, new: rec, old: oldRec } = payload;
                const k = rec ? rec.day_key + '-' + rec.meal_id + '-' + rec.person
                               : oldRec.day_key + '-' + oldRec.meal_id + '-' + oldRec.person;
                if (eventType === 'DELETE') delete currentPlan[k];
                else currentPlan[k] = rec.recipe;
                localStorage.setItem('mealPlan', JSON.stringify(currentPlan));
                isSyncing = false;
                renderAll();
            })
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'shopping_checked',
                filter: 'pair_id=eq.' + syncPairId
            }, (payload) => {
                if (isSyncing) return;
                isSyncing = true;
                const { eventType, new: rec, old: oldRec } = payload;
                const rawKey = rec ? rec.item_key : oldRec.item_key;
                // Odkoduj base64
                let key;
                try { key = decodeURIComponent(escape(atob(rawKey))); }
                catch(e) { key = rawKey; }

                if (eventType === 'DELETE' || (rec && !rec.checked)) {
                    checkedItems = checkedItems.filter(i => i !== key);
                } else if (!checkedItems.includes(key)) {
                    checkedItems.push(key);
                }
                localStorage.setItem('checkedItems', JSON.stringify(checkedItems));
                isSyncing = false;
                updateShoppingList();
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setSyncStatus('connected');
                else if (status === 'CHANNEL_ERROR') setSyncStatus('error');
                else if (status === 'CLOSED') setSyncStatus('offline');
            });
    }

    // ── Status ───────────────────────────────────────────────────
    function setSyncStatus(status) {
        syncStatus = status;
        const dot = document.getElementById('sync-dot');
        const txt = document.getElementById('sync-txt');
        if (!dot || !txt) return;
        dot.className = 'sync-status-dot ' + status;
        const labels = { connected:'Połączono ✓', connecting:'Łączenie...', offline:'Offline', error:'Błąd połączenia' };
        txt.textContent = labels[status] || status;
    }

    // ── Inicjalizacja po starcie ──────────────────────────────────
    async function initSync() {
        if (!syncPairId) return;
        sbClient = initSupabaseClient();
        setSyncStatus('connecting');
        try {
            await pullAll();
            subscribeRealtime();
        } catch(e) {
            console.error('initSync error:', e);
            setSyncStatus('error');
        }
        renderSyncUI();
    }

    // ── Utwórz nową parę ─────────────────────────────────────────
    async function syncCreateNew() {
        const btn = document.getElementById('sync-create-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Tworzę...'; }
        try {
            const pin = generatePin();
            const pairId = await createPair(pin);
            syncPairId = pairId; syncPin = pin;
            localStorage.setItem(PAIR_KEY, pairId);
            localStorage.setItem(PAIR_PIN_KEY, pin);

            // Wypchnij aktualny plan do Supabase
            for (const [k, recipe] of Object.entries(currentPlan)) {
                if (!recipe) continue;
                const parts = k.split('-');
                const person = parts.pop(), mealId = parts.pop(), dayKey = parts.join('-');
                await pushPlanEntry(dayKey, mealId, person, recipe);
            }
            sbClient = initSupabaseClient();
            subscribeRealtime();
            setSyncStatus('connected');
            showToast('✅ Gotowe! Twój PIN: ' + pin);
        } catch(e) {
            showToast('❌ Błąd: ' + e.message);
            if (btn) { btn.disabled = false; btn.textContent = '✨ Utwórz parę i pobierz PIN'; }
        }
        renderSyncUI();
    }

    // ── Dołącz do istniejącej pary ───────────────────────────────
    async function syncJoinPair() {
        const input = document.getElementById('sync-pin-input');
        const pin = (input?.value || '').trim();
        if (pin.length !== 6 || !/^\d+$/.test(pin)) { showToast('❌ Wpisz 6-cyfrowy PIN'); return; }
        const btn = document.getElementById('sync-join-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Szukam...'; }
        try {
            const pairId = await findPair(pin);
            if (!pairId) { showToast('❌ Nie znaleziono pary'); renderSyncUI(); return; }
            syncPairId = pairId; syncPin = pin;
            localStorage.setItem(PAIR_KEY, pairId);
            localStorage.setItem(PAIR_PIN_KEY, pin);
            sbClient = initSupabaseClient();
            await pullAll();
            subscribeRealtime();
            setSyncStatus('connected');
            showToast('✅ Połączono! Plan pobrany.');
        } catch(e) {
            showToast('❌ Błąd: ' + e.message);
            if (btn) { btn.disabled = false; btn.textContent = '🔗 Połącz'; }
        }
        renderSyncUI();
    }

    // ── Rozłącz ──────────────────────────────────────────────────
    function syncDisconnect() {
        if (!confirm('Odłączyć synchronizację? Plan pozostanie lokalnie.')) return;
        if (sbChannel && sbClient) { sbClient.removeChannel(sbChannel); sbChannel = null; }
        syncPairId = null; syncPin = null;
        localStorage.removeItem(PAIR_KEY); localStorage.removeItem(PAIR_PIN_KEY);
        setSyncStatus('offline');
        renderSyncUI();
        showToast('Synchronizacja wyłączona');
    }

    // ── Render UI ─────────────────────────────────────────────────
    let syncTab = 'new';
    function renderSyncUI() {
        const el = document.getElementById('sync-ui');
        if (!el) return;
        if (syncPairId) {
            el.innerHTML = `
                <div class="sync-status-row">
                    <span class="sync-status-dot ${syncStatus}" id="sync-dot"></span>
                    <span id="sync-txt">${{connected:'Połączono ✓',connecting:'Łączenie...',offline:'Offline',error:'Błąd'}[syncStatus]||syncStatus}</span>
                </div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">PIN Twojej pary:</div>
                <div class="sync-pin-display">${syncPin||'------'}</div>
                <button class="sync-btn secondary" style="width:100%;margin-top:12px;" onclick="syncDisconnect()">🔌 Odłącz</button>`;
        } else {
            el.innerHTML = `
                <div class="sync-pair-mode">
                    <div class="sync-pair-tab ${syncTab==='new'?'active':''}" onclick="syncTab='new';renderSyncUI()">📱 Nowa para</div>
                    <div class="sync-pair-tab ${syncTab==='join'?'active':''}" onclick="syncTab='join';renderSyncUI()">🔗 Dołącz</div>
                </div>
                ${syncTab==='new' ? `
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Utwórz parę — dostaniesz PIN dla drugiego telefonu.</div>
                    <button id="sync-create-btn" class="sync-btn primary" style="width:100%;" onclick="syncCreateNew()">✨ Utwórz parę i pobierz PIN</button>
                ` : `
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Wpisz PIN z pierwszego telefonu.</div>
                    <input id="sync-pin-input" class="sync-pin-input" type="tel" maxlength="6" placeholder="000000" inputmode="numeric">
                    <button id="sync-join-btn" class="sync-btn primary" style="width:100%;margin-top:12px;" onclick="syncJoinPair()">🔗 Połącz</button>
                `}`;
        }
    }

    // ── renderAll ─────────────────────────────────────────────────
    function renderAll() {
        renderCalendar();
        if (selectedDate) renderDayPanel(selectedDate);
        renderToday();
        updateShoppingList();
        renderStats();
    }
