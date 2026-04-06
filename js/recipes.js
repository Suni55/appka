// ─── PRZEPISY ──────────────────────────────────────────────
    // ─── ULUBIONE ──────────────────────────────────────────────
    let showOnlyFavorites = false;

    function toggleFavorite(name, event) {
        event.stopPropagation();
        const idx = favorites.indexOf(name);
        if (idx > -1) favorites.splice(idx, 1);
        else favorites.push(name);
        saveFavorites(favorites);
        filterRecipes();
    }

    function toggleFavFilter() {
        showOnlyFavorites = !showOnlyFavorites;
        document.getElementById('fav-filter-btn').classList.toggle('active', showOnlyFavorites);
        filterRecipes();
    }

    // ─── MAKRO POMOCNIK ────────────────────────────────────────
    function macroPills(name) {
        const n = NUTRITION_DATA[name];
        if (!n) return '';
        return `<div class="meal-macro-row">
            <span class="meal-macro-pill pill-kcal">🔥 ${Math.round(n.kcal)} kcal</span>
            <span class="meal-macro-pill pill-b">B ${n.b}g</span>
            <span class="meal-macro-pill pill-w">W ${n.w}g</span>
            <span class="meal-macro-pill pill-t">T ${n.t}g</span>
        </div>`;
    }

    // ─── WYSZUKIWANIE ROZMYTE ──────────────────────────────────
    let searchMode = 'name'; // 'name' | 'ingredient'

    // Normalizacja — usuwa polskie znaki diakrytyczne i zamienia na lowercase
    function normalizeStr(str) {
        return String(str).toLowerCase()
            .replace(/ą/g,'a').replace(/ć/g,'c').replace(/ę/g,'e')
            .replace(/ł/g,'l').replace(/ń/g,'n').replace(/ó/g,'o')
            .replace(/ś/g,'s').replace(/ź/g,'z').replace(/ż/g,'z');
    }

    // Rozmyte dopasowanie — zwraca wynik 0–100 (0 = brak dopasowania)
    // Priorytet: dokładny podciąg > podciąg bez polskich znaków > kolejność znaków
    function fuzzyScore(query, target) {
        if (!query) return 100;
        const q = normalizeStr(query);
        const t = normalizeStr(target);

        // 1. Dokładne dopasowanie podciągu (najwyższy priorytet)
        const exactIdx = t.indexOf(q);
        if (exactIdx !== -1) return 100 - exactIdx * 0.5; // wcześniejsza pozycja = lepszy wynik

        // 2. Dopasowanie jako podciąg (subsequence) z punktacją
        let qi = 0, score = 0, consecutive = 0;
        for (let ti = 0; ti < t.length && qi < q.length; ti++) {
            if (t[ti] === q[qi]) {
                score += 1 + consecutive * 2; // bonus za kolejne znaki obok siebie
                consecutive++;
                qi++;
            } else {
                consecutive = 0;
            }
        }
        if (qi < q.length) return 0; // nie wszystkie znaki znalezione

        return Math.round((score / (q.length * 3)) * 60); // normalizuj do 0–60
    }

    // Przełącznik trybu wyszukiwania
    function setSearchMode(mode) {
        searchMode = mode;
        document.getElementById('search-mode-name')?.classList.toggle('active', mode === 'name');
        document.getElementById('search-mode-ing')?.classList.toggle('active', mode === 'ingredient');
        const inp = document.getElementById('recipe-search');
        if (inp) {
            inp.placeholder = mode === 'name'
                ? 'Szukaj przepisu...'
                : 'Wpisz składniki, np. kurczak, ryż...';
            inp.value = '';
        }
        filterRecipes();
    }

    // ─── WYSZUKIWANIE PO SKŁADNIKACH ───────────────────────────
    // Zwraca listę { name, matchedCount, matchedIngredients } posortowaną wg dopasowań
    function searchByIngredients(query) {
        const terms = query.split(/[,;]+/)
            .map(t => t.trim())
            .filter(t => t.length >= 2); // pomijaj bardzo krótkie terminy

        if (!terms.length) return PRZEPISY_DATA.przepisy.map(name => ({ name, matchedCount: 0, matchedIngredients: [] }));

        const results = PRZEPISY_DATA.przepisy.map(name => {
            const ings = PRZEPISY_DATA.skladniki[name] || [];
            const ingNames = ings.map(i => normalizeStr(i.skladnik));
            const matchedIngredients = [];

            for (const term of terms) {
                const normTerm = normalizeStr(term);
                const hit = ingNames.find(ing => ing.includes(normTerm));
                if (hit) matchedIngredients.push(term.trim());
            }

            return { name, matchedCount: matchedIngredients.length, matchedIngredients };
        });

        return results
            .filter(r => r.matchedCount > 0)
            .sort((a, b) => b.matchedCount - a.matchedCount || a.name.localeCompare(b.name, 'pl'));
    }

    // ─── FILTROWANIE ───────────────────────────────────────────
    function renderRecipes() {
        displayRecipes(PRZEPISY_DATA.przepisy.map(name => ({ name, matchedCount: 0, matchedIngredients: [] })));
    }

    function filterRecipes() {
        const rawQuery      = document.getElementById('recipe-search')?.value || '';
        const caloriesFilter = document.getElementById('filter-calories')?.value || 'all';
        const typeFilter    = document.getElementById('filter-type')?.value || 'all';
        const sortBy        = document.getElementById('sort-recipes')?.value || 'alpha';

        // ── Tryb wyszukiwania po składnikach ──
        if (searchMode === 'ingredient') {
            let results = searchByIngredients(rawQuery);

            // Dodatkowe filtry kalorii i typu
            results = results.filter(({ name: p }) => {
                if (showOnlyFavorites && !favorites.includes(p)) return false;
                if (caloriesFilter !== 'all') {
                    const n = NUTRITION_DATA[p];
                    if (n) {
                        if (caloriesFilter === 'low'    && n.kcal >= KCAL_LOW)  return false;
                        if (caloriesFilter === 'medium' && (n.kcal < KCAL_LOW || n.kcal > KCAL_HIGH)) return false;
                        if (caloriesFilter === 'high'   && n.kcal <= KCAL_HIGH) return false;
                    }
                }
                if (typeFilter === 'breakfast' && OBIADY_LIST.includes(p)) return false;
                if (typeFilter === 'lunch' && !OBIADY_LIST.includes(p)) return false;
                return true;
            });

            if (!rawQuery.trim()) {
                // Brak zapytania — pokaż wszystkie
                results = PRZEPISY_DATA.przepisy
                    .filter(p => {
                        if (showOnlyFavorites && !favorites.includes(p)) return false;
                        if (typeFilter === 'breakfast' && OBIADY_LIST.includes(p)) return false;
                        if (typeFilter === 'lunch' && !OBIADY_LIST.includes(p)) return false;
                        return true;
                    })
                    .map(name => ({ name, matchedCount: 0, matchedIngredients: [] }));
            }

            displayRecipes(results);
            return;
        }

        // ── Tryb wyszukiwania po nazwie (z rozmytym dopasowaniem) ──
        const query = rawQuery.toLowerCase();

        let scored = PRZEPISY_DATA.przepisy.map(p => {
            // Filtry ulubione / kalorie / typ
            if (showOnlyFavorites && !favorites.includes(p)) return null;
            if (caloriesFilter !== 'all') {
                const n = NUTRITION_DATA[p];
                if (n) {
                    if (caloriesFilter === 'low'    && n.kcal >= KCAL_LOW)  return null;
                    if (caloriesFilter === 'medium' && (n.kcal < KCAL_LOW || n.kcal > KCAL_HIGH)) return null;
                    if (caloriesFilter === 'high'   && n.kcal <= KCAL_HIGH) return null;
                }
            }
            if (typeFilter === 'breakfast' && OBIADY_LIST.includes(p)) return null;
            if (typeFilter === 'lunch' && !OBIADY_LIST.includes(p)) return null;

            const score = query ? fuzzyScore(query, p) : 100;
            if (query && score === 0) return null; // nie pasuje

            return { name: p, score, matchedCount: 0, matchedIngredients: [] };
        }).filter(Boolean);

        // Sortowanie
        if (query) {
            // Przy wyszukiwaniu — najpierw sortuj wg trafności, potem wg wybranego kryterium
            scored.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                const nA = NUTRITION_DATA[a.name] || { kcal: 0, b: 0 };
                const nB = NUTRITION_DATA[b.name] || { kcal: 0, b: 0 };
                if (sortBy === 'calories-asc')  return nA.kcal - nB.kcal;
                if (sortBy === 'calories-desc') return nB.kcal - nA.kcal;
                if (sortBy === 'protein-asc')   return nA.b - nB.b;
                if (sortBy === 'protein-desc')  return nB.b - nA.b;
                return a.name.localeCompare(b.name, 'pl');
            });
        } else {
            scored.sort((a, b) => {
                const nA = NUTRITION_DATA[a.name] || { kcal: 0, b: 0 };
                const nB = NUTRITION_DATA[b.name] || { kcal: 0, b: 0 };
                if (sortBy === 'calories-asc')  return nA.kcal - nB.kcal;
                if (sortBy === 'calories-desc') return nB.kcal - nA.kcal;
                if (sortBy === 'protein-asc')   return nA.b - nB.b;
                if (sortBy === 'protein-desc')  return nB.b - nA.b;
                return a.name.localeCompare(b.name, 'pl');
            });
        }

        displayRecipes(scored);
    }

    // ─── WYŚWIETLANIE PRZEPISÓW ────────────────────────────────
    // Przyjmuje listę obiektów { name, matchedIngredients }
    function displayRecipes(list) {
        const el = document.getElementById('recipes-list');
        if (!el) return;

        if (!list.length) {
            el.innerHTML = `<div class="empty-state">
                <div class="empty-icon">🔍</div>
                <div style="font-size:16px;font-weight:600;">Nie znaleziono przepisów</div>
                ${searchMode === 'ingredient'
                    ? '<div style="font-size:14px;margin-top:6px;color:var(--text-secondary);">Spróbuj wpisać inne składniki oddzielone przecinkiem</div>'
                    : ''}
            </div>`;
            return;
        }

        el.innerHTML = list.map(({ name, matchedIngredients }, i) => {
            const ings  = PRZEPISY_DATA.skladniki[name] || [];
            const steps = PRZEPISY_DATA.instrukcje[name] || [];
            const isFav = favorites.includes(name);
            const matchBadge = matchedIngredients && matchedIngredients.length
                ? `<div class="ingredient-match-badge">🥕 ${matchedIngredients.join(', ')}</div>`
                : '';

            // Podświetl pasujące składniki w trybie składnikowym
            const ingHTML = ings.map(ing => {
                const isMatch = matchedIngredients && matchedIngredients.some(
                    term => normalizeStr(ing.skladnik).includes(normalizeStr(term))
                );
                return `<div class="ingredient-item${isMatch ? ' ingredient-matched' : ''}">
                    <span>${sanitize(ing.skladnik)}${isMatch ? ' ✓' : ''}</span>
                    <span class="ingredient-amount">${ing.ilosc} ${sanitize(ing.jednostka)}</span>
                </div>`;
            }).join('');

            return `<div class="recipe-card">
                <div class="recipe-header" onclick="toggleRecipe(${i})">
                    <div style="flex:1;min-width:0;">
                        <div class="recipe-title">${sanitize(name)}</div>
                        ${matchBadge}
                    </div>
                    <button class="recipe-edit-btn" onclick="openEditorEdit('${name.replace(/'/g,"\\'")}');event.stopPropagation();" title="Edytuj przepis">✏️</button>
                    <button class="fav-btn" onclick="toggleFavorite('${name.replace(/'/g,"\\'")}', event)" title="${isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}">${isFav ? '❤️' : '🤍'}</button>
                    <div class="recipe-arrow" id="arr-${i}">▼</div>
                </div>
                <div class="recipe-content" id="rc-${i}">
                    <div class="recipe-body">
                        <div class="recipe-section">
                            <div class="recipe-section-title">📝 Składniki</div>
                            ${ingHTML}
                        </div>
                        <div class="recipe-section">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                                <div class="recipe-section-title" style="margin:0;">👨‍🍳 Instrukcja</div>
                                ${steps.length ? `<button class="cook-btn" onclick="startCooking('${name.replace(/'/g,"\\'")}');event.stopPropagation();">🍳 Gotuj</button>` : ''}
                            </div>
                            ${steps.length
                                ? `<ol class="instruction-list">${steps.map(s => `<li class="instruction-step">${sanitize(s.replace(/^\d+\.\s*/,''))}</li>`).join('')}</ol>`
                                : `<p style="color:var(--text-secondary);font-style:italic;">Brak instrukcji.</p>`}
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function toggleRecipe(i) {
        document.getElementById('rc-'+i)?.classList.toggle('open');
        document.getElementById('arr-'+i)?.classList.toggle('open');
    }

    // ─── TRYB GOTOWANIA ────────────────────────────────────────
    let _cookingName = '';
    let _cookingServings = 1;

    function startCooking(name) {
        _cookingName = name;
        _cookingServings = 1;
        _renderCooking();
        document.getElementById('cooking-overlay').classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function _renderCooking() {
        const name     = _cookingName;
        const servings = _cookingServings;
        const ings     = PRZEPISY_DATA.skladniki[name] || [];
        const steps    = PRZEPISY_DATA.instrukcje[name] || [];
        const ov       = document.getElementById('cooking-overlay');

        const servingsHTML = `
            <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.12);
                        border-radius:12px;padding:8px 14px;margin:8px 16px 0;">
                <span style="font-size:13px;opacity:.9;">🍽️ Porcje:</span>
                <button onclick="changeCookingServings(-1)"
                    style="width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,.25);
                           color:#fff;font-size:18px;cursor:pointer;line-height:1;">−</button>
                <span id="cooking-servings-val" style="font-size:18px;font-weight:700;min-width:24px;text-align:center;">${servings}</span>
                <button onclick="changeCookingServings(1)"
                    style="width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,.25);
                           color:#fff;font-size:18px;cursor:pointer;line-height:1;">+</button>
            </div>`;

        ov.innerHTML = `
            <div class="cooking-top">
                <button class="cooking-close" onclick="closeCooking()">×</button>
                <div class="cooking-top-title">${sanitize(name)}</div>
                <div style="opacity:.85;font-size:13px;margin-top:4px;">Tryb gotowania</div>
                ${servingsHTML}
            </div>
            <div class="cooking-body">
                <div class="cooking-section">
                    <div class="cooking-section-title">📝 Składniki${servings > 1 ? ` <span style="font-size:12px;opacity:.7;">(×${servings})</span>` : ''}</div>
                    ${ings.map(i => {
                        const scaled = Math.round(i.ilosc * servings * 10) / 10;
                        return `<div class="cooking-ing"><span>${sanitize(i.skladnik)}</span><strong>${scaled} ${sanitize(i.jednostka)}</strong></div>`;
                    }).join('')}
                </div>
                <div class="cooking-section">
                    <div class="cooking-section-title">👨‍🍳 Przygotowanie</div>
                    ${steps.map((s, i) => {
                        const clean = s.replace(/^\d+\.\s*/, '');
                        const tm    = clean.match(/(\d+)\s*(minut|min|godzin|godz)/i);
                        return `<div class="cooking-step-card">
                            <div class="cooking-step-num">${i + 1}</div>
                            <div class="cooking-step-text">${sanitize(clean)}</div>
                            ${tm ? `<div class="cooking-timer-badge">⏱️ ${sanitize(tm[0])}</div>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    function changeCookingServings(delta) {
        _cookingServings = Math.max(1, Math.min(10, _cookingServings + delta));
        _renderCooking();
    }

    function closeCooking() {
        document.getElementById('cooking-overlay').classList.remove('active');
        document.body.style.overflow = '';
    }
