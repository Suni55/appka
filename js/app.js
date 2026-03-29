// ─── INIT ──────────────────────────────────────────────────
    // Jednorazowe czyszczenie starych danych synchronizacji
    if (localStorage.getItem('syncCode')) {
        localStorage.removeItem('syncCode');
        localStorage.removeItem('syncRole');
    }
    
    initDarkMode();
    initNotifications();
    updateRecipeHistory(currentPlan);
    restoreCustomRecipes();
    renderToday();
    renderCalendar();
    // Ustaw domyślny zakres zakupów po załadowaniu DOM
    setTimeout(initShopDates, 100);
    // Uruchom synchronizację jeśli para już skonfigurowana
    setTimeout(initSync, 300);
