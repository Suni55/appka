// ─── STATYSTYKI HISTORII ────────────────────────────────────
    let statsRange = '30'; // '7' | '30' | 'all'

    function calcStats(person, days) {
        const counts = {};
        const now = new Date();
        Object.entries(currentPlan).forEach(([key, recipe]) => {
            if (!recipe) return;
            if (!key.endsWith('-' + person)) return;
            // Wyciągnij datę z klucza YYYY-MM-DD-mealId-person
            const parts = key.split('-');
            if (parts.length < 5) return;
            const dateStr = parts.slice(0, 3).join('-');
            if (days !== 'all') {
                const d = new Date(dateStr + 'T00:00:00');
                const diffDays = (now - d) / 86400000;
                if (diffDays < 0 || diffDays > parseInt(days)) return;
            }
            counts[recipe] = (counts[recipe] || 0) + 1;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);
    }

    function renderStatsCol(person, label, maxCount) {
        const entries = calcStats(person, statsRange);
        if (!entries.length) {
            return `<div class="stats-person-col">
                <div class="stats-person-label">${label}</div>
                <div class="stats-empty">Brak danych</div>
            </div>`;
        }
        const rows = entries.map(([name, count]) => {
            const pct = maxCount > 0 ? Math.round(count / maxCount * 100) : 0;
            return `<div class="stats-recipe-row">
                <div style="flex:1;min-width:0;">
                    <div class="stats-recipe-name" title="${name}">${name}</div>
                    <div class="stats-recipe-bar-wrap">
                        <div class="stats-recipe-bar" style="width:${pct}%"></div>
                    </div>
                </div>
                <div class="stats-recipe-count">${count}×</div>
            </div>`;
        }).join('');
        return `<div class="stats-person-col">
            <div class="stats-person-label">${label}</div>
            ${rows}
        </div>`;
    }

    function renderStats() {
        const el = document.getElementById('stats-container');
        if (!el) return;

        const household = getHousehold();

        // Oblicz max dla skalowania pasków (wspólna skala)
        const allStats = household.map(m => calcStats(m.id, statsRange));
        const maxCount = Math.max(...allStats.map(e => e.length ? e[0][1] : 0), 1);

        const totalEntries = Object.keys(currentPlan).filter(k => currentPlan[k]).length;
        if (!totalEntries) { el.innerHTML = ''; return; }

        const tabLabels = { '7': 'Ostatnie 7 dni', '30': 'Ostatnie 30 dni', 'all': 'Cały czas' };

        el.innerHTML = `<div class="stats-section">
            <div class="stats-title">📊 Najczęstsze przepisy</div>
            <div class="stats-tabs">
                ${['7','30','all'].map(v =>
                    `<div class="stats-tab ${statsRange===v?'active':''}"
                        onclick="statsRange='${v}';renderStats()">${tabLabels[v]}</div>`
                ).join('')}
            </div>
            <div class="stats-persons">
                ${household.map(m => renderStatsCol(m.id, `${m.emoji} ${m.name}`, maxCount)).join('')}
            </div>
        </div>`;
    }
