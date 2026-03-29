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
                    if (caloriesFilter === 'low' && kcal >= 500) return false;
                    if (caloriesFilter === 'medium' && (kcal < 500 || kcal > 700)) return false;
                    if (caloriesFilter === 'high' && kcal <= 700) return false;
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
    function startCooking(name) {
        const ings  = PRZEPISY_DATA.skladniki[name]||[];
        const steps = PRZEPISY_DATA.instrukcje[name]||[];
        const ov = document.getElementById('cooking-overlay');
        ov.innerHTML = `
            <div class="cooking-top">
                <button class="cooking-close" onclick="closeCooking()">×</button>
                <div class="cooking-top-title">${name}</div>
                <div style="opacity:.85;font-size:13px;margin-top:4px;">Tryb gotowania</div>
            </div>
            <div class="cooking-body">
                <div class="cooking-section">
                    <div class="cooking-section-title">📝 Składniki</div>
                    ${ings.map(i=>`<div class="cooking-ing"><span>${i.skladnik}</span><strong>${i.ilosc} ${i.jednostka}</strong></div>`).join('')}
                </div>
                <div class="cooking-section">
                    <div class="cooking-section-title">👨‍🍳 Przygotowanie</div>
                    ${steps.map((s,i) => {
                        const clean = s.replace(/^\d+\.\s*/,'');
                        const tm = clean.match(/(\d+)\s*(minut|min|godzin|godz)/i);
                        return `<div class="cooking-step-card">
                            <div class="cooking-step-num">${i+1}</div>
                            <div class="cooking-step-text">${clean}</div>
                            ${tm ? `<div class="cooking-timer-badge">⏱️ ${tm[0]}</div>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        ov.classList.add('active');
        document.body.style.overflow='hidden';
    }
    function closeCooking() {
        document.getElementById('cooking-overlay').classList.remove('active');
        document.body.style.overflow='';
    }
