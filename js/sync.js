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

    // ── Offline queue — przechowuje operacje gdy brak połączenia ──
    let syncQueue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
    function saveSyncQueue() { localStorage.setItem('syncQueue', JSON.stringify(syncQueue)); }

    // ── Retry helper — ponawia żądanie z wykładniczym backoff ────
    async function sbFetchWithRetry(path, opts = {}, attempts = SYNC_RETRY_ATTEMPTS) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await sbFetch(path, opts);
            } catch (err) {
                if (i === attempts - 1) throw err;
                await new Promise(r => setTimeout(r, SYNC_RETRY_DELAY * Math.pow(2, i)));
            }
        }
    }

    // ── Opróżnij kolejkę offline ─────────────────────────────────
    async function drainSyncQueue() {
        if (!syncPairId || !syncQueue.length) return;
        const todo = [...syncQueue];
        syncQueue = [];
        saveSyncQueue();
        for (const op of todo) {
            try {
                if (op.type === 'plan')    await pushPlanEntry(op.dayKey, op.mealId, op.person, op.recipe);
                if (op.type === 'checked') await pushCheckedItem(op.itemKey, op.checked);
            } catch (e) {
                syncQueue.push(op); // z powrotem do kolejki
                saveSyncQueue();
                console.warn('[Sync] Nie udało się opróżnić kolejki:', e);
                break; // nie próbuj reszty jeśli sieć nie działa
            }
        }
    }

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

        // Pull household members (non-blocking)
        pullHouseholdMembers().catch(e => console.warn('[Sync] household pull failed:', e));

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
                await sbFetchWithRetry('meal_plan', {
                    method: 'POST',
                    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                    body: JSON.stringify({
                        pair_id: syncPairId, day_key: dayKey,
                        meal_id: mealId, person, recipe,
                        updated_at: new Date().toISOString()
                    })
                });
            } else {
                await sbFetchWithRetry('meal_plan?pair_id=eq.' + syncPairId +
                    '&day_key=eq.' + encodeURIComponent(dayKey) +
                    '&meal_id=eq.' + encodeURIComponent(mealId) +
                    '&person=eq.' + encodeURIComponent(person), {
                    method: 'DELETE', headers: { 'Prefer': '' }
                });
            }
        } catch(e) {
            console.warn('[Sync] pushPlan failed, dodaję do kolejki offline:', e);
            syncQueue.push({ type:'plan', dayKey, mealId, person, recipe });
            saveSyncQueue();
        }
    }

    // ── Push: household member ─────────────────────────────────────
    async function pushHouseholdMember(member) {
        if (!syncPairId) return;
        try {
            await sbFetchWithRetry('household_members', {
                method: 'POST',
                headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify({
                    pair_id: syncPairId,
                    member_id: member.id,
                    name: member.name,
                    emoji: member.emoji || '',
                    kcal_limit: member.kcalLimit || 2000,
                    updated_at: new Date().toISOString()
                })
            });
        } catch(e) {
            console.warn('[Sync] pushHouseholdMember failed:', e);
        }
    }

    async function pullHouseholdMembers() {
        if (!syncPairId) return;
        try {
            const rows = await sbFetch('household_members?pair_id=eq.' + syncPairId + '&select=member_id,name,emoji,kcal_limit');
            if (rows && rows.length > 0) {
                const household = rows.map(r => ({
                    id: r.member_id,
                    name: r.name,
                    emoji: r.emoji || '',
                    kcalLimit: r.kcal_limit || 2000
                }));
                saveHousehold(household);
            }
        } catch(e) {
            console.warn('[Sync] pullHouseholdMembers failed:', e);
        }
    }

    // ── Push: zakupy ─────────────────────────────────────────────
    async function pushCheckedItem(itemKey, checked) {
        if (!syncPairId || isSyncing) return;
        // Enkoduj klucz do base64 żeby uniknąć znaków specjalnych (|, spacje itp.)
        const safeKey = btoa(unescape(encodeURIComponent(itemKey)));
        try {
            if (checked) {
                await sbFetchWithRetry('shopping_checked', {
                    method: 'POST',
                    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                    body: JSON.stringify({
                        pair_id: syncPairId, item_key: safeKey,
                        checked: true, updated_at: new Date().toISOString()
                    })
                });
            } else {
                await sbFetchWithRetry('shopping_checked?pair_id=eq.' + syncPairId +
                    '&item_key=eq.' + encodeURIComponent(safeKey), {
                    method: 'DELETE', headers: { 'Prefer': '' }
                });
            }
        } catch(e) {
            console.warn('[Sync] pushChecked failed, dodaję do kolejki offline:', e);
            syncQueue.push({ type:'checked', itemKey, checked });
            saveSyncQueue();
        }
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
                event: '*', schema: 'public', table: 'household_members',
                filter: 'pair_id=eq.' + syncPairId
            }, (payload) => {
                // Odśwież household z serwera
                pullHouseholdMembers().then(() => renderAll()).catch(() => {});
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
            // Wyślij operacje z kolejki offline po odzyskaniu połączenia
            await drainSyncQueue();
        } catch(e) {
            console.error('[Sync] initSync error:', e);
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

            // Wypchnij household members do Supabase
            for (const member of getHousehold()) {
                await pushHouseholdMember(member);
            }
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

        // Sekcja edycji profili osób
        const household = getHousehold();
        const householdHTML = `
            <div style="margin-bottom:20px;">
                <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:10px;">👥 Profile osób</div>
                ${household.map(m => `
                    <div class="household-member-card" id="hm-${m.id}">
                        <div class="household-member-row">
                            <input type="text" class="household-emoji-input" value="${m.emoji}" id="hm-emoji-${m.id}"
                                maxlength="4" title="Emoji">
                            <input type="text" class="household-name-input" value="${sanitize(m.name)}" id="hm-name-${m.id}"
                                placeholder="Imię" maxlength="20">
                        </div>
                        <div class="household-member-row" style="margin-bottom:0;">
                            <div class="household-kcal-wrap" style="flex:1;">
                                <span class="household-kcal-label" style="margin-right:6px;">Limit:</span>
                                <input type="number" class="household-kcal-input" value="${m.kcalLimit}" id="hm-kcal-${m.id}"
                                    min="800" max="5000" step="50" title="Limit kcal">
                                <span class="household-kcal-label">kcal</span>
                            </div>
                            <button class="btn btn-secondary" style="padding:8px 14px;font-size:13px;" onclick="saveHouseholdMember('${m.id}')">💾 Zapisz</button>
                        </div>
                    </div>
                `).join('')}
            </div>`;

        if (syncPairId) {
            el.innerHTML = householdHTML + `
                <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:10px;">☁️ Synchronizacja</div>
                <div class="sync-status-row">
                    <span class="sync-status-dot ${syncStatus}" id="sync-dot"></span>
                    <span id="sync-txt">${{connected:'Połączono ✓',connecting:'Łączenie...',offline:'Offline',error:'Błąd'}[syncStatus]||syncStatus}</span>
                </div>
                <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">PIN Twojej pary:</div>
                <div class="sync-pin-display">${syncPin||'------'}</div>
                <button class="sync-btn secondary" style="width:100%;margin-top:12px;" onclick="syncDisconnect()">🔌 Odłącz</button>`;
        } else {
            el.innerHTML = householdHTML + `
                <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:10px;">☁️ Synchronizacja</div>
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

    function saveHouseholdMember(id) {
        const name = document.getElementById('hm-name-' + id)?.value.trim();
        const emoji = document.getElementById('hm-emoji-' + id)?.value.trim();
        const kcalLimit = parseInt(document.getElementById('hm-kcal-' + id)?.value) || 2000;
        if (!name) { showToast('❌ Imię nie może być puste'); return; }
        updateMember(id, { name, emoji, kcalLimit: Math.max(800, Math.min(5000, kcalLimit)) });
        showToast(`✅ Zapisano profil: ${emoji} ${name}`);
        // Odśwież widoki
        renderAll();
    }

    // ── renderAll ─────────────────────────────────────────────────
    function renderAll() {
        renderCalendar();
        if (selectedDate) renderDayPanel(selectedDate);
        renderToday();
        updateShoppingList();
        renderStats();
    }
