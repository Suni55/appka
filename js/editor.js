// ─── EDYTOR PRZEPISÓW ───────────────────────────────────────
    const CUSTOM_RECIPES_KEY = 'customRecipes';

    function loadCustomRecipes() {
        try { return JSON.parse(localStorage.getItem(CUSTOM_RECIPES_KEY) || '[]'); } catch(e) { return []; }
    }
    function saveCustomRecipes(arr) {
        localStorage.setItem(CUSTOM_RECIPES_KEY, JSON.stringify(arr));
    }

    // Stan edytora
    let editorRecipe = null; // null = nowy, string = edycja istniejącego

    function openEditorNew() {
        editorRecipe = null;
        renderEditorForm({
            name: '', isObiad: false,
            kcal: '', b: '', w: '', t: '',
            skladniki: [{ skladnik:'', ilosc:'', jednostka:'g' }],
            kroki: ['']
        });
        document.getElementById('editor-title').textContent = '✨ Nowy przepis';
        document.getElementById('editor-overlay').classList.add('active');
    }

    function openEditorEdit(name) {
        editorRecipe = name;
        const ings   = (PRZEPISY_DATA.skladniki[name] || []).map(i => ({...i, ilosc: String(i.ilosc)}));
        const steps  = PRZEPISY_DATA.instrukcje[name] || [];
        const macro  = NUTRITION_DATA[name] || {};
        const isObiad = OBIADY_LIST.includes(name);
        renderEditorForm({
            name,
            isObiad,
            kcal: macro.kcal != null ? String(macro.kcal) : '',
            b:    macro.b   != null ? String(macro.b)    : '',
            w:    macro.w   != null ? String(macro.w)    : '',
            t:    macro.t   != null ? String(macro.t)    : '',
            skladniki: ings.length ? ings : [{ skladnik:'', ilosc:'', jednostka:'g' }],
            kroki: steps.length ? steps.map(s => s.replace(/^\d+\.\s*/,'')) : ['']
        });
        document.getElementById('editor-title').textContent = '✏️ Edytuj przepis';
        document.getElementById('editor-overlay').classList.add('active');
    }

    function closeEditor() {
        document.getElementById('editor-overlay').classList.remove('active');
    }

    function renderEditorForm(data) {
        const body   = document.getElementById('editor-body');
        const footer = document.getElementById('editor-footer');

        // Składniki HTML
        const ingsHtml = data.skladniki.map((ing, i) => `
            <div class="ing-row" id="ing-row-${i}">
                <input class="editor-input small" placeholder="Składnik" value="${ing.skladnik||''}"
                    id="ing-name-${i}" oninput="editorUpdate()">
                <input class="editor-input small" placeholder="Ilość" type="number" value="${ing.ilosc||''}"
                    id="ing-amt-${i}" oninput="editorUpdate()">
                <input class="editor-input small" placeholder="g/ml/szt" value="${ing.jednostka||'g'}"
                    id="ing-unit-${i}" oninput="editorUpdate()">
                <button class="editor-del-btn" onclick="editorRemoveIng(${i})">🗑</button>
            </div>`).join('');

        // Kroki HTML
        const stepsHtml = data.kroki.map((step, i) => `
            <div class="step-row" id="step-row-${i}">
                <div class="step-num">${i+1}.</div>
                <textarea class="editor-input small" rows="2" placeholder="Opis kroku..."
                    id="step-${i}" oninput="editorUpdate()" style="resize:none;">${step||''}</textarea>
                <button class="editor-del-btn" onclick="editorRemoveStep(${i})">🗑</button>
            </div>`).join('');

        body.innerHTML = `
            <div class="editor-field">
                <div class="editor-label">Nazwa przepisu *</div>
                <input class="editor-input" id="ed-name" placeholder="np. Owsianka z bananem"
                    value="${(data.name||'').replace(/"/g,'&quot;')}" oninput="editorUpdate()">
            </div>
            <div class="editor-field">
                <div class="editor-label">Typ posiłku</div>
                <div class="editor-toggle-row">
                    <button class="editor-toggle-btn ${!data.isObiad?'active':''}"
                        onclick="editorSetType(false)">🌅 Śniadanie / Kolacja</button>
                    <button class="editor-toggle-btn ${data.isObiad?'active':''}"
                        onclick="editorSetType(true)">🍽️ Obiad</button>
                </div>
            </div>
            <div class="editor-field">
                <div class="editor-label">Makroskładniki (na 1 porcję)</div>
                <div class="editor-macro-grid">
                    <div>
                        <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">kcal</div>
                        <input class="editor-input small" type="number" id="ed-kcal"
                            placeholder="0" value="${data.kcal||''}" oninput="editorUpdate()">
                    </div>
                    <div>
                        <div style="font-size:11px;font-weight:600;color:#4fc3f7;margin-bottom:4px;">Białko g</div>
                        <input class="editor-input small" type="number" id="ed-b"
                            placeholder="0" value="${data.b||''}" oninput="editorUpdate()">
                    </div>
                    <div>
                        <div style="font-size:11px;font-weight:600;color:#81c784;margin-bottom:4px;">Węgle g</div>
                        <input class="editor-input small" type="number" id="ed-w"
                            placeholder="0" value="${data.w||''}" oninput="editorUpdate()">
                    </div>
                    <div>
                        <div style="font-size:11px;font-weight:600;color:#ffb74d;margin-bottom:4px;">Tłuszcz g</div>
                        <input class="editor-input small" type="number" id="ed-t"
                            placeholder="0" value="${data.t||''}" oninput="editorUpdate()">
                    </div>
                </div>
            </div>
            <div class="editor-field">
                <div class="editor-label">Składniki</div>
                <div id="ing-list">${ingsHtml}</div>
                <button class="editor-add-btn" onclick="editorAddIng()">+ Dodaj składnik</button>
            </div>
            <div class="editor-field">
                <div class="editor-label">Instrukcja</div>
                <div id="step-list">${stepsHtml}</div>
                <button class="editor-add-btn" onclick="editorAddStep()">+ Dodaj krok</button>
            </div>`;

        // Footer z przyciskami
        const isEdit = editorRecipe !== null;
        footer.innerHTML = `
            ${isEdit ? `<button class="editor-delete-btn" onclick="editorDelete()">🗑️</button>` : ''}
            <button class="editor-save-btn" onclick="editorSave()">
                ${isEdit ? '💾 Zapisz zmiany' : '✨ Dodaj przepis'}
            </button>`;

        // Zachowaj dane w edytorze
        window._editorData = data;
    }

    // Pomocnicze — odczytaj aktualny stan formularza
    function editorReadForm() {
        const d = window._editorData || {};
        const ings = (d.skladniki || []).map((_, i) => ({
            skladnik: (document.getElementById('ing-name-'+i)?.value || '').trim(),
            ilosc:    parseFloat(document.getElementById('ing-amt-'+i)?.value) || 0,
            jednostka:(document.getElementById('ing-unit-'+i)?.value || 'g').trim()
        })).filter(i => i.skladnik);

        const kroki = (d.kroki || []).map((_, i) =>
            (document.getElementById('step-'+i)?.value || '').trim()
        ).filter(s => s);

        return {
            name:     (document.getElementById('ed-name')?.value || '').trim(),
            isObiad:  d.isObiad || false,
            kcal:     parseFloat(document.getElementById('ed-kcal')?.value) || 0,
            b:        parseFloat(document.getElementById('ed-b')?.value)    || 0,
            w:        parseFloat(document.getElementById('ed-w')?.value)    || 0,
            t:        parseFloat(document.getElementById('ed-t')?.value)    || 0,
            skladniki: ings,
            kroki
        };
    }

    function editorUpdate() {
        // Synchronizuj dane do _editorData bez re-renderu (zachowaj focus)
        if (window._editorData) {
            window._editorData.kcal = document.getElementById('ed-kcal')?.value || '';
        }
    }

    function editorSetType(isObiad) {
        if (window._editorData) window._editorData.isObiad = isObiad;
        document.querySelectorAll('.editor-toggle-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === (isObiad ? 1 : 0));
        });
    }

    function editorAddIng() {
        const d = editorReadForm();
        d.skladniki.push({ skladnik:'', ilosc:'', jednostka:'g' });
        window._editorData = {...window._editorData, ...d};
        renderEditorForm(window._editorData);
        // Focus na nowy składnik
        setTimeout(() => {
            const last = d.skladniki.length - 1;
            document.getElementById('ing-name-'+last)?.focus();
        }, 50);
    }

    function editorRemoveIng(idx) {
        const d = editorReadForm();
        d.skladniki.splice(idx, 1);
        if (!d.skladniki.length) d.skladniki.push({ skladnik:'', ilosc:'', jednostka:'g' });
        window._editorData = {...window._editorData, ...d};
        renderEditorForm(window._editorData);
    }

    function editorAddStep() {
        const d = editorReadForm();
        d.kroki.push('');
        window._editorData = {...window._editorData, ...d};
        renderEditorForm(window._editorData);
        setTimeout(() => {
            document.getElementById('step-'+(d.kroki.length-1))?.focus();
        }, 50);
    }

    function editorRemoveStep(idx) {
        const d = editorReadForm();
        d.kroki.splice(idx, 1);
        if (!d.kroki.length) d.kroki.push('');
        window._editorData = {...window._editorData, ...d};
        renderEditorForm(window._editorData);
    }

    function editorSave() {
        const d = editorReadForm();
        if (!d.name) { showToast('❌ Wpisz nazwę przepisu'); return; }

        const oldName = editorRecipe;

        // Jeśli zmieniono nazwę przy edycji, usuń stary wpis
        if (oldName && oldName !== d.name) {
            // Usuń stare dane
            delete PRZEPISY_DATA.skladniki[oldName];
            delete PRZEPISY_DATA.instrukcje[oldName];
            delete NUTRITION_DATA[oldName];
            PRZEPISY_DATA.przepisy = PRZEPISY_DATA.przepisy.filter(p => p !== oldName);
            OBIADY_LIST.splice(OBIADY_LIST.indexOf(oldName), 1);
        }

        // Zapisz nowe dane do runtime objects
        if (!PRZEPISY_DATA.przepisy.includes(d.name)) {
            PRZEPISY_DATA.przepisy.push(d.name);
            PRZEPISY_DATA.przepisy.sort((a,b) => a.localeCompare(b,'pl'));
        }
        PRZEPISY_DATA.skladniki[d.name] = d.skladniki;
        PRZEPISY_DATA.instrukcje[d.name] = d.kroki.map((k,i) => `${i+1}. ${k}`);
        NUTRITION_DATA[d.name] = { kcal: d.kcal, b: d.b, w: d.w, t: d.t };

        // OBIADY_LIST
        const obiadIdx = OBIADY_LIST.indexOf(d.name);
        if (d.isObiad && obiadIdx === -1) OBIADY_LIST.push(d.name);
        if (!d.isObiad && obiadIdx !== -1) OBIADY_LIST.splice(obiadIdx, 1);

        // Zapisz do localStorage (custom recipes)
        const customs = loadCustomRecipes().filter(r => r.name !== d.name && r.name !== oldName);
        customs.push({ ...d, addedAt: Date.now() });
        saveCustomRecipes(customs);

        closeEditor();
        renderRecipes();
        showToast(oldName ? '✅ Przepis zaktualizowany!' : '✅ Przepis dodany!');
    }

    function editorDelete() {
        const name = editorRecipe;
        if (!name) return;
        if (!confirm(`Usunąć przepis "${name}"?`)) return;

        // Usuń z runtime
        delete PRZEPISY_DATA.skladniki[name];
        delete PRZEPISY_DATA.instrukcje[name];
        delete NUTRITION_DATA[name];
        PRZEPISY_DATA.przepisy = PRZEPISY_DATA.przepisy.filter(p => p !== name);
        const obiadIdx = OBIADY_LIST.indexOf(name);
        if (obiadIdx !== -1) OBIADY_LIST.splice(obiadIdx, 1);

        // Zapisz do listy usuniętych (persistent)
        const deleted = loadDeletedRecipes();
        if (!deleted.includes(name)) deleted.push(name);
        saveDeletedRecipes(deleted);

        // Usuń też z custom jeśli był tam
        const customs = loadCustomRecipes().filter(r => r.name !== name);
        saveCustomRecipes(customs);

        // Usuń z planu jeśli był użyty
        let planChanged = false;
        Object.keys(currentPlan).forEach(k => {
            if (currentPlan[k] === name) { delete currentPlan[k]; planChanged = true; }
        });
        if (planChanged) savePlan(currentPlan);

        closeEditor();
        renderRecipes();
        showToast('🗑️ Przepis usunięty');
    }

    const DELETED_RECIPES_KEY = 'deletedRecipes';
    function loadDeletedRecipes() {
        try { return JSON.parse(localStorage.getItem(DELETED_RECIPES_KEY) || '[]'); } catch(e) { return []; }
    }
    function saveDeletedRecipes(arr) {
        localStorage.setItem(DELETED_RECIPES_KEY, JSON.stringify(arr));
    }

    function restoreCustomRecipes() {
        // 1. Usuń przepisy oznaczone jako skasowane
        const deleted = loadDeletedRecipes();
        deleted.forEach(name => {
            delete PRZEPISY_DATA.skladniki[name];
            delete PRZEPISY_DATA.instrukcje[name];
            delete NUTRITION_DATA[name];
            PRZEPISY_DATA.przepisy = PRZEPISY_DATA.przepisy.filter(p => p !== name);
            const idx = OBIADY_LIST.indexOf(name);
            if (idx !== -1) OBIADY_LIST.splice(idx, 1);
        });

        // 2. Dodaj/nadpisz przepisami własnymi
        const customs = loadCustomRecipes();
        customs.forEach(d => {
            if (!d.name) return;
            if (!PRZEPISY_DATA.przepisy.includes(d.name)) PRZEPISY_DATA.przepisy.push(d.name);
            PRZEPISY_DATA.skladniki[d.name] = d.skladniki || [];
            PRZEPISY_DATA.instrukcje[d.name] = (d.kroki || []).map((k,i) => `${i+1}. ${k}`);
            NUTRITION_DATA[d.name] = { kcal: d.kcal||0, b: d.b||0, w: d.w||0, t: d.t||0 };
            if (d.isObiad && !OBIADY_LIST.includes(d.name)) OBIADY_LIST.push(d.name);
            else if (!d.isObiad) {
                const idx = OBIADY_LIST.indexOf(d.name);
                if (idx !== -1) OBIADY_LIST.splice(idx, 1);
            }
        });

        if (customs.length || deleted.length) {
            PRZEPISY_DATA.przepisy.sort((a,b) => a.localeCompare(b,'pl'));
        }
    }
