// ─── OZNACZANIE POSIŁKÓW ────────────────────────────────────
    const EATEN_KEY = 'eatenMeals';
    function loadEaten() {
        try { return JSON.parse(localStorage.getItem(EATEN_KEY) || '{}'); } catch(e) { return {}; }
    }
    function saveEaten(obj) { localStorage.setItem(EATEN_KEY, JSON.stringify(obj)); }
    function eatenKey(dayId, mealId, person) { return `${dayId}-${mealId}-${person}`; }

    function toggleEaten(dayId, mealId, person) {
        const eaten = loadEaten();
        const k = eatenKey(dayId, mealId, person);
        if (eaten[k]) delete eaten[k]; else eaten[k] = true;
        saveEaten(eaten);
        renderToday();
    }

    function calcEatenKcal(dayId, person) {
        const eaten = loadEaten();
        let total = 0;
        MEALS.forEach(meal => {
            if (eaten[eatenKey(dayId, meal.id, person)]) {
                const name = currentPlan[`${dayId}-${meal.id}-${person}`];
                if (name && NUTRITION_DATA[name]) total += NUTRITION_DATA[name].kcal;
            }
        });
        return Math.round(total);
    }

    function calcPlannedKcal(dayId, person) {
        let total = 0;
        MEALS.forEach(meal => {
            const name = currentPlan[`${dayId}-${meal.id}-${person}`];
            if (name && NUTRITION_DATA[name]) total += NUTRITION_DATA[name].kcal;
        });
        return Math.round(total);
    }

    function renderEatenBar(dayId) {
        const eaten = loadEaten();
        const household = getHousehold();
        let total = 0, eatenTotal = 0;
        const personStats = household.map(member => {
            const e = calcEatenKcal(dayId, member.id);
            const p = calcPlannedKcal(dayId, member.id);
            const pl = MEALS.filter(m => currentPlan[`${dayId}-${m.id}-${member.id}`]).length;
            const ea = MEALS.filter(m => eaten[eatenKey(dayId, m.id, member.id)] && currentPlan[`${dayId}-${m.id}-${member.id}`]).length;
            total += p; eatenTotal += e;
            return { member, e, pl, ea };
        });
        const pct = total > 0 ? Math.min(100, Math.round(eatenTotal / total * 100)) : 0;
        return `<div class="eaten-bar-wrap">
            <div class="eaten-bar-label">
                <div class="eaten-bar-title">Postęp dnia</div>
                <div class="eaten-bar-kcal">${eatenTotal} / ${total} kcal</div>
            </div>
            <div class="eaten-bar-track"><div class="eaten-bar-fill" style="width:${pct}%"></div></div>
            <div class="eaten-persons">
                ${personStats.map(s => `<div class="eaten-person-bar">${s.member.emoji} ${s.member.name}: <span>${s.e} kcal</span> · ${s.ea}/${s.pl} posiłków</div>`).join('')}
            </div>
        </div>`;
    }

    function renderToday() {
        const now = new Date();
        const dayId = todayKey();
        const dayNames = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
        const dayName = dayNames[now.getDay()];
        const dateStr = now.toLocaleDateString('pl-PL',{year:'numeric',month:'long',day:'numeric'});
        const icons = {breakfast:'🌅',brunch:'🥐',lunch:'🍽️',dinner:'🌙'};
        const mealNames = {breakfast:'Śniadanie',brunch:'II Śniadanie',lunch:'Obiad',dinner:'Kolacja'};
        const eaten = loadEaten();

        let html = `<div class="today-hero"><div class="today-day">${dayName}</div><div class="today-date">${dateStr}</div></div>`;

        const household = getHousehold();
        let anyMeal = false;
        MEALS.forEach(meal => {
            const personData = household.map(m => ({
                member: m,
                recipe: currentPlan[`${dayId}-${meal.id}-${m.id}`],
                isEaten: eaten[eatenKey(dayId, meal.id, m.id)]
            }));
            if (personData.every(p => !p.recipe)) return;
            anyMeal = true;
            html += `<div class="meal-card-today">
                <div class="meal-card-header"><div class="meal-icon">${icons[meal.id] || '🍴'}</div><div class="meal-time">${mealNames[meal.id] || meal.name}</div></div>
                ${personData.map(p => `<div class="person-meal">
                    <div class="person-label">${p.member.emoji} ${p.member.name}</div>
                    <div class="person-meal-row">
                        <div class="recipe-pill ${p.recipe?'':'empty'}${p.isEaten?' meal-eaten':''}" ${p.recipe?`onclick="goToRecipe('${p.recipe.replace(/'/g,"\\'")}')"`:''}>
                            ${p.recipe||'Nie zaplanowano'}${p.recipe?macroPills(p.recipe):''}</div>
                        ${p.recipe?`<button class="eaten-btn ${p.isEaten?'eaten':'not-eaten'}" onclick="toggleEaten('${dayId}','${meal.id}','${p.member.id}')">${p.isEaten?'✓':'○'}</button>`:''}
                    </div>
                </div>`).join('')}
            </div>`;
        });

        if (!anyMeal) html += `<div class="empty-state"><div class="empty-icon">📅</div>
            <div style="font-size:16px;font-weight:600;">Brak zaplanowanych posiłków</div>
            <div style="font-size:14px;margin-top:8px;">Przejdź do zakładki Plan</div></div>`;

        document.getElementById('today-container').innerHTML = html;

        // Pasek postępu — wstaw między today-container a macro-panel
        const macroEl = document.getElementById('macro-panel-container');
        const oldBar = document.getElementById('eaten-progress-bar');
        if (oldBar) oldBar.remove();
        if (anyMeal) {
            const barDiv = document.createElement('div');
            barDiv.id = 'eaten-progress-bar';
            barDiv.innerHTML = renderEatenBar(dayId);
            macroEl.parentNode.insertBefore(barDiv, macroEl);
        }

        // Panel makroskładników
        renderMacroPanel(dayId);

        // Renderuj sugestie
        if (!currentSuggestions.length) currentSuggestions = getSuggestions();
        renderSuggestionsSection();
    }

    function goToRecipe(name) {
        switchTab('recipes');
        setTimeout(() => {
            const inp = document.getElementById('recipe-search');
            if (inp) {
                inp.value = name;
                filterRecipes();
                window.scrollTo({top:0,behavior:'smooth'});
            }
        }, 120);
    }
