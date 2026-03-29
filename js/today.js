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
        const e1 = calcEatenKcal(dayId, 'person1');
        const e2 = calcEatenKcal(dayId, 'person2');
        const p1 = calcPlannedKcal(dayId, 'person1');
        const p2 = calcPlannedKcal(dayId, 'person2');
        const total = p1 + p2;
        const eatenTotal = e1 + e2;
        const pct = total > 0 ? Math.min(100, Math.round(eatenTotal / total * 100)) : 0;
        const pl1 = MEALS.filter(m => currentPlan[`${dayId}-${m.id}-person1`]).length;
        const pl2 = MEALS.filter(m => currentPlan[`${dayId}-${m.id}-person2`]).length;
        const ea1 = MEALS.filter(m => eaten[eatenKey(dayId, m.id, 'person1')] && currentPlan[`${dayId}-${m.id}-person1`]).length;
        const ea2 = MEALS.filter(m => eaten[eatenKey(dayId, m.id, 'person2')] && currentPlan[`${dayId}-${m.id}-person2`]).length;
        return `<div class="eaten-bar-wrap">
            <div class="eaten-bar-label">
                <div class="eaten-bar-title">Postęp dnia</div>
                <div class="eaten-bar-kcal">${eatenTotal} / ${total} kcal</div>
            </div>
            <div class="eaten-bar-track"><div class="eaten-bar-fill" style="width:${pct}%"></div></div>
            <div class="eaten-persons">
                <div class="eaten-person-bar">Ona: <span>${e1} kcal</span> · ${ea1}/${pl1} posiłków</div>
                <div class="eaten-person-bar">On: <span>${e2} kcal</span> · ${ea2}/${pl2} posiłków</div>
            </div>
        </div>`;
    }

    function renderToday() {
        const now = new Date();
        const dayId = todayKey();
        const dayNames = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
        const dayName = dayNames[now.getDay()];
        const dateStr = now.toLocaleDateString('pl-PL',{year:'numeric',month:'long',day:'numeric'});
        const icons = {breakfast:'🌅',lunch:'🍽️',dinner:'🌙'};
        const mealNames = {breakfast:'Śniadanie',lunch:'Obiad',dinner:'Kolacja'};
        const eaten = loadEaten();

        let html = `<div class="today-hero"><div class="today-day">${dayName}</div><div class="today-date">${dateStr}</div></div>`;

        let anyMeal = false;
        MEALS.forEach(meal => {
            const p1 = currentPlan[`${dayId}-${meal.id}-person1`];
            const p2 = currentPlan[`${dayId}-${meal.id}-person2`];
            if (!p1 && !p2) return;
            anyMeal = true;
            const e1 = eaten[eatenKey(dayId, meal.id, 'person1')];
            const e2 = eaten[eatenKey(dayId, meal.id, 'person2')];
            html += `<div class="meal-card-today">
                <div class="meal-card-header"><div class="meal-icon">${icons[meal.id]}</div><div class="meal-time">${mealNames[meal.id]}</div></div>
                <div class="person-meal">
                    <div class="person-label">Ona</div>
                    <div class="person-meal-row">
                        <div class="recipe-pill ${p1?'':'empty'}${e1?' meal-eaten':''}" ${p1?`onclick="goToRecipe('${p1.replace(/'/g,"\\'")}')"`:''}>
                            ${p1||'Nie zaplanowano'}${p1?macroPills(p1):''}</div>
                        ${p1?`<button class="eaten-btn ${e1?'eaten':'not-eaten'}" onclick="toggleEaten('${dayId}','${meal.id}','person1')">${e1?'✓':'○'}</button>`:''}
                    </div>
                </div>
                <div class="person-meal">
                    <div class="person-label">On</div>
                    <div class="person-meal-row">
                        <div class="recipe-pill ${p2?'':'empty'}${e2?' meal-eaten':''}" ${p2?`onclick="goToRecipe('${p2.replace(/'/g,"\\'")}')"`:''}>
                            ${p2||'Nie zaplanowano'}${p2?macroPills(p2):''}</div>
                        ${p2?`<button class="eaten-btn ${e2?'eaten':'not-eaten'}" onclick="toggleEaten('${dayId}','${meal.id}','person2')">${e2?'✓':'○'}</button>`:''}
                    </div>
                </div>
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
