// ─── ZAKUPY ────────────────────────────────────────────────
    function convertUnits(name, amount, unit) {
        const n = name.toLowerCase();
        for (const [key, conv] of Object.entries(UNIT_CONVERSIONS)) {
            if (n.includes(key) && unit === 'g') {
                return { amount: Math.ceil(amount / conv.grams), unit: conv.unit, original: `(${Math.round(amount)}g)` };
            }
        }
        return { amount: Math.round(amount * 10)/10, unit, original: null };
    }

    // Normalizacja - łączy różne nazwy tego samego produktu

    // Przeliczniki jednostek na gramy/ml

    function normalizeIngredient(name) {
        return INGREDIENT_ALIASES[name] || name;
    }

    function getShopDateRange() {
        const fromEl = document.getElementById('shop-date-from');
        const toEl   = document.getElementById('shop-date-to');
        return { from: fromEl?.value || null, to: toEl?.value || null };
    }

    function setShopRange(days) {
        const from = new Date();
        const to   = new Date();
        to.setDate(to.getDate() + days - 1);
        const fmt = d => dateKey(d.getFullYear(), d.getMonth(), d.getDate());
        document.getElementById('shop-date-from').value = fmt(from);
        document.getElementById('shop-date-to').value   = fmt(to);
        updateShoppingList();
    }

    function initShopDates() {
        // Domyślnie: od dziś + 7 dni
        setShopRange(7);
    }

    function calcShoppingList() {
        const ing = {};
        const { from, to } = getShopDateRange();

        // Filtruj klucze planu wg zakresu dat
        Object.keys(currentPlan).forEach(key => {
            // Format klucza: 'YYYY-MM-DD-meal-person' lub stary 'mon-meal-person'
            const dateStr = key.substring(0, 10); // pierwsze 10 znaków = data
            if (from && to) {
                if (dateStr < from || dateStr > to) return; // poza zakresem
            }
            const name = currentPlan[key];
            if (!name) return;
            (PRZEPISY_DATA.skladniki[name]||[]).forEach(i => {
                const normalizedName = normalizeIngredient(i.skladnik);
                let amount = i.ilosc;
                let unit = i.jednostka;
                const conv = UNIT_TO_GRAMS[unit];
                if (conv && normalizedName === conv.name) {
                    amount = i.ilosc * conv.gramsPerUnit;
                    unit = 'g';
                }
                const k = `${normalizedName}|||${unit}`;
                if (!ing[k]) ing[k] = { name: normalizedName, amount: 0, unit };
                ing[k].amount += amount;
            });
        });
        return Object.values(ing);
    }

    // Debounced wrapper — odświeża listę maksymalnie raz na DEBOUNCE_DELAY ms
    const updateShoppingList = debounce(_updateShoppingList, DEBOUNCE_DELAY);

    function getShopCategory(name) {
        const n = name.toLowerCase();
        if (/marchew|brokuł|szpinak|cukini|papryka|ogórek|pomidor|sałat|kapust|cebul|czosnek|rzodkiew|bakłażan|kukurydz|seler|por|groszek|fasola szpar/.test(n))
            return { emoji: '🥦', label: 'Warzywa', cls: 'cat-veg' };
        if (/jabłk|banan|gruszk|malin|borówk|truskawk|wiśni|kiwi|mango|ananas|cytry|pomarańcz|śliwk|morela|owoc/.test(n))
            return { emoji: '🍎', label: 'Owoce', cls: 'cat-fruit' };
        if (/mleko|jogurt|skyr|serek|twaróg|twarożek|śmietan|masło(?! orzechowe| migdałowe| kokosowe| arachidowe| kakaowe)|ser |ricott|mozzarell|feta|halloum/.test(n))
            return { emoji: '🥛', label: 'Nabiał', cls: 'cat-dairy' };
        if (/kurczak|indyk|wołowin|wieprzow|ryba|łosoś|tuńczyk|dorsz|pstrąg|krewetk|szynk|boczek|kiełbas|mięso|wędlin/.test(n))
            return { emoji: '🥩', label: 'Mięso', cls: 'cat-meat' };
        if (/chleb|pieczywo|bułk|makaron|ryż|kasza|płatki|mąka|bajgiel|tortilla|wafle|gnocchi|toast|tost|granola|krakersy|krakery/.test(n))
            return { emoji: '🍞', label: 'Zboża', cls: 'cat-grain' };
        return { emoji: '🛒', label: 'Inne', cls: 'cat-other' };
    }

    function _updateShoppingList() {
        const el = document.getElementById('shopping-list');
        if (!el) return;
        const items = calcShoppingList();

        if (!items.length && !customProducts.length) {
            el.innerHTML = `<div class="empty-state"><div class="empty-icon">🛒</div>
                <div style="font-size:16px;font-weight:600;">Brak produktów</div>
                <div style="font-size:14px;margin-top:6px;">Dodaj posiłki do planu lub wpisz własne produkty powyżej</div></div>`;
            updateStats(0, 0); return;
        }

        // Scal przepisowe i własne produkty w jedną posortowaną listę
        const allItems = [
            ...items.map(i => ({
                type: 'recipe',
                name: i.name,
                amount: i.amount,
                unit: i.unit,
                isChecked: checkedItems.includes(`${i.name}|||${i.unit}`)
            })),
            ...customProducts.map(p => ({
                type: 'custom',
                id: p.id,
                name: p.name,
                isChecked: p.checked
            }))
        ];

        // Podziel na niekupione / kupione i sortuj alfabetycznie
        const sort = arr => arr.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
        const unchecked = sort(allItems.filter(i => !i.isChecked));
        const checked   = sort(allItems.filter(i =>  i.isChecked));

        let html = `<div class="shopping-header-row">
            <div></div>
            <div class="header-label" style="text-align:left;">Produkt</div>
            <div class="header-label">Posiadane</div>
            <div class="header-label">Do kupienia</div>
        </div>`;

        let totalItems = 0, checkedCount = 0;

        [...unchecked, ...checked].forEach(item => {
            if (item.type === 'recipe') {
                const key = `${item.name}|||${item.unit}`;
                const owned  = ownedAmounts[key] || 0;
                const toBuy  = Math.max(0, item.amount - owned);
                if (toBuy > 0)    totalItems++;
                if (item.isChecked) checkedCount++;

                const conv = convertUnits(item.name, item.amount, item.unit);
                const neededDisplay = conv.original
                    ? `${conv.amount} ${conv.unit} ${conv.original}`
                    : `${conv.amount} ${conv.unit}`;
                const toBuyDisplay = `${Math.round(toBuy * 10) / 10} ${item.unit}`;
                const cat = getShopCategory(item.name);

                html += `<div class="shopping-item ${item.isChecked ? 'checked' : ''}">
                    <div class="checkbox ${item.isChecked ? 'checked' : ''}" onclick="toggleItem('${key}')"></div>
                    <div class="item-info">
                        <div class="item-name">${sanitize(item.name)}</div>
                        <div class="item-details"><span class="shop-badge ${cat.cls}">${cat.emoji} ${cat.label}</span> · Potrzebne: ${sanitize(neededDisplay)}</div>
                    </div>
                    <input type="number" class="item-input" value="${owned || ''}" placeholder="0"
                        onchange="updateOwned('${key}',this.value)" onclick="event.stopPropagation()">
                    <div class="item-needed">${sanitize(toBuyDisplay)}</div>
                </div>`;
            } else {
                // własny produkt — zintegrowany alfabetycznie
                if (!item.isChecked) totalItems++;
                else                 checkedCount++;

                html += `<div class="shopping-item ${item.isChecked ? 'checked' : ''}">
                    <div class="checkbox ${item.isChecked ? 'checked' : ''}" onclick="toggleCustomProduct(${item.id})"></div>
                    <div class="item-info" style="grid-column: span 2;">
                        <div class="item-name">${sanitize(item.name)}</div>
                        <div class="item-details" style="font-size:11px;color:var(--text-secondary);">✏️ własny produkt</div>
                    </div>
                    <button class="custom-item-delete" onclick="deleteCustomProduct(${item.id})" title="Usuń">✕</button>
                </div>`;
            }
        });

        el.innerHTML = html;
        updateStats(totalItems, checkedCount);
    }
    function toggleItem(key) {
        const idx = checkedItems.indexOf(key);
        const nowChecked = idx === -1;
        if (idx > -1) checkedItems.splice(idx,1); else checkedItems.push(key);
        saveCheckedItems(checkedItems, key, nowChecked); updateShoppingList();
    }
    function clearCheckedItems() {
        const hasChecked = checkedItems.length > 0 || customProducts.some(p => p.checked);
        if (!hasChecked) return;
        if (confirm('Wyczyścić kupione produkty?')) {
            // Odznacz każdy po kolei w Supabase
            checkedItems.forEach(k => pushCheckedItem(k, false));
            checkedItems = [];
            customProducts = customProducts.filter(p => !p.checked);
            saveCheckedItems(checkedItems);
            saveCustomProducts(customProducts);
            updateShoppingList();
        }
    }
    function updateOwned(key,val) {
        const n = parseFloat(val)||0;
        if (!n) delete ownedAmounts[key]; else ownedAmounts[key]=n;
        saveOwnedAmounts(ownedAmounts);
        if (!isSyncing && syncPairId) pushOwnedAmount(key, n);
        updateShoppingList();
    }
    function updateStats(total, checked) {
        document.getElementById('total-items').textContent = total;
        document.getElementById('checked-items').textContent = checked;
    }
