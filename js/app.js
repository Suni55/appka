// ─── INIT ──────────────────────────────────────────────────
    // Jednorazowe czyszczenie starych danych synchronizacji
    if (localStorage.getItem('syncCode')) {
        localStorage.removeItem('syncCode');
        localStorage.removeItem('syncRole');
    }

    try {
        initDarkMode();
        initNotifications();
        updateRecipeHistory(currentPlan);
        restoreCustomRecipes();
        renderToday();
        renderCalendar();
        initShopDates();   // DOM jest gotowy — skrypty ładowane po </body>
    } catch (err) {
        console.error('[App] Błąd podczas inicjalizacji UI:', err);
    }

    // initSync jest async — uruchamiamy po inicjalizacji UI
    // Supabase SDK jest ładowane synchronicznie przed app.js, więc jest dostępne
    initSync().catch(err => console.error('[App] Błąd synchronizacji przy starcie:', err));
