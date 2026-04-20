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

    function _updateShoppingList() {
        const el = document.getElementById('shopping-list');
        if (!el) return;
        const items = calcShoppingList();
        if (!items.length && !customProducts.length) {
            el.innerHTML = `<div class="empty-state"><div class="empty-icon">🛒</div>
                <div style="font-size:16px;font-weight:600;">Brak produktów</div>
                <div style="font-size:14px;margin-top:6px;">Dodaj posiłki do planu lub wpisz własne produkty powyżej</div></div>`;
            updateStats(0,0); return;
        }

        // Podziel na niekupione i kupione
        const unchecked = items.filter(i => !checkedItems.includes(`${i.name}|||${i.unit}`));
        const checked   = items.filter(i =>  checkedItems.includes(`${i.name}|||${i.unit}`));
        unchecked.sort((a,b) => a.name.localeCompare(b.name, 'pl'));
        checked.sort((a,b)   => a.name.localeCompare(b.name, 'pl'));

        let html = `<div class="shopping-header-row">
            <div></div>
            <div class="header-label" style="text-align:left;">Produkt</div>
            <div class="header-label">Posiadane</div>
            <div class="header-label">Do kupienia</div>
        </div>`;

        let totalItems=0, checkedCount=0;

        [...unchecked, ...checked].forEach(item => {
            const key = `${item.name}|||${item.unit}`;
            const isChecked = checkedItems.includes(key);
            const owned = ownedAmounts[key] || 0;
            const toBuy = Math.max(0, item.amount - owned);
            if (toBuy > 0) totalItems++;
            if (isChecked) checkedCount++;

            const conv = convertUnits(item.name, item.amount, item.unit);
            const neededDisplay = conv.original ? `${conv.amount} ${conv.unit} ${conv.original}` : `${conv.amount} ${conv.unit}`;
            const toBuyAmount = Math.round(toBuy*10)/10;
            const toBuyDisplay = `${toBuyAmount} ${item.unit}`;

            html += `<div class="shopping-item ${isChecked?'checked':''}">
                <div class="checkbox ${isChecked?'checked':''}" onclick="toggleItem('${key}')"></div>
                <div class="item-info">
                    <div class="item-name">${sanitize(item.name)}</div>
                    <div class="item-details">Potrzebne: ${sanitize(neededDisplay)}</div>
                </div>
                <input type="number" class="item-input" value="${owned||''}" placeholder="0"
                    onchange="updateOwned('${key}',this.value)" onclick="event.stopPropagation()">
                <div class="item-needed">${sanitize(toBuyDisplay)}</div>
            </div>`;
        });

        // Własne produkty
        const customUnchecked = customProducts.filter(p => !p.checked);
        const customChecked   = customProducts.filter(p =>  p.checked);

        if (customProducts.length > 0) {
            if (items.length > 0) {
                html += `<div class="custom-divider">Własne produkty</div>`;
            }
            [...customUnchecked, ...customChecked].forEach(p => {
                if (!p.checked) totalItems++;
                if (p.checked)  checkedCount++;
                html += `<div class="shopping-item ${p.checked ? 'checked' : ''}">
                    <div class="checkbox ${p.checked ? 'checked' : ''}" onclick="toggleCustomProduct(${p.id})"></div>
                    <div class="item-info" style="grid-column: span 2;">
                        <div class="item-name">${sanitize(p.name)}</div>
                    </div>
                    <button class="custom-item-delete" onclick="deleteCustomProduct(${p.id})" title="Usuń">✕</button>
                </div>`;
            });
        }

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
