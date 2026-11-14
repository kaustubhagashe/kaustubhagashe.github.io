/*
 * Puzzle & game catalogue controller.
 * To add a puzzle or game, add a section with data-puzzle-panel="unique-id" and data-title="Title".
 * The dropdown is built automatically and kept in alphabetical order (ignoring a leading "The").
 * Games that need setup register themselves with Games.register(id, { init(host), show(), hide() }).
 */
(() => {
    const selector = document.getElementById('puzzle-select');
    const panels = Array.from(document.querySelectorAll('[data-puzzle-panel]'));
    if (!selector || !panels.length) return;
    const key = t => t.replace(/^the\s+/i, '').toLowerCase();
    const sorted = panels.slice().sort((a, b) => key(a.dataset.title).localeCompare(key(b.dataset.title)));
    selector.innerHTML = '';
    sorted.forEach(panel => {
        const option = document.createElement('option');
        option.value = panel.dataset.puzzlePanel;
        option.textContent = panel.dataset.title;
        selector.appendChild(option);
    });

    let current = null;
    const stored = () => { try { return localStorage.getItem('puzzle-last'); } catch (e) { return null; } };
    function showPuzzle(id, push) {
        let panel = panels.find(p => p.dataset.puzzlePanel === id) || sorted[0];
        const gid = panel.dataset.puzzlePanel;
        if (current && current !== panel && window.Games) window.Games.hide(current.dataset.puzzlePanel);
        current = panel;
        selector.value = gid;
        panels.forEach(p => { const on = p === panel; p.hidden = !on; p.setAttribute('aria-hidden', String(!on)); });
        if (window.Games) window.Games.show(gid, panel);
        try { localStorage.setItem('puzzle-last', gid); } catch (e) { }
        if (push && history.replaceState) history.replaceState(null, '', '#' + gid);
    }
    selector.addEventListener('change', () => showPuzzle(selector.value, true));
    window.addEventListener('hashchange', () => showPuzzle(location.hash.slice(1), false));
    showPuzzle(location.hash.slice(1) || stored() || sorted[0].dataset.puzzlePanel, false);
})();
