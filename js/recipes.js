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

    function renderRecipes() {
        // Panel filtrów jest już w HTML, więc tylko renderujemy listę
        displayRecipes(PRZEPISY_DATA.przepisy);
    }
    
    function filterRecipes() {
        const searchQuery = document.getElementById('recipe-search')?.value.toLowerCase() || '';
        const caloriesFilter = document.getElementById('filter-calories')?.value || 'all';
        const typeFilter = document.getElementById('filter-type')?.value || 'all';
        const sortBy = document.getElementById('sort-recipes')?.value || 'alpha';
        
        let filtered = PRZEPISY_DATA.przepisy.filter(p => {
            // Filtr ulubionych
            if (showOnlyFavorites && !favorites.includes(p)) return false;
            // Filtr wyszukiwania
            if (searchQuery && !p.toLowerCase().includes(searchQuery)) return false;
            
            // Filtr kalorii
            if (caloriesFilter !== 'all') {
                const nutrition = NUTRITION_DATA[p];
                if (nutrition) {
                    const kcal = nutrition.kcal;
                    if (caloriesFilter === 'low'    && kcal >= KCAL_LOW)  return false;
                    if (caloriesFilter === 'medium' && (kcal < KCAL_LOW || kcal > KCAL_HIGH)) return false;
                    if (caloriesFilter === 'high'   && kcal <= KCAL_HIGH) return false;
                }
            }
            
            // Filtr typu
            if (typeFilter === 'breakfast' && OBIADY_LIST.includes(p)) return false;
            if (typeFilter === 'lunch' && !OBIADY_LIST.includes(p)) return false;
            
            return true;
        });
        
        // Sortowanie
        filtered.sort((a, b) => {
            if (sortBy === 'alpha') {
                return a.localeCompare(b, 'pl');
            }
            const nA = NUTRITION_DATA[a] || { kcal: 0, b: 0 };
            const nB = NUTRITION_DATA[b] || { kcal: 0, b: 0 };
            
            if (sortBy === 'calories-asc') return nA.kcal - nB.kcal;
            if (sortBy === 'calories-desc') return nB.kcal - nA.kcal;
            if (sortBy === 'protein-asc') return nA.b - nB.b;
            if (sortBy === 'protein-desc') return nB.b - nA.b;
            
            return 0;
        });
        
        displayRecipes(filtered);
    }
    function displayRecipes(list) {
        const el = document.getElementById('recipes-list');
        if (!el) return;
        if (!list.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><div>Nie znaleziono przepisów</div></div>`; return; }
        el.innerHTML = list.map((name, i) => {
            const ings = PRZEPISY_DATA.skladniki[name]||[];
            const steps = PRZEPISY_DATA.instrukcje[name]||[];
            const isFav = favorites.includes(name);
            return `<div class="recipe-card">
                <div class="recipe-header" onclick="toggleRecipe(${i})">
                    <div class="recipe-title">${name}</div>
                    <button class="recipe-edit-btn" onclick="openEditorEdit('${name.replace(/'/g,"\\'")}');event.stopPropagation();" title="Edytuj przepis">✏️</button>
                    <button class="fav-btn" onclick="toggleFavorite('${name.replace(/'/g,"\'")}', event)" title="${isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}">${isFav ? '❤️' : '🤍'}</button>
                    <div class="recipe-arrow" id="arr-${i}">▼</div>
                </div>
                <div class="recipe-content" id="rc-${i}">
                    <div class="recipe-body">
                        <div class="recipe-section">
                            <div class="recipe-section-title">📝 Składniki</div>
                            ${ings.map(ing=>`<div class="ingredient-item">
                                <span>${ing.skladnik}</span>
                                <span class="ingredient-amount">${ing.ilosc} ${ing.jednostka}</span>
                            </div>`).join('')}
                        </div>
                        <div class="recipe-section">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                                <div class="recipe-section-title" style="margin:0;">👨‍🍳 Instrukcja</div>
                                ${steps.length ? `<button class="cook-btn" onclick="startCooking('${name.replace(/'/g,"\\'")}');event.stopPropagation();">🍳 Gotuj</button>` : ''}
                            </div>
                            ${steps.length ? `<ol class="instruction-list">${steps.map(s=>`<li class="instruction-step">${s.replace(/^\d+\.\s*/,'')}</li>`).join('')}</ol>`
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
