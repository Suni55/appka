// ─── PLAN ──────────────────────────────────────────────────
    function renderDayPanel(dateStr) {
        const c = document.getElementById('plan-container');
        const d = new Date(dateStr + 'T00:00:00');
        const dayNames = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
        const dayName = dayNames[d.getDay()];
        const dateLabel = d.toLocaleDateString('pl-PL', {day:'numeric', month:'long', year:'numeric'});

        let html = `<div class="card">
            <div class="day-header-row">
                <div>
                    <div class="day-name">${dayName}</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${dateLabel}</div>
                </div>
                <div class="day-buttons">
                    <button class="btn-day btn-copy-day" onclick="showCopyDayModal('${dateStr}')">📋 Kopiuj</button>
                    <button class="btn-day btn-clear-day" onclick="clearDay('${dateStr}')">🗑️ Wyczyść</button>
                </div>
            </div>`;

        MEALS.forEach(meal => {
            const k1 = `${dateStr}-${meal.id}-person1`;
            const k2 = `${dateStr}-${meal.id}-person2`;
            const v1 = currentPlan[k1] || '';
            const v2 = currentPlan[k2] || '';
            html += `<div class="meal-section">
                <div class="meal-label">${meal.name}</div>
                <div class="persons-grid">
                    <div>
                        <div class="person-label" style="display:flex;justify-content:space-between;align-items:center;">
                            <span>Ona</span>
                            ${v1 ? `<button onclick="copyMealTo('${dateStr}','${meal.id}','person1','person2')" class="btn-copy-meal-small">→</button>` : ''}
                        </div>
                        <div class="autocomplete-wrapper">
                            ${v1 ?
                                `<div class="recipe-display" onclick="clearRecipe('${k1}')" title="Kliknij aby zmienić">${v1}${macroPills(v1)}</div>` :
                                `<input type="text" id="inp-${k1}" class="recipe-input" value="" placeholder="Wpisz lub wybierz..."
                                    oninput="onRecipeInput('${k1}',this.value)" onfocus="showAC('${k1}',this.value)" onblur="hideACDelayed('${k1}')" autocomplete="off">`
                            }
                            <div id="ac-${k1}" class="autocomplete-list"></div>
                        </div>
                    </div>
                    <div>
                        <div class="person-label" style="display:flex;justify-content:space-between;align-items:center;">
                            <span>On</span>
                            ${v2 ? `<button onclick="copyMealTo('${dateStr}','${meal.id}','person2','person1')" class="btn-copy-meal-small">←</button>` : ''}
                        </div>
                        <div class="autocomplete-wrapper">
                            ${v2 ?
                                `<div class="recipe-display" onclick="clearRecipe('${k2}')" title="Kliknij aby zmienić">${v2}${macroPills(v2)}</div>` :
                                `<input type="text" id="inp-${k2}" class="recipe-input" value="" placeholder="Wpisz lub wybierz..."
                                    oninput="onRecipeInput('${k2}',this.value)" onfocus="showAC('${k2}',this.value)" onblur="hideACDelayed('${k2}')" autocomplete="off">`
                            }
                            <div id="ac-${k2}" class="autocomplete-list"></div>
                        </div>
                    </div>
                </div>
            </div>`;
        });
        html += '</div>';

        // Panel makro dla tego dnia
        html += renderMacroPanelHTML(dateStr);

        c.innerHTML = html;
    }

    function renderPlan() {
        // Teraz renderPlan = renderujemy kalendarz
        renderCalendar();
    }

        function onRecipeInput(key, val) { showAC(key, val); }
    function showAC(key, q) {
        const list = document.getElementById('ac-' + key);
        if (!list) return;
        
        // Klucz: '2026-03-22-breakfast-person1' - mealType jest na indeksie 3
        const parts = key.split('-');
        const mealType = parts[3]; // breakfast/lunch/dinner
        
        // Filtruj przepisy według typu posiłku
        let availableRecipes = PRZEPISY_DATA.przepisy;
        if (mealType === 'lunch') {
            // Dla obiadu tylko przepisy z listy OBIADY_LIST
            availableRecipes = PRZEPISY_DATA.przepisy.filter(p => OBIADY_LIST.includes(p));
        } else {
            // Dla śniadania i kolacji tylko przepisy POZA listą OBIADY_LIST
            availableRecipes = PRZEPISY_DATA.przepisy.filter(p => !OBIADY_LIST.includes(p));
        }
        
        const filtered = availableRecipes.filter(p => p.toLowerCase().includes(q.toLowerCase()));
        if (!filtered.length || (filtered.length===1 && filtered[0]===q)) { list.classList.remove('show'); return; }
        
        // Sortowanie alfabetyczne
        filtered.sort((a, b) => a.localeCompare(b, 'pl'));
        
        list.innerHTML = filtered.slice(0,50).map(p =>
            `<div class="autocomplete-item" onmousedown="pickRecipe('${key}','${p.replace(/'/g,"\\'")}')"> ${p}</div>`
        ).join('');
        list.classList.add('show');
    }
    function pickRecipe(key, val) {
        currentPlan[key] = val;
        savePlan(currentPlan, key);
        // Odśwież tylko panel dnia, nie cały kalendarz
        if (selectedDate) renderDayPanel(selectedDate);
        renderCalendar();
        hideAC(key);
    }
    
    function copyMealTo(dayId, mealId, fromPerson, toPerson) {
        const keyFrom = `${dayId}-${mealId}-${fromPerson}`;
        const keyTo = `${dayId}-${mealId}-${toPerson}`;
        const recipe = currentPlan[keyFrom];
        
        if (recipe) {
            currentPlan[keyTo] = recipe;
            savePlan(currentPlan, keyTo);
            if (selectedDate) renderDayPanel(selectedDate);
            renderCalendar();
            const fromLabel = fromPerson === 'person1' ? 'Ona' : 'On';
            const toLabel = toPerson === 'person1' ? 'Ona' : 'On';
            showToast(`✅ Skopiowano ${fromLabel} → ${toLabel}: ${recipe}`);
        }
    }
    
    function renderWeekStats() {
        const el = document.getElementById('week-stats');
        if (!el) return;
        
        // Zbierz statystyki
        let totalKcal = 0, totalB = 0, totalW = 0, totalT = 0;
        let mealsCount = 0;
        const recipeCounter = {};
        
        Object.keys(currentPlan).forEach(key => {
            const recipe = currentPlan[key];
            if (recipe && NUTRITION_DATA[recipe]) {
                const n = NUTRITION_DATA[recipe];
                totalKcal += n.kcal;
                totalB += n.b;
                totalW += n.w;
                totalT += n.t;
                mealsCount++;
                recipeCounter[recipe] = (recipeCounter[recipe] || 0) + 1;
            }
        });
        
        const avgKcal = mealsCount > 0 ? Math.round(totalKcal / mealsCount) : 0;
        const avgB = mealsCount > 0 ? Math.round(totalB / mealsCount) : 0;
        const avgW = mealsCount > 0 ? Math.round(totalW / mealsCount) : 0;
        const avgT = mealsCount > 0 ? Math.round(totalT / mealsCount) : 0;
        
        // Top 3 przepisy
        const topRecipes = Object.entries(recipeCounter)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        
        el.innerHTML = `
            <div style="font-family: 'Bricolage Grotesque', sans-serif; font-size: 16px; font-weight: 700; margin-bottom: 14px; color: var(--primary);">
                📊 Statystyki tygodnia
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px;">
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: 700; color: var(--primary);">${avgKcal}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600;">Śr. kcal</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: 700; color: #10B981;">${avgB}g</div>
                    <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600;">Śr. białko</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: 700; color: #F59E0B;">${avgW}g</div>
                    <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600;">Śr. węgle</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: 700; color: #EF4444;">${avgT}g</div>
                    <div style="font-size: 11px; color: var(--text-secondary); font-weight: 600;">Śr. tłuszcze</div>
                </div>
            </div>
            ${topRecipes.length > 0 ? `
                <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">
                    🏆 Najczęściej w tym tygodniu:
                </div>
                ${topRecipes.map((r, i) => `
                    <div style="font-size: 13px; color: var(--text-primary); padding: 4px 0;">
                        ${i + 1}. ${r[0]} <span style="color: var(--text-secondary);">(${r[1]}x)</span>
                    </div>
                `).join('')}
            ` : ''}
        `;
    }
    
    function exportPlanToPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Funkcja pomocnicza do konwersji polskich znaków (fallback jeśli czcionka nie obsługuje)
        function sanitizeText(text) {
            const charMap = {
                'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
                'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
                'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N',
                'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
            };
            return text.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, char => charMap[char] || char);
        }
        
        // Tytuł
        doc.setFontSize(20);
        doc.text(sanitizeText('Plan Posiłków - Tydzień'), 105, 20, { align: 'center' });
        
        let y = 35;
        const leftMargin = 14;
        const maxLineWidth = 120; // Maksymalna szerokość dla nazwy przepisu
        
        DAYS.forEach(day => {
            // Nazwa dnia
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text(sanitizeText(day.name), leftMargin, y);
            y += 8;
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            
            MEALS.forEach(meal => {
                const k1 = `${day.id}-${meal.id}-person1`;
                const k2 = `${day.id}-${meal.id}-person2`;
                const v1 = currentPlan[k1] || '—';
                const v2 = currentPlan[k2] || '—';
                
                // Sprawdź czy jest miejsce (minimum 25mm na posiłek)
                if (y > 265) {
                    doc.addPage();
                    y = 20;
                }
                
                // Nazwa posiłku
                doc.setFont(undefined, 'bold');
                doc.text(sanitizeText(`${meal.name}:`), leftMargin + 6, y);
                y += 5;
                
                doc.setFont(undefined, 'normal');
                
                // Osoba 1
                const person1Text = sanitizeText(`Ona: ${v1}`);
                const lines1 = doc.splitTextToSize(person1Text, maxLineWidth);
                lines1.forEach((line, idx) => {
                    doc.text(line, leftMargin + 11, y);
                    if (idx === 0 && v1 !== '—' && NUTRITION_DATA[v1]) {
                        // Makro w tej samej linii co pierwsza linia nazwy
                        const n = NUTRITION_DATA[v1];
                        doc.setFontSize(8);
                        doc.text(`(${n.kcal} kcal, B:${n.b}g, W:${n.w}g, T:${n.t}g)`, 140, y);
                        doc.setFontSize(10);
                    }
                    y += 5;
                });
                
                // Osoba 2
                const person2Text = sanitizeText(`On: ${v2}`);
                const lines2 = doc.splitTextToSize(person2Text, maxLineWidth);
                lines2.forEach((line, idx) => {
                    doc.text(line, leftMargin + 11, y);
                    if (idx === 0 && v2 !== '—' && NUTRITION_DATA[v2]) {
                        // Makro w tej samej linii co pierwsza linia nazwy
                        const n = NUTRITION_DATA[v2];
                        doc.setFontSize(8);
                        doc.text(`(${n.kcal} kcal, B:${n.b}g, W:${n.w}g, T:${n.t}g)`, 140, y);
                        doc.setFontSize(10);
                    }
                    y += 5;
                });
                
                y += 2; // Odstęp między posiłkami
            });
            
            y += 3; // Odstęp między dniami
        });
        
        // Zapisz PDF
        doc.save('plan-posilkow.pdf');
        showToast('📄 PDF wygenerowany!');
    }
    
    function copyWeekPlan() {
        const text = DAYS.map(day => {
            let dayText = `${day.name}:\n`;
            MEALS.forEach(meal => {
                const k1 = `${day.id}-${meal.id}-person1`;
                const k2 = `${day.id}-${meal.id}-person2`;
                const v1 = currentPlan[k1] || '—';
                const v2 = currentPlan[k2] || '—';
                dayText += `  ${meal.name}: Ona: ${v1}, On: ${v2}\n`;
            });
            return dayText;
        }).join('\n');
        
        navigator.clipboard.writeText(text).then(() => {
            showToast('📋 Skopiowano plan do schowka!');
        });
    }
    
    function showToast(message) {
        // Usuń stary toast jeśli istnieje
        const oldToast = document.getElementById('toast');
        if (oldToast) oldToast.remove();
        
        // Stwórz nowy toast
        const toast = document.createElement('div');
        toast.id = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: #10B981;
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            font-weight: 600;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideUp 0.3s ease;
        `;
        document.body.appendChild(toast);
        
        // Usuń po 3 sekundach
        setTimeout(() => {
            toast.style.animation = 'slideDown 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    function clearRecipe(key) {
        delete currentPlan[key];
        savePlan(currentPlan, key);
        if (selectedDate) renderDayPanel(selectedDate);
        renderCalendar();
    }
    function hideAC(key) { document.getElementById('ac-'+key)?.classList.remove('show'); }
    function hideACDelayed(key) { setTimeout(() => hideAC(key), 200); }
    function updateMeal(key, val) {
        if (!val.trim() || !PRZEPISY_DATA.przepisy.includes(val.trim())) delete currentPlan[key];
        else currentPlan[key] = val.trim();
        savePlan(currentPlan);
    }

    // Kopiowanie dnia
    let copySourceDay = null;
    function showCopyDayModal(dateStr) {
        const keys = Object.keys(currentPlan).filter(k => k.startsWith(dateStr + '-'));
        if (!keys.length) { alert('Ten dzień jest pusty!'); return; }
        copySourceDay = dateStr;
        const d = new Date(dateStr + 'T00:00:00');
        const label = d.toLocaleDateString('pl-PL', {weekday:'long', day:'numeric', month:'long'});
        const box = document.getElementById('copyday-box');

        // Zaproponuj 6 kolejnych dni
        const options = [];
        for (let i = 1; i <= 6; i++) {
            const nd = new Date(d); nd.setDate(nd.getDate() + i);
            const nk = dateKey(nd.getFullYear(), nd.getMonth(), nd.getDate());
            const nl = nd.toLocaleDateString('pl-PL', {weekday:'long', day:'numeric', month:'long'});
            options.push({ key: nk, label: nl });
        }
        // + 6 dni wstecz
        for (let i = 1; i <= 6; i++) {
            const nd = new Date(d); nd.setDate(nd.getDate() - i);
            const nk = dateKey(nd.getFullYear(), nd.getMonth(), nd.getDate());
            const nl = nd.toLocaleDateString('pl-PL', {weekday:'long', day:'numeric', month:'long'});
            options.push({ key: nk, label: nl });
        }

        box.innerHTML = `<div class="sync-title">📋 Kopiuj dzień</div>
            <p style="color:var(--text-secondary);margin-bottom:16px;">
                Skopiuj plan z <strong>${label}</strong> do:</p>
            ${options.map(o => `
                <div class="sync-option" onclick="executeCopyDay('${o.key}')">
                    <div class="sync-option-title">${o.label}</div>
                </div>`).join('')}
            <button class="sync-btn sync-btn-gray" onclick="closeCopyDayModal()">Anuluj</button>`;
        document.getElementById('copyday-overlay').classList.add('active');
    }
    function executeCopyDay(targetDate) {
        const existing = Object.keys(currentPlan).filter(k => k.startsWith(targetDate + '-'));
        if (existing.length && !confirm('Ten dzień ma już posiłki. Nadpisać?')) return;
        existing.forEach(k => delete currentPlan[k]);
        Object.keys(currentPlan)
            .filter(k => k.startsWith(copySourceDay + '-'))
            .forEach(k => { currentPlan[k.replace(copySourceDay + '-', targetDate + '-')] = currentPlan[k]; });
        savePlan(currentPlan);
        renderCalendar();
        closeCopyDayModal();
        showToast('✅ Skopiowano!');
    }
    function closeCopyDayModal() { document.getElementById('copyday-overlay').classList.remove('active'); }

    function clearDay(dateStr) {
        const keys = Object.keys(currentPlan).filter(k => k.startsWith(dateStr + '-'));
        if (!keys.length) { alert('Ten dzień jest już pusty!'); return; }
        if (confirm('Wyczyścić plan na ten dzień?')) {
            keys.forEach(k => delete currentPlan[k]);
            savePlan(currentPlan);
            renderCalendar();
        }
    }
    function clearPlan() {
        if (!Object.keys(currentPlan).length) { alert('Plan jest już pusty!'); return; }
        if (confirm('Wyczyścić cały plan?')) {
            currentPlan = {}; savePlan(currentPlan); renderCalendar();
        }
    }
