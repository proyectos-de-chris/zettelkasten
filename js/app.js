document.addEventListener('DOMContentLoaded', () => {
    // --- Configuración y Detección de Página ---
    const pagePath = window.location.pathname;
    const isIndexPage = pagePath.endsWith('index.html') || pagePath.endsWith('/');
    const isWikiPage = pagePath.endsWith('wiki.html');
    const isSearchPage = pagePath.endsWith('search.html');
    const isConfigPage = pagePath.endsWith('configuracion.html');
    
    let wikiData = [];
    let hasUnsavedChanges = false;
    let isSortByRecent = true;
    let allTags = [];
    let pinnedPages = [];
    let converter;
    
    // --- Advertencia antes de cerrar la página si hay cambios sin guardar ---
    let isInternalNavigation = false;
	document.addEventListener('click', (event) => {
	    const link = event.target.closest('a');
	    if (link) {
		const href = link.getAttribute('href');
		// ¡CONDICIÓN CORREGIDA!
		// index.html ya no se considera navegación interna "segura".
		if (href && (href.includes('wiki.html') || href.includes('search.html') || href.includes('configuracion.html'))) {
		    isInternalNavigation = true;
		}
	    }
	});
	window.addEventListener('beforeunload', (event) => {
	    if (isInternalNavigation) {
		isInternalNavigation = false;
		return;
	    }
	    const unsavedChanges = sessionStorage.getItem('hasUnsavedChanges') === 'true';
	    if (unsavedChanges) {
		event.preventDefault();
		event.returnValue = '';
		return '';
	    }
	});
    
    

    // --- Lógica de la Página de Inicio (index.html) ---
    if (isIndexPage) {
        document.getElementById('new-wiki').addEventListener('click', () => {
            sessionStorage.setItem('wikiData', JSON.stringify([]));
            window.location.href = 'wiki.html';
        });
        document.getElementById('load-wiki-input').addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        sessionStorage.setItem('wikiData', JSON.stringify(data));
                        window.location.href = 'wiki.html';
                    } catch (error) { alert('Error al leer el fichero JSON.'); }
                };
                reader.readAsText(file);
            }
        });
        document.getElementById('initial-load-input').addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const textContent = e.target.result;
                        const parsedData = parseInitialText(textContent);
                        sessionStorage.setItem('wikiData', JSON.stringify(parsedData));
                        window.location.href = 'wiki.html';
                    } catch (error) {
                        alert('Error al procesar el fichero de texto.');
                        console.error(error);
                    }
                };
                reader.readAsText(file);
            }
        });
    }

    // --- Lógica de la Página de Wiki (wiki.html) ---
    if (isWikiPage) {
        converter = new showdown.Converter({
            tables: true, strikethrough: true, tasklists: true,
            smoothLivePreview: true, simplifiedAutoLink: true
        });
        isSortByRecent = sessionStorage.getItem('sortByRecent') !== 'false';
        loadWikiData();
        loadPinnedPages();
        populateAllTags();
        displayAllPages();
        updateUnsavedIndicator();
        updateSortButtonText();
        renderPinnedSidebar();
        document.getElementById('search-input').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            if (searchTerm.trim() === '') { displayAllPages(); return; }
            const filteredPages = wikiData.filter(page =>
                page.title.toLowerCase().includes(searchTerm) ||
                page.content.toLowerCase().includes(searchTerm) ||
                (page.tags || []).some(tag => tag.toLowerCase().includes(searchTerm))
            );
            displayPages(filteredPages);
        });
        document.getElementById('home-link').addEventListener('click', (e) => {
            if (hasUnsavedChanges) {
                if (!confirm('Tienes cambios sin guardar que se perderán. ¿Quieres continuar?')) {
                    e.preventDefault();
                }
            }
        });
        document.getElementById('new-page-btn').addEventListener('click', () => showEditor());
        document.getElementById('download-json-btn').addEventListener('click', downloadJson);
        document.getElementById('toggle-sort-btn').addEventListener('click', () => {
            isSortByRecent = !isSortByRecent;
            sessionStorage.setItem('sortByRecent', isSortByRecent);
            updateSortButtonText();
            displayAllPages();
        });
    }
    
    // --- Lógica de la Página de Búsqueda Avanzada (search.html) ---
    if (isSearchPage) {
        converter = new showdown.Converter({ tables: true, strikethrough: true, tasklists: true });
        loadWikiData();
        loadPinnedPages();
        populateAllTags();
        setupTagAutocomplete('include-tags', 'include-tags-suggestions');
        setupTagAutocomplete('exclude-tags', 'exclude-tags-suggestions');
        document.addEventListener("click", (e) => closeAllLists(e.target));
        renderPinnedSidebar();
        const urlParams = new URLSearchParams(window.location.search);
        const includeTagsParam = urlParams.get('include_tags');
        if (includeTagsParam) {
            document.getElementById('include-tags').value = includeTagsParam;
            performAdvancedSearch();
        }
        document.getElementById('perform-search-btn').addEventListener('click', performAdvancedSearch);
        document.getElementById('recover-search-btn').addEventListener('click', recoverLastSearch);
    }
    
    // --- ¡NUEVO! Lógica para la Página de Configuración (configuracion.html) ---
    if (isConfigPage) {
        let mergeCandidates = { newPages: [], updatedPages: [] };
        loadWikiData();

        // Módulo 1: Fusionar
        const mergeFileInput = document.getElementById('merge-file-input');
        mergeFileInput.addEventListener('change', handleMergeFileSelect);
        
        function handleMergeFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const externalData = JSON.parse(e.target.result);
                    compareDatabases(wikiData, externalData);
                } catch (error) {
                    alert('Error: El fichero seleccionado no es un JSON válido.');
                }
            };
            reader.readAsText(file);
        }

        function compareDatabases(currentDb, externalDb) {
            const currentMap = new Map(currentDb.map(p => [p.id, p]));
            mergeCandidates = { newPages: [], updatedPages: [] };

            for (const externalPage of externalDb) {
                const currentPage = currentMap.get(externalPage.id);
                if (!currentPage) {
                    // La página existe en el fichero externo pero no en el actual
                    mergeCandidates.newPages.push(externalPage);
                } else {
                    // La página existe en ambos. Comprobar cuál es más reciente.
                    const lastHistoryCurrent = currentPage.history?.[0]?.timestamp;
                    const lastHistoryExternal = externalPage.history?.[0]?.timestamp;
                    if (lastHistoryExternal > lastHistoryCurrent) {
                        mergeCandidates.updatedPages.push(externalPage);
                    }
                }
            }
            renderMergeSummary();
        }

        function renderMergeSummary() {
            const summaryDiv = document.getElementById('merge-summary');
            const contentDiv = document.getElementById('merge-summary-content');
            contentDiv.innerHTML = '';

            if (mergeCandidates.newPages.length === 0 && mergeCandidates.updatedPages.length === 0) {
                contentDiv.innerHTML = '<p>No se encontraron entradas nuevas o más recientes en el fichero cargado.</p>';
                document.getElementById('confirm-merge-btn').classList.add('hidden');
            } else {
                if (mergeCandidates.newPages.length > 0) {
                    contentDiv.innerHTML += `<p><strong>${mergeCandidates.newPages.length} entrada(s) nueva(s)</strong> para añadir:</p><ul>${mergeCandidates.newPages.map(p => `<li>${p.title} (ID: ${p.id})</li>`).join('')}</ul>`;
                }
                if (mergeCandidates.updatedPages.length > 0) {
                    contentDiv.innerHTML += `<p><strong>${mergeCandidates.updatedPages.length} entrada(s) existente(s)</strong> que se actualizarán por ser más recientes:</p><ul>${mergeCandidates.updatedPages.map(p => `<li>${p.title} (ID: ${p.id})</li>`).join('')}</ul>`;
                }
                document.getElementById('confirm-merge-btn').classList.remove('hidden');
                document.getElementById('confirm-merge-btn').onclick = performMerge;
            }
            summaryDiv.classList.remove('hidden');
        }

        function performMerge() {
            const currentMap = new Map(wikiData.map(p => [p.id, p]));
            // Añadir páginas nuevas
            mergeCandidates.newPages.forEach(p => wikiData.push(p));
            // Actualizar páginas existentes
            mergeCandidates.updatedPages.forEach(p => {
                const index = wikiData.findIndex(cp => cp.id === p.id);
                if (index > -1) {
                    wikiData[index] = p;
                }
            });
            saveWikiData();
            alert(`Fusión completada: ${mergeCandidates.newPages.length} entrada(s) añadida(s) y ${mergeCandidates.updatedPages.length} actualizada(s).\nLa página se recargará para aplicar los cambios.`);
            window.location.reload();
        }

        // Módulo 2: Purgar Historial
        document.getElementById('purge-history-btn').addEventListener('click', () => {
            if (confirm('¿Estás SEGURO de que quieres eliminar TODO el historial de cambios? Esta acción es irreversible.')) {
                wikiData.forEach(page => page.history = []);
                saveWikiData();
                alert('Historial de cambios eliminado con éxito.');
            }
        });

        // Módulo 3: Comprobar Errores
        document.getElementById('check-errors-btn').addEventListener('click', () => {
            const duplicates = findDuplicateTitles();
            const brokenLinks = findBrokenLinks();
            renderErrorResults(duplicates, brokenLinks);
        });

        function findDuplicateTitles() {
            const titles = new Map();
            const duplicates = [];
            wikiData.forEach(page => {
                if (titles.has(page.title)) {
                    const existingId = titles.get(page.title);
                    // Asegurarse de añadir el par solo una vez
                    if (!duplicates.some(d => d.ids.includes(existingId) && d.ids.includes(page.id))) {
                        duplicates.push({ title: page.title, ids: [existingId, page.id] });
                    } else {
                        const existingGroup = duplicates.find(d => d.title === page.title);
                        existingGroup.ids.push(page.id);
                    }
                } else {
                    titles.set(page.title, page.id);
                }
            });
            return duplicates;
        }

        function findBrokenLinks() {
            const validIds = new Set(wikiData.map(p => p.id));
            const broken = [];
            const linkRegex = /\[.*?\]\((\d{14,17})\)/g;

            wikiData.forEach(sourcePage => {
                const matches = [...sourcePage.content.matchAll(linkRegex)];
                matches.forEach(match => {
                    const linkedId = match[1];
                    if (!validIds.has(linkedId)) {
                        broken.push({
                            sourceTitle: sourcePage.title,
                            sourceId: sourcePage.id,
                            brokenId: linkedId
                        });
                    }
                });
            });
            return broken;
        }

        function renderErrorResults(duplicates, brokenLinks) {
            const resultsDiv = document.getElementById('error-results');
            const contentDiv = document.getElementById('error-results-content');
            contentDiv.innerHTML = '';

            if (duplicates.length === 0 && brokenLinks.length === 0) {
                contentDiv.innerHTML = '<p>¡Enhorabuena! No se encontraron errores conocidos en la base de datos.</p>';
            } else {
                if (duplicates.length > 0) {
                    contentDiv.innerHTML += `<p><strong>Títulos Duplicados Encontrados:</strong></p><ul>${duplicates.map(d => `<li>El título "${d.title}" está repetido en los IDs: ${d.ids.join(', ')}</li>`).join('')}</ul>`;
                }
                if (brokenLinks.length > 0) {
                    contentDiv.innerHTML += `<p><strong>Enlaces Internos Rotos Encontrados:</strong></p><ul>${brokenLinks.map(l => `<li>La página "${l.sourceTitle}" (ID: ${l.sourceId}) enlaza a un ID no existente: ${l.brokenId}</li>`).join('')}</ul>`;
                }
            }
            resultsDiv.classList.remove('hidden');
        }
    }

    // --- FUNCIONES DE AUTOCOMPLETADO ---
    function populateAllTags() {
        const tagSet = new Set();
        wikiData.forEach(page => {
            (page.tags || []).forEach(tag => { tagSet.add(tag.substring(1)); });
        });
        allTags = Array.from(tagSet).sort();
    }
    function setupTagAutocomplete(inputId, suggestionsId) {
    const input = document.getElementById(inputId);
    const suggestionsContainer = document.getElementById(suggestionsId);
    if (!input || !suggestionsContainer) return;

    input.addEventListener('input', function() {
        const val = this.value;
        const parts = val.split(' ');
        const currentTerm = parts[parts.length - 1].replace('#', '');
        
        closeAllLists();
        if (!currentTerm) return false;

        const suggestions = allTags.filter(tag => tag.toLowerCase().startsWith(currentTerm.toLowerCase()));
        
        suggestions.forEach(tag => {
            const suggestionDiv = document.createElement('div');
            suggestionDiv.innerHTML = `<strong>${tag.substr(0, currentTerm.length)}</strong>${tag.substr(currentTerm.length)}`;
            
            suggestionDiv.addEventListener('click', function() {
                // ¡ESTA ES LA LÍNEA DE CORRECCIÓN!
                // Ahora comprueba si el input es uno de los campos de etiquetas y añade '#'
                const prefix = (inputId === 'tags-input' || inputId === 'modal-tags-input') ? '#' : '';
                parts[parts.length - 1] = prefix + tag;
                input.value = parts.join(' ') + ' ';
                closeAllLists();
                input.focus();
            });
            suggestionsContainer.appendChild(suggestionDiv);
        });
    });
}
    function closeAllLists(elmnt) {
    const items = document.getElementsByClassName("autocomplete-items");
    for (let i = 0; i < items.length; i++) {
        // Añadido '#modal-tags-input' a la condición
        if (elmnt !== items[i] && elmnt !== document.getElementById('include-tags') && elmnt !== document.getElementById('exclude-tags') && elmnt !== document.getElementById('tags-input') && elmnt !== document.getElementById('modal-tags-input')) {
            items[i].innerHTML = "";
        }
    }
}

    // --- Funciones de Datos ---
    function loadWikiData() {
        const data = sessionStorage.getItem('wikiData');
        if (data) { wikiData = JSON.parse(data); }
        hasUnsavedChanges = sessionStorage.getItem('hasUnsavedChanges') === 'true';
    }
    function saveWikiData() {
        sessionStorage.setItem('wikiData', JSON.stringify(wikiData));
        hasUnsavedChanges = true;
        sessionStorage.setItem('hasUnsavedChanges', 'true');
        updateUnsavedIndicator();
    }
    function loadPinnedPages() {
        pinnedPages = JSON.parse(sessionStorage.getItem('pinnedPages')) || [];
    }
    function savePinnedPages() {
        sessionStorage.setItem('pinnedPages', JSON.stringify(pinnedPages));
    }

    // --- Funciones de Renderizado y UI ---
    function displayAllPages() {
        let pagesToShow;
        if (isSortByRecent) {
            pagesToShow = [...wikiData].sort((a, b) => {
                const timeA = a.history?.[0]?.timestamp;
                const timeB = b.history?.[0]?.timestamp;
                if (timeA && !timeB) return -1;
                if (!timeA && timeB) return 1;
                if (timeA && timeB) {
                    const dateDiff = new Date(timeB) - new Date(timeA);
                    if (dateDiff !== 0) return dateDiff;
                }
                return b.id.localeCompare(a.id);
            });
        } else {
            pagesToShow = [...wikiData];
            for (let i = pagesToShow.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pagesToShow[i], pagesToShow[j]] = [pagesToShow[j], pagesToShow[i]];
            }
        }
        displayPages(pagesToShow);
    }
    function displayPages(pages, containerId = 'wiki-content') {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        if (isWikiPage || isSearchPage) {
            if(document.getElementById('page-view')) document.getElementById('page-view').classList.add('hidden');
            if(document.getElementById('editor-view')) document.getElementById('editor-view').classList.add('hidden');
            container.classList.remove('hidden');
        }
        let pagesToShow = pages;
        const isMainListPage = (containerId === 'wiki-content');
        if (isMainListPage && pages.length > 15) { pagesToShow = pages.slice(0, 15); }
        if (pagesToShow.length === 0) { container.innerHTML = '<p>No se encontraron páginas.</p>'; return; }
        pagesToShow.forEach(page => {
            const pageElement = document.createElement('div');
            pageElement.className = 'page-list-item';
            pageElement.dataset.id = page.id;
            let tagsHtml = '';
            if (page.tags && page.tags.length > 0) { tagsHtml = `<div class="page-list-tags">${page.tags.map(tag => `<span>${tag}</span>`).join('')}</div>`; }
            const isPinned = pinnedPages.some(p => p.id === page.id);
            pageElement.innerHTML = `<div class="page-list-item-content"><div><span class="page-list-item-id">${page.id}</span><span class="page-list-item-title">${page.title}</span></div>${tagsHtml}</div><button class="pin-btn ${isPinned ? 'pinned' : ''}" data-id="${page.id}" title="Guardar esta página">💾</button>`;
            pageElement.addEventListener('click', () => {
                if (isSearchPage) { sessionStorage.setItem('showPageId', page.id); window.location.href = 'wiki.html'; }
                else { showPage(page.id); }
            });
            pageElement.querySelector('.pin-btn').addEventListener('click', (e) => { e.stopPropagation(); togglePinPage(page.id); });
            container.appendChild(pageElement);
        });
        if (isMainListPage && pages.length > 15) {
            const morePagesInfo = document.createElement('p');
            morePagesInfo.className = 'more-pages-info';
            morePagesInfo.textContent = `Mostrando 15 páginas de un total de ${pages.length}. Usa la búsqueda para encontrar más.`;
            container.appendChild(morePagesInfo);
        }
    }
    if (isWikiPage) {
        const pageIdToShow = sessionStorage.getItem('showPageId');
        if (pageIdToShow) { sessionStorage.removeItem('showPageId'); showPage(pageIdToShow); }
    }
    function renderPinnedSidebar() {
        const sidebar = document.getElementById('pinned-sidebar');
        const container = document.getElementById('pinned-items-container');
        if (!sidebar || !container) return;
        if (pinnedPages.length === 0) { sidebar.classList.add('hidden'); return; }
        sidebar.classList.remove('hidden');
        container.innerHTML = '';
        pinnedPages.forEach(page => {
            const item = document.createElement('div');
            item.className = 'pinned-item';
            item.innerHTML = `<a href="#" class="pinned-item-title" data-id="${page.id}">${page.title}</a><button class="unpin-btn" data-id="${page.id}">✕</button>`;
            container.appendChild(item);
        });
        container.querySelectorAll('.pinned-item-title').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (isWikiPage) { showPage(e.target.dataset.id); }
                else { sessionStorage.setItem('showPageId', e.target.dataset.id); window.location.href = 'wiki.html'; }
            });
        });
        container.querySelectorAll('.unpin-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { togglePinPage(e.target.dataset.id); });
        });
        document.getElementById('clear-pins-btn').addEventListener('click', () => {
            pinnedPages = [];
            savePinnedPages();
            renderPinnedSidebar();
            if (isWikiPage) displayAllPages();
            if (isSearchPage) performAdvancedSearch();
        });
    }
    
    function showPage(id) {
        const page = wikiData.find(p => p.id === id);
        if (!page) return;
    
        const pageView = document.getElementById('page-view');
        document.getElementById('wiki-content').classList.add('hidden');
        document.getElementById('editor-view').classList.add('hidden');
        pageView.classList.remove('hidden');
    
        const htmlContent = converter.makeHtml(page.content);
        const backlinks = findBacklinks(page.id);
        let backlinksHtml = '';
        if (backlinks.length > 0) {
            backlinksHtml = `<div class="backlinks-section"><h3>Enlaces entrantes</h3><ul>${backlinks.map(link => `<li><a href="#" class="backlink" data-id="${link.id}">${link.title}</a> (ID: ${link.id})</li>`).join('')}</ul></div>`;
        }
    
        const isPinned = pinnedPages.some(p => p.id === page.id);
    
        pageView.innerHTML = `
            <nav>
                <button id="edit-page-btn" class="btn">Editar</button>
                <button id="delete-page-btn" class="btn">Eliminar</button>
                <button id="history-page-btn" class="btn">Ver Cambios</button>
                <button id="back-to-main-btn" class="btn">Volver a la lista</button>
            </nav>
            <div class="page-title-header">
                <h1>${page.title}</h1>
                <button class="pin-btn ${isPinned ? 'pinned' : ''}" data-id="${page.id}" title="Guardar esta página">💾</button>
            </div>
            <p><em>ID: ${page.id}</em></p>
            <div class="page-content">${htmlContent}</div>
            <div class="tags">${(page.tags || []).map(tag => `<a href="search.html?include_tags=${tag.substring(1)}">${tag}</a>`).join(' ')}</div>
            ${backlinksHtml}
        `;
    
        pageView.querySelector('#edit-page-btn').addEventListener('click', () => showEditor(id));
        pageView.querySelector('#delete-page-btn').addEventListener('click', () => deletePage(id));
        pageView.querySelector('#history-page-btn').addEventListener('click', () => showHistory(id));
        pageView.querySelector('#back-to-main-btn').addEventListener('click', displayAllPages);
    
        pageView.querySelector('.pin-btn').addEventListener('click', (e) => {
            togglePinPage(e.target.dataset.id);
        });
        
        pageView.querySelectorAll('.backlink').forEach(link => {
            link.addEventListener('click', (e) => { e.preventDefault(); showPage(link.dataset.id); });
        });
        pageView.querySelectorAll('.page-content a').forEach(link => {
            const href = link.getAttribute('href');
            if (href && /^\d{14,17}$/.test(href)) {
                link.addEventListener('click', (e) => { e.preventDefault(); showPage(href); });
            }
        });
    }

    // ¡MODIFICADO! Añade el botón "Crear y Enlazar"
    function showEditor(id = null) {
        const editorView = document.getElementById('editor-view');
        document.getElementById('wiki-content').classList.add('hidden');
        document.getElementById('page-view').classList.add('hidden');
        editorView.classList.remove('hidden');
        const page = id ? wikiData.find(p => p.id === id) : null;
        const escapedTitle = page ? page.title.replace(/"/g, '&quot;') : '';
        const tagsValue = page && page.tags ? page.tags.join(' ') : '';
        editorView.innerHTML = `
            <nav>
                <button id="save-page-btn" class="btn">Guardar</button>
                <button id="cancel-edit-btn" class="btn">Cancelar</button>
            </nav>
            <div class="editor-actions">
                <button id="create-link-btn" class="btn">Crear y Enlazar nueva entrada...</button>
            </div>
            <input type="text" id="title-input" placeholder="Título de la página" value="${escapedTitle}">
            <textarea id="content-input" placeholder="Contenido en Markdown... ej: [enlace](2024...)">${page ? page.content : ''}</textarea>
            <div class="form-group" style="margin-top: 10px;">
                <label for="tags-input" style="font-weight: normal; margin-bottom: 5px;">Etiquetas separadas por espacios, ej: #tag1 #tag2</label>
                <div class="autocomplete-container">
                    <input type="text" id="tags-input" value="${tagsValue}" autocomplete="off">
                    <div id="editor-tags-suggestions" class="autocomplete-items"></div>
                </div>
            </div>
            <input type="hidden" id="page-id-input" value="${id || ''}">
        `;
        editorView.querySelector('#save-page-btn').addEventListener('click', savePage);
        editorView.querySelector('#cancel-edit-btn').addEventListener('click', () => { if (id) showPage(id); else displayAllPages(); });
        
        // Listener para el nuevo botón
        editorView.querySelector('#create-link-btn').addEventListener('click', openLinkCreatorModal);

        setupTagAutocomplete('tags-input', 'editor-tags-suggestions');
        document.addEventListener("click", (e) => closeAllLists(e.target));
    }

    // ¡NUEVA! Abre el modal para crear la sub-entrada
    function openLinkCreatorModal() {
    const modal = document.getElementById('link-creator-modal');
    const defaultModalContent = `- ECLI:\n- Tribunal: Tribunal Supremo. Sala de lo Contencioso. Sección\n- Ponente:\n- Resumen: `;

    modal.innerHTML = `
        <div class="modal-content">
            <h2>Crear Nueva Entrada para Enlazar</h2>
            <div class="form-group">
                <label for="modal-title-input">Título de la nueva entrada</label>
                <input type="text" id="modal-title-input" placeholder="Título...">
            </div>
            <div class="form-group">
                <label for="modal-content-input">Contenido (opcional)</label>
                <textarea id="modal-content-input">${defaultModalContent}</textarea>
            </div>
            <div class="form-group">
                <label for="modal-tags-input">Etiquetas (opcional)</label>
                <div class="autocomplete-container">
                    <input type="text" id="modal-tags-input" placeholder="#tag1 #tag2..." autocomplete="off">
                    <div id="modal-tags-suggestions" class="autocomplete-items"></div>
                </div>
            </div>
            <div class="actions">
                <button id="modal-save-link-btn" class="btn">Guardar y Obtener Enlace</button>
                <button id="modal-cancel-btn" class="btn">Cancelar</button>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');

    modal.querySelector('#modal-save-link-btn').addEventListener('click', saveAndGetLink);
    modal.querySelector('#modal-cancel-btn').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    // Activar autocompletado para el campo de etiquetas del modal
    setupTagAutocomplete('modal-tags-input', 'modal-tags-suggestions');
    }

    // ¡NUEVA! Guarda la sub-entrada e inserta el enlace en el editor principal
    function saveAndGetLink() {
        const title = document.getElementById('modal-title-input').value.trim();
        const content = document.getElementById('modal-content-input').value.trim();
        const tags = document.getElementById('modal-tags-input').value.split(' ').filter(t => t.startsWith('#'));

        if (!title) {
            alert('El título de la nueva entrada no puede estar vacío.');
            return;
        }

        // 1. Crear y guardar la nueva página
        const newPage = {
            id: generateId(),
            title: title,
            content: content,
            tags: tags,
            history: [{ timestamp: new Date().toISOString(), before: { title: "Página Creada", content: "", tags: [] } }]
        };
        wikiData.push(newPage);
        saveWikiData(); // Guardar el estado completo de la wiki
        populateAllTags(); // Actualizar la lista de tags por si hay nuevos

        // 2. Crear el texto del enlace Markdown
        const linkText = `[${newPage.title}](${newPage.id})`;

        // 3. Insertar el enlace en el textarea principal
        const mainContentTextarea = document.getElementById('content-input');
        const cursorPos = mainContentTextarea.selectionStart;
        const textBefore = mainContentTextarea.value.substring(0, cursorPos);
        const textAfter = mainContentTextarea.value.substring(cursorPos);
        mainContentTextarea.value = textBefore + linkText + textAfter;

        // 4. Cerrar el modal y enfocar el textarea
        document.getElementById('link-creator-modal').classList.add('hidden');
        mainContentTextarea.focus();
        mainContentTextarea.selectionEnd = cursorPos + linkText.length; // Colocar cursor al final del enlace insertado
    }
    
    function updateUnsavedIndicator() {
        if (isWikiPage) {
            const indicator = document.getElementById('unsaved-indicator');
            if (hasUnsavedChanges) indicator.classList.remove('hidden'); else indicator.classList.add('hidden');
        }
    }
    function updateSortButtonText() {
        if (isWikiPage) {
            const sortBtn = document.getElementById('toggle-sort-btn');
            sortBtn.textContent = isSortByRecent ? 'Ordenar por: Reciente' : 'Ordenar por: Aleatorio';
        }
    }

    // --- Funciones de Lógica de la Aplicación ---
    function togglePinPage(pageId) {
        const pageIndex = pinnedPages.findIndex(p => p.id === pageId);
        if (pageIndex > -1) { pinnedPages.splice(pageIndex, 1); }
        else {
            const page = wikiData.find(p => p.id === pageId);
            if (page) { pinnedPages.push({ id: page.id, title: page.title }); }
        }
        savePinnedPages();
        renderPinnedSidebar();
        const pinButtonInList = document.querySelector(`.page-list-item .pin-btn[data-id="${pageId}"]`);
        if(pinButtonInList) { pinButtonInList.classList.toggle('pinned', pageIndex === -1); }
        const pinButtonInView = document.querySelector(`.page-title-header .pin-btn[data-id="${pageId}"]`);
        if(pinButtonInView) { pinButtonInView.classList.toggle('pinned', pageIndex === -1); }
    }
    function findBacklinks(targetPageId) {
        const backlinks = [];
        const regex = new RegExp(`\\[[^\\]]+\\]\\(${targetPageId}\\)`, 'g');
        wikiData.forEach(sourcePage => {
            if (sourcePage.id !== targetPageId && sourcePage.content.match(regex)) {
                backlinks.push({ id: sourcePage.id, title: sourcePage.title });
            }
        });
        return backlinks;
    }
    function generateId() {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}${String(d.getMilliseconds()).padStart(3, '0')}`;
    }
    function savePage() {
        const id = document.getElementById('page-id-input').value;
        const title = document.getElementById('title-input').value.trim();
        const content = document.getElementById('content-input').value;
        const tags = document.getElementById('tags-input').value.split(' ').filter(t => t.startsWith('#'));
        if (!title) { alert('El título no puede estar vacío.'); return; }
        let pageIdToDisplay;
        if (id) {
            pageIdToDisplay = id;
            const pageIndex = wikiData.findIndex(p => p.id === id);
            if (pageIndex > -1) {
                const oldPage = { ...wikiData[pageIndex] };
                const newHistoryEntry = { timestamp: new Date().toISOString(), before: { title: oldPage.title, content: oldPage.content, tags: oldPage.tags } };
                if (!wikiData[pageIndex].history) wikiData[pageIndex].history = [];
                wikiData[pageIndex].history.unshift(newHistoryEntry);
                wikiData[pageIndex] = { ...wikiData[pageIndex], title, content, tags };
            }
        } else {
            pageIdToDisplay = generateId();
            const newPage = { id: pageIdToDisplay, title, content, tags, history: [{ timestamp: new Date().toISOString(), before: { title: "Página Creada", content: "", tags: [] } }] };
            wikiData.push(newPage);
        }
        saveWikiData();
        populateAllTags();
        showPage(pageIdToDisplay);
    }
    function deletePage(id) {
        if (confirm('¿Estás seguro de que quieres eliminar esta página?')) {
            wikiData = wikiData.filter(p => p.id !== id);
            saveWikiData();
            populateAllTags();
            displayAllPages();
        }
    }
    function generateFileTimestamp() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }
    function downloadJson() {
        const timestamp = generateFileTimestamp();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(wikiData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `wiki_${timestamp}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        hasUnsavedChanges = false;
        sessionStorage.setItem('hasUnsavedChanges', 'false');
        updateUnsavedIndicator();
    }
    function performAdvancedSearch() {
        const searchParams = {
            id: document.getElementById('search-id').value,
            includeText: document.getElementById('include-text').value,
            excludeText: document.getElementById('exclude-text').value,
            includeTags: document.getElementById('include-tags').value,
            excludeTags: document.getElementById('exclude-tags').value
        };
        sessionStorage.setItem('lastSearch', JSON.stringify(searchParams));
        const results = wikiData.filter(page => {
            const pageText = (page.title + ' ' + page.content).toLowerCase();
            if (searchParams.id && page.id !== searchParams.id) return false;
            if (searchParams.includeText && !pageText.includes(searchParams.includeText.toLowerCase())) return false;
            if (searchParams.excludeText && searchParams.excludeText && pageText.includes(searchParams.excludeText.toLowerCase())) return false;
            const includeTagsArr = searchParams.includeTags.split(' ').filter(Boolean).map(t => `#${t}`);
            if (includeTagsArr.length > 0 && !includeTagsArr.every(tag => (page.tags || []).includes(tag))) return false;
            const excludeTagsArr = searchParams.excludeTags.split(' ').filter(Boolean).map(t => `#${t}`);
            if (excludeTagsArr.length > 0 && excludeTagsArr.some(tag => (page.tags || []).includes(tag))) return false;
            return true;
        });
        document.getElementById('search-results-info').textContent = `Se han encontrado ${results.length} resultado(s).`;
        displayPages(results, 'search-results');
    }
    function recoverLastSearch() {
        const lastSearch = JSON.parse(sessionStorage.getItem('lastSearch'));
        if (lastSearch) {
            document.getElementById('search-id').value = lastSearch.id || '';
            document.getElementById('include-text').value = lastSearch.includeText || '';
            document.getElementById('exclude-text').value = lastSearch.excludeText || '';
            document.getElementById('include-tags').value = lastSearch.includeTags || '';
            document.getElementById('exclude-tags').value = lastSearch.excludeTags || '';
            performAdvancedSearch();
        } else { alert('No hay ninguna búsqueda anterior guardada en esta sesión.'); }
    }
    function showHistory(id) {
        const page = wikiData.find(p => p.id === id);
        const modal = document.getElementById('history-modal');
        if (!page || !modal) return;
        let contentHtml = `<div class="modal-content"><h2>Historial de Cambios: ${page.title}</h2>`;
        if (!page.history || page.history.length === 0) {
            contentHtml += '<p>No hay cambios registrados para esta página.</p>';
        } else {
            let previousContent = page.content;
            let previousTags = page.tags;
            page.history.forEach(entry => {
                const date = new Date(entry.timestamp).toLocaleString('es-ES');
                let changesHtml = '';
                if (entry.before.title === 'Página Creada') {
                    changesHtml += `<p><strong>Página Creada</strong></p>`;
                }
                const oldTags = (entry.before.tags || []).join(' ');
                const currentTags = (previousTags || []).join(' ');
                if (oldTags !== currentTags && entry.before.title !== 'Página Creada') {
                     changesHtml += `<p><strong>Etiquetas cambiadas:</strong></p><div class="history-diff-view"><span class="diff-removed">${oldTags}</span><br><span class="diff-added">${currentTags}</span></div>`;
                }
                const diff = Diff.diffChars(entry.before.content, previousContent);
                let diffHtml = diff.map(part => {
                    const value = part.value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    if (part.added) return `<span class="diff-added">${value}</span>`;
                    if (part.removed) return `<span class="diff-removed">${value}</span>`;
                    return value;
                }).join('');
                if (diff.length > 1 || entry.before.title === 'Página Creada') {
                     changesHtml += `<p><strong>Cambios de contenido:</strong></p><div class="history-diff-view">${diffHtml}</div>`;
                }
                if(changesHtml) {
                    contentHtml += `<div class="history-item"><p>Modificado el: ${date}</p>${changesHtml}</div>`;
                }
                previousContent = entry.before.content;
                previousTags = entry.before.tags;
            });
        }
        contentHtml += `<button id="close-modal-btn" class="btn">Cerrar</button></div>`;
        modal.innerHTML = contentHtml;
        modal.classList.remove('hidden');
        modal.querySelector('#close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    }
    function parseInitialText(text) {
        const pages = [];
        const entries = text.split('>>>').filter(entry => entry.trim() && !entry.trim().startsWith('- -'));
        entries.forEach(entry => {
            if (entry.includes('#')) {
                const lines = entry.trim().split('\n');
                const id = lines[0].trim();
                const title = lines[1].substring(1).trim();
                let contentLines = [];
                for(let i = 2; i < lines.length; i++) {
                    if (lines[i].startsWith('tags:')) break;
                    contentLines.push(lines[i]);
                }
                const content = contentLines.join('\n').trim();
                const tagsLine = lines.find(l => l.startsWith('tags:'));
                const tags = tagsLine ? tagsLine.substring(5).trim().split(' ').filter(t => t.startsWith('#')) : [];
                if (id && title) {
                    const creationHistory = {
                        timestamp: new Date().toISOString(),
                        before: { title: "Página Creada", content: "Contenido inicial cargado.", tags: [] }
                    };
                    pages.push({ id, title, content, tags, history: [creationHistory] });
                }
            }
        });
        return pages;
    }
});
