// App State
let state = {
  currentView: 'public', // 'public' | 'admin'
  authToken: localStorage.getItem('dt_auth_token') || null,
  matchData: null,
  activeFilter: 'both', // 'both' | 'home' | 'away'
  userPitchOrientation: 'auto', // 'auto' | 'horizontal' | 'vertical'
  isDragging: false,
  hasDragged: false,
  dragTarget: null,
  dragOffset: { x: 0, y: 0 },
  allPresets: {},
  selectedPlayerIds: new Set()
};

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupDragAndDrop();
});

window.addEventListener('resize', () => {
  if (state.userPitchOrientation === 'auto') {
    renderAll();
  }
});

async function initApp() {
  if (state.authToken) {
    updateAuthUI(true);
  }
  await fetchMatchData();
}

async function fetchMatchData() {
  try {
    const res = await fetch('/api/match/current');
    const json = await res.json();

    if (json.success && json.data) {
      state.matchData = json.data;
      state.allPresets = json.data.allPresets || {};
      renderAll();
    } else {
      showToast('Error cargando los datos del partido.', 'error');
    }
  } catch (err) {
    console.error('Error fetching match:', err);
    showToast('Error de conexión con el servidor.', 'error');
  }
}

// Render Master Component
function renderAll() {
  if (!state.matchData) return;

  const { match, homeStarters, homeSubstitutes, awayStarters, awaySubstitutes, ball, availableHomePresets, availableAwayPresets } = state.matchData;

  // 1. Fill Public Match Info Top Bar
  document.getElementById('displayTitle').innerText = match.title || 'Partido de Fútbol';
  document.getElementById('displayDateTime').innerText = `${match.date || '-'} • ${match.time || '-'}`;
  document.getElementById('displayLocation').innerText = match.location || '-';

  document.getElementById('matchFormatBadge').innerText = match.format || '11v11';
  document.getElementById('matchFormationBadge').innerText = `Fríos: ${match.formation_name || '4-3-3'}`;
  document.getElementById('matchFormationAwayBadge').innerText = `Cálidos: ${match.rival_formation_name || '4-4-2'}`;

  // 2. Fill Admin Form
  if (state.currentView === 'admin') {
    document.getElementById('inputTitle').value = match.title || '';
    document.getElementById('inputDate').value = match.date || '';
    document.getElementById('inputTime').value = match.time || '';
    document.getElementById('inputFormat').value = match.format || '11v11';
    document.getElementById('inputLocation').value = match.location || '';

    renderPresetButtons('homePresetButtons', availableHomePresets, 'home');
    renderPresetButtons('awayPresetButtons', availableAwayPresets, 'away');
  }

  // 3. Render Tactical Tokens on Horizontal Pitch
  renderPitchTokens(homeStarters, awayStarters, ball);

  // 4. Render Squad Lists & Substitutes Below the Pitch (Parallel Columns)
  renderSquadGridList('homeStartersList', homeStarters, 'home');
  renderSquadGridList('awayStartersList', awayStarters, 'away');

  // Handle Home Substitutes
  const homeSubsSec = document.getElementById('homeSubstitutesSection');
  if (homeSubstitutes && homeSubstitutes.length > 0) {
    homeSubsSec.classList.remove('hidden');
    renderSquadGridList('homeSubstitutesList', homeSubstitutes, 'home');
  } else {
    homeSubsSec.classList.add('hidden');
  }

  // Handle Away Substitutes
  const awaySubsSec = document.getElementById('awaySubstitutesSection');
  if (awaySubstitutes && awaySubstitutes.length > 0) {
    awaySubsSec.classList.remove('hidden');
    renderSquadGridList('awaySubstitutesList', awaySubstitutes, 'away');
  } else {
    awaySubsSec.classList.add('hidden');
  }

  // Total Player Count Badges
  const totalHomeCount = (homeStarters ? homeStarters.length : 0) + (homeSubstitutes ? homeSubstitutes.length : 0);
  const totalAwayCount = (awayStarters ? awayStarters.length : 0) + (awaySubstitutes ? awaySubstitutes.length : 0);
  
  document.getElementById('homeTotalCountBadge').innerText = `${totalHomeCount} Jugadores`;
  document.getElementById('awayTotalCountBadge').innerText = `${totalAwayCount} Jugadores`;

  updateBulkActionBar();
}

// Preset Buttons Generator
function renderPresetButtons(containerId, presetList, team) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!presetList || presetList.length === 0) {
    container.innerHTML = '<span class="text-muted" style="font-size:0.75rem;">Sin alineaciones predefinidas</span>';
    return;
  }

  const currentPreset = team === 'home' ? state.matchData.match.formation_name : state.matchData.match.rival_formation_name;

  container.innerHTML = presetList.map(name => `
    <button type="button" 
      class="preset-btn ${team === 'away' ? 'away-preset' : ''} ${name === currentPreset ? 'active' : ''}" 
      onclick="applyFormationPreset('${team}', '${name}')">
      ${name}
    </button>
  `).join('');
}

function isVerticalPitchMode() {
  const wrapper = document.getElementById('tacticalBoardExportWrapper');
  if (!wrapper) return false;

  if (state.userPitchOrientation === 'vertical') return true;
  if (state.userPitchOrientation === 'horizontal') return false;

  // Auto detect: mobile screen <= 768px defaults to vertical mode
  return window.innerWidth <= 768;
}

function togglePitchOrientation() {
  const wrapper = document.getElementById('tacticalBoardExportWrapper');
  if (!wrapper) return;

  const isCurrentlyVertical = isVerticalPitchMode();

  if (isCurrentlyVertical) {
    state.userPitchOrientation = 'horizontal';
    wrapper.classList.remove('vertical-pitch-mode');
    wrapper.classList.add('horizontal-forced');
    const textEl = document.getElementById('textOrientation');
    const iconEl = document.getElementById('iconOrientation');
    if (textEl) textEl.innerText = 'Cancha Vertical';
    if (iconEl) iconEl.className = 'fa-solid fa-mobile-screen-button';
  } else {
    state.userPitchOrientation = 'vertical';
    wrapper.classList.add('vertical-pitch-mode');
    wrapper.classList.remove('horizontal-forced');
    const textEl = document.getElementById('textOrientation');
    const iconEl = document.getElementById('iconOrientation');
    if (textEl) textEl.innerText = 'Cancha Horizontal';
    if (iconEl) iconEl.className = 'fa-solid fa-display';
  }

  renderAll();
  showToast(state.userPitchOrientation === 'vertical' ? 'Vista Vertical activada' : 'Vista Horizontal activada', 'info');
}

// Render Players and Ball on SVG Pitch
function renderPitchTokens(homeStarters, awayStarters, ball) {
  const layer = document.getElementById('pitchTokensLayer');
  if (!layer) return;
  layer.innerHTML = '';

  const wrapper = document.getElementById('tacticalBoardExportWrapper');
  const isVertical = isVerticalPitchMode();

  if (wrapper) {
    if (isVertical) {
      wrapper.classList.add('vertical-pitch-mode');
      wrapper.classList.remove('horizontal-forced');
    } else {
      wrapper.classList.remove('vertical-pitch-mode');
      wrapper.classList.add('horizontal-forced');
    }
  }

  const filter = state.activeFilter;

  // Render Home Team (Colores Fríos - BLUE)
  if ((filter === 'both' || filter === 'home') && homeStarters) {
    homeStarters.forEach(player => {
      layer.appendChild(createPlayerTokenElement(player, 'home'));
    });
  }

  // Render Away Team (Colores Cálidos - RED)
  if ((filter === 'both' || filter === 'away') && awayStarters) {
    awayStarters.forEach(player => {
      layer.appendChild(createPlayerTokenElement(player, 'away'));
    });
  }

  // Render Ball Token
  if (ball) {
    const ballEl = document.createElement('div');
    ballEl.className = 'ball-token';
    ballEl.dataset.type = 'ball';
    if (isVertical) {
      ballEl.style.top = `${ball.pos_x}%`;
      ballEl.style.left = `${ball.pos_y}%`;
    } else {
      ballEl.style.left = `${ball.pos_x}%`;
      ballEl.style.top = `${ball.pos_y}%`;
    }
    ballEl.innerHTML = '<i class="fa-solid fa-futbol"></i>';
    layer.appendChild(ballEl);
  }
}

// Create Player Token DOM Node
function createPlayerTokenElement(player, team) {
  const token = document.createElement('div');
  token.className = `player-token team-${team} ${state.currentView === 'admin' ? 'admin-mode' : ''}`;
  token.dataset.id = player.id;
  token.dataset.type = 'player';
  token.dataset.team = team;

  const isVertical = isVerticalPitchMode();
  if (isVertical) {
    token.style.top = `${player.pos_x}%`;
    token.style.left = `${player.pos_y}%`;
  } else {
    token.style.left = `${player.pos_x}%`;
    token.style.top = `${player.pos_y}%`;
  }

  const captainBadgeHtml = player.is_captain == 1 ? `<div class="captain-badge" title="Capitán (C)">C</div>` : '';

  token.innerHTML = `
    <div class="token-circle">
      ${player.number}
      <span class="role-tag">${player.role}</span>
      ${captainBadgeHtml}
    </div>
    <div class="token-label" title="${escapeHtml(player.name)}">${player.is_captain == 1 ? '© ' : ''}${escapeHtml(player.name)}</div>
  `;

  // Click handler: Open Trading Card
  token.addEventListener('click', (e) => {
    if (state.hasDragged) return; // Ignore if user dragged token
    openTradingCardModal(player);
  });

  if (state.currentView === 'admin') {
    token.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      openEditPlayerModal(player);
    });
  }

  return token;
}

// Render Squad Grid Lists with Checkbox & Trading Card Trigger
function renderSquadGridList(containerId, playersList, team) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!playersList || playersList.length === 0) {
    container.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-muted); padding: 0.4rem;">Sin jugadores</div>';
    return;
  }

  const numberClass = team === 'home' ? 'home-number' : 'away-number';
  const isAdmin = state.currentView === 'admin';

  container.innerHTML = playersList.map(p => {
    const isSelected = state.selectedPlayerIds.has(p.id);
    return `
      <div class="squad-item ${isSelected ? 'selected' : ''}" id="squadItem_${p.id}" onclick="handleSquadItemClick(event, ${p.id})">
        <div class="player-info-meta">
          ${isAdmin ? `
            <input type="checkbox" 
              class="player-select-cb" 
              data-id="${p.id}" 
              ${isSelected ? 'checked' : ''} 
              onclick="event.stopPropagation()"
              onchange="togglePlayerSelection(${p.id}, this.checked)">
          ` : ''}
          <span class="squad-number ${numberClass}">${p.number}</span>
          <span class="squad-name">${p.is_captain == 1 ? '<span style="color:var(--accent-amber); font-weight:800;" title="Capitán (C)">© </span>' : ''}${escapeHtml(p.name)}</span>
          <span class="squad-role-tag">${p.role}</span>
        </div>
        <div class="squad-item-actions">
          <button class="btn-icon" onclick="event.stopPropagation(); openTradingCardModalById(${p.id})" title="Ver Lámina Mundialista">
            <i class="fa-solid fa-id-card" style="color:var(--accent-amber);"></i>
          </button>
          ${isAdmin ? `
            <button class="btn-icon" onclick="event.stopPropagation(); openEditPlayerModalById(${p.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function handleSquadItemClick(event, playerId) {
  if (event.target.tagName === 'INPUT' || event.target.closest('button')) return;
  if (state.currentView === 'admin') {
    openEditPlayerModalById(playerId);
  } else {
    openTradingCardModalById(playerId);
  }
}

// World Cup Style Trading Card Modal ("Lámina del Mundial")
function openTradingCardModal(player) {
  const card = document.getElementById('footballTradingCard');
  card.className = `football-card ${player.team === 'away' ? 'away-card-theme' : 'home-card-theme'}`;

  // Team & Dorsal
  const teamText = player.team === 'away' ? 'COLORES CÁLIDOS' : 'COLORES FRÍOS';
  document.getElementById('cardTeamTag').innerText = teamText;
  document.getElementById('cardDorsalBadge').innerText = `#${player.number}`;

  // Photo / Avatar
  const photoImg = document.getElementById('cardPhotoImg');
  const avatarFallback = document.getElementById('cardAvatarFallback');

  if (player.photo_url && player.photo_url.trim().length > 5) {
    photoImg.src = player.photo_url;
    photoImg.classList.remove('hidden');
    avatarFallback.classList.add('hidden');
  } else {
    photoImg.classList.add('hidden');
    avatarFallback.classList.remove('hidden');
  }

  // Role Pill
  const roleNames = {
    'GK': 'ARQUERO (GK)',
    'DEF': 'DEFENSA (DEF)',
    'MID': 'MEDIOCAMPISTA (MID)',
    'FWD': 'DELANTERO (FWD)'
  };
  document.getElementById('cardRolePill').innerText = roleNames[player.role] || player.role;

  // Captain Badge
  const capBadgeEl = document.getElementById('cardCaptainBadge');
  if (capBadgeEl) {
    if (player.is_captain == 1) {
      capBadgeEl.classList.remove('hidden');
    } else {
      capBadgeEl.classList.add('hidden');
    }
  }

  // Name & Nickname Badge
  document.getElementById('cardPlayerName').innerText = player.name;
  
  const nicknameBadge = document.getElementById('cardNicknameBadge');
  if (nicknameBadge) {
    const nick = (player.nickname && player.nickname.trim()) ? player.nickname.trim() : (player.role || 'CRACK');
    nicknameBadge.innerText = `⭐ "${nick.toUpperCase().replace(/^"|"$/g, '')}"`;
  }

  // Bio / Description
  const bioText = document.getElementById('cardPlayerBio');
  bioText.innerText = (player.description && player.description.trim()) ? player.description : 'Sin biografía asignada.';

  state.currentCardPlayerId = player.id;
  const adminAction = document.getElementById('cardAdminAction');
  if (state.currentView === 'admin' && adminAction) {
    adminAction.classList.remove('hidden');
  } else if (adminAction) {
    adminAction.classList.add('hidden');
  }

  document.getElementById('tradingCardModal').classList.add('active');
}

function handleEditFromTradingCard() {
  closeTradingCardModal();
  if (state.currentCardPlayerId) {
    openEditPlayerModalById(state.currentCardPlayerId);
  }
}

function openTradingCardModalById(id) {
  const allPlayers = getAllPlayersList();
  const player = allPlayers.find(p => p.id === id);
  if (player) openTradingCardModal(player);
}

function closeTradingCardModal() {
  document.getElementById('tradingCardModal').classList.remove('active');
}

function getAllPlayersList() {
  if (!state.matchData) return [];
  return [
    ...(state.matchData.homeStarters || []),
    ...(state.matchData.homeSubstitutes || []),
    ...(state.matchData.awayStarters || []),
    ...(state.matchData.awaySubstitutes || [])
  ];
}

// CSV Import Modal & Parsing Logic
function openCsvModal() {
  document.getElementById('csvImportModal').classList.add('active');
}

function closeCsvModal() {
  document.getElementById('csvImportModal').classList.remove('active');
  document.getElementById('csvRawText').value = '';
  document.getElementById('csvFileInput').value = '';
}

function handleCsvFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    document.getElementById('csvRawText').value = evt.target.result;
    showToast('Archivo CSV cargado en el área de texto.', 'info');
  };
  reader.readAsText(file);
}

async function processCsvImport() {
  if (!state.authToken || !state.matchData) return;

  const rawText = document.getElementById('csvRawText').value.trim();
  if (!rawText) {
    showToast('Por favor ingrese o seleccione un contenido CSV válido.', 'error');
    return;
  }

  const lines = rawText.split(/\r?\n/);
  const playersToImport = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = trimmed.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    
    // Ignore header line if present
    if (index === 0 && (cols[0].toLowerCase().includes('nombre') || cols[0].toLowerCase().includes('name'))) {
      return;
    }

    if (cols.length >= 1 && cols[0]) {
      const name = cols[0];
      const number = parseInt(cols[1]) || (index + 1);
      const role = (cols[2] || 'MID').toUpperCase();
      const team = (cols[3] && (cols[3].toLowerCase() === 'away' || cols[3].toLowerCase().includes('rojo') || cols[3].toLowerCase().includes('calid'))) ? 'away' : 'home';
      const nickname = cols[4] || '';
      const description = cols[5] || '';
      const photo_url = cols[6] || '';

      playersToImport.push({
        name,
        number,
        role: ['GK','DEF','MID','FWD'].includes(role) ? role : 'MID',
        team,
        nickname,
        description,
        photo_url,
        is_starter: 1
      });
    }
  });

  if (playersToImport.length === 0) {
    showToast('No se pudieron extraer jugadores del CSV.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/players/import-csv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.authToken}`
      },
      body: JSON.stringify({
        match_id: state.matchData.match.id,
        players: playersToImport
      })
    });

    const json = await res.json();
    if (json.success) {
      state.matchData = json.data;
      renderAll();
      closeCsvModal();
      showToast(json.message, 'success');
    } else {
      showToast(json.message || 'Error al importar CSV.', 'error');
    }
  } catch (err) {
    console.error('Error importing CSV:', err);
    showToast('Error de conexión.', 'error');
  }
}

// Bulk Selection & Deletion Logic
function togglePlayerSelection(playerId, isChecked) {
  if (isChecked) {
    state.selectedPlayerIds.add(playerId);
  } else {
    state.selectedPlayerIds.delete(playerId);
  }

  const itemEl = document.getElementById(`squadItem_${playerId}`);
  if (itemEl) {
    itemEl.classList.toggle('selected', isChecked);
  }

  updateBulkActionBar();
}

function clearPlayerSelections() {
  state.selectedPlayerIds.clear();
  document.querySelectorAll('.player-select-cb').forEach(cb => cb.checked = false);
  document.querySelectorAll('.squad-item').forEach(item => item.classList.remove('selected'));
  updateBulkActionBar();
}

function updateBulkActionBar() {
  const bar = document.getElementById('bulkActionBar');
  const countText = document.getElementById('selectedCountText');

  if (state.currentView === 'admin' && state.selectedPlayerIds.size > 0) {
    bar.classList.remove('hidden');
    countText.innerText = state.selectedPlayerIds.size;
  } else {
    bar.classList.add('hidden');
  }
}

async function executeBulkDelete() {
  if (!state.authToken || !state.matchData) return;
  const ids = Array.from(state.selectedPlayerIds);
  if (ids.length === 0) return;

  if (!confirm(`¿Eliminar los ${ids.length} jugadores seleccionados de la plantilla?`)) return;

  try {
    const res = await fetch('/api/admin/players/bulk-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.authToken}`
      },
      body: JSON.stringify({
        match_id: state.matchData.match.id,
        ids: ids
      })
    });

    const json = await res.json();
    if (json.success) {
      state.matchData = json.data;
      clearPlayerSelections();
      renderAll();
      showToast(json.message, 'success');
    } else {
      showToast(json.message || 'Error al eliminar selección.', 'error');
    }
  } catch (err) {
    console.error('Error executing bulk delete:', err);
    showToast('Error al conectar con el servidor.', 'error');
  }
}

async function confirmClearAllPlayers() {
  if (!state.authToken || !state.matchData) return;

  if (!confirm('⚠️ ¿Estás COMPLETAMENTE seguro de vaciar toda la plantilla? Esto borrará a todos los jugadores de ambos equipos.')) return;

  try {
    const res = await fetch('/api/admin/players/clear-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.authToken}`
      },
      body: JSON.stringify({
        match_id: state.matchData.match.id
      })
    });

    const json = await res.json();
    if (json.success) {
      state.matchData = json.data;
      clearPlayerSelections();
      renderAll();
      showToast('Plantilla vaciada exitosamente.', 'success');
    } else {
      showToast(json.message || 'Error al vaciar plantilla.', 'error');
    }
  } catch (err) {
    console.error('Error clearing all players:', err);
    showToast('Error de conexión.', 'error');
  }
}

// Color Guide Modal Handlers
function openColorGuideModal() {
  document.getElementById('colorGuideModal').classList.add('active');
}

function closeColorGuideModal() {
  document.getElementById('colorGuideModal').classList.remove('active');
}

// Filter Switcher
function setTeamFilter(filter) {
  state.activeFilter = filter;
  document.querySelectorAll('.view-toggle-btn').forEach(btn => btn.classList.remove('active'));

  if (filter === 'both') document.getElementById('btnFilterBoth').classList.add('active');
  if (filter === 'home') document.getElementById('btnFilterHome').classList.add('active');
  if (filter === 'away') document.getElementById('btnFilterAway').classList.add('active');

  const pitchTag = document.getElementById('pitchModeTag');
  const pitchSub = document.getElementById('pitchSubtitle');

  if (filter === 'both') {
    pitchTag.innerHTML = '<i class="fa-solid fa-eye"></i> Pizarra Enfrentada (Colores Fríos vs Cálidos)';
    pitchSub.innerText = 'Cancha Horizontal • Fichas Azules (Colores Fríos) vs Fichas Rojas (Colores Cálidos)';
  } else if (filter === 'home') {
    pitchTag.innerHTML = '<i class="fa-solid fa-shirt"></i> Pizarra Táctica (Colores Fríos - Azul)';
    pitchSub.innerText = 'Cancha Horizontal • Visualizando solo el Equipo Azul';
  } else {
    pitchTag.innerHTML = '<i class="fa-solid fa-shirt"></i> Pizarra Táctica (Colores Cálidos - Rojo)';
    pitchSub.innerText = 'Cancha Horizontal • Visualizando solo el Equipo Rojo';
  }

  renderAll();
}

// Drag & Drop Engine
function setupDragAndDrop() {
  const canvas = document.getElementById('pitchCanvas');

  canvas.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', drag);
  window.addEventListener('mouseup', endDrag);

  canvas.addEventListener('touchstart', startDrag, { passive: false });
  window.addEventListener('touchmove', drag, { passive: false });
  window.addEventListener('touchend', endDrag);
}

function startDrag(e) {
  if (state.currentView !== 'admin') return;

  const targetToken = e.target.closest('[data-type="player"], [data-type="ball"]');
  if (!targetToken) return;

  state.isDragging = true;
  state.hasDragged = false;
  state.dragTarget = targetToken;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  const rect = targetToken.getBoundingClientRect();
  state.dragOffset = {
    x: clientX - (rect.left + rect.width / 2),
    y: clientY - (rect.top + rect.height / 2)
  };
}

function drag(e) {
  if (!state.isDragging || !state.dragTarget) return;
  e.preventDefault();

  state.hasDragged = true;

  const canvas = document.getElementById('pitchCanvas');
  const rect = canvas.getBoundingClientRect();

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  let x = ((clientX - state.dragOffset.x - rect.left) / rect.width) * 100;
  let y = ((clientY - state.dragOffset.y - rect.top) / rect.height) * 100;

  x = Math.max(2, Math.min(98, x));
  y = Math.max(2, Math.min(98, y));

  state.dragTarget.style.left = `${x}%`;
  state.dragTarget.style.top = `${y}%`;
}

function endDrag() {
  if (!state.isDragging) return;
  state.isDragging = false;
  state.dragTarget = null;
}

// Save Squad & Ball Positions
async function saveSquadPositions() {
  if (!state.authToken || !state.matchData) return;

  const isVertical = isVerticalPitchMode();
  const playerTokens = document.querySelectorAll('#pitchTokensLayer .player-token');
  const ballToken = document.querySelector('#pitchTokensLayer .ball-token');

  const playersData = [];
  playerTokens.forEach(tok => {
    const id = parseInt(tok.dataset.id);
    const posX = isVertical ? parseFloat(tok.style.top) : parseFloat(tok.style.left);
    const posY = isVertical ? parseFloat(tok.style.left) : parseFloat(tok.style.top);
    const team = tok.dataset.team;

    const allPlayers = getAllPlayersList();
    const existing = allPlayers.find(p => p.id === id);

    if (existing) {
      playersData.push({
        ...existing,
        pos_x: isNaN(posX) ? existing.pos_x : posX,
        pos_y: isNaN(posY) ? existing.pos_y : posY,
        team: team
      });
    }
  });

  let ballData = { pos_x: 50, pos_y: 50 };
  if (ballToken) {
    const posX = isVertical ? parseFloat(ballToken.style.top) : parseFloat(ballToken.style.left);
    const posY = isVertical ? parseFloat(ballToken.style.left) : parseFloat(ballToken.style.top);
    ballData = {
      pos_x: isNaN(posX) ? 50 : posX,
      pos_y: isNaN(posY) ? 50 : posY
    };
  }

  try {
    const res = await fetch('/api/admin/match/squad', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.authToken}`
      },
      body: JSON.stringify({
        match_id: state.matchData.match.id,
        players: playersData,
        ball: ballData
      })
    });

    const json = await res.json();
    if (json.success) {
      state.matchData = json.data;
      renderAll();
      showToast('Pizarra táctica guardada.', 'success');
    } else {
      showToast(json.message || 'Error guardando pizarra.', 'error');
    }
  } catch (err) {
    console.error('Error saving squad:', err);
    showToast('Error guardando alineación.', 'error');
  }
}

// Add Match Event to Google Calendar
function addToGoogleCalendar() {
  if (!state.matchData || !state.matchData.match) {
    showToast('Información del partido no disponible.', 'error');
    return;
  }

  const match = state.matchData.match;
  const title = match.title ? `Partido de Fútbol: ${match.title}` : 'Partido de Fútbol DT Pishangas';
  const location = match.location || 'Cancha por confirmar';

  let dateStr = match.date || '';
  let timeStr = match.time || '20:00';

  if (!dateStr) {
    const today = new Date();
    dateStr = today.toISOString().split('T')[0];
  }

  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '').padEnd(6, '0').slice(0, 6);

  const startDateTime = `${cleanDate}T${cleanTime}`;

  let endDateTime = `${cleanDate}T${String(parseInt(cleanTime.slice(0,2)) + 1).padStart(2, '0')}${cleanTime.slice(2,6)}`;
  try {
    const startDateObj = new Date(`${dateStr}T${timeStr.length === 5 ? timeStr + ':00' : timeStr}`);
    if (!isNaN(startDateObj.getTime())) {
      const endDateObj = new Date(startDateObj.getTime() + 60 * 60 * 1000); // 1 hora de duración
      const endYear = endDateObj.getFullYear();
      const endMonth = String(endDateObj.getMonth() + 1).padStart(2, '0');
      const endDay = String(endDateObj.getDate()).padStart(2, '0');
      const endHour = String(endDateObj.getHours()).padStart(2, '0');
      const endMin = String(endDateObj.getMinutes()).padStart(2, '0');
      endDateTime = `${endYear}${endMonth}${endDay}T${endHour}${endMin}00`;
    }
  } catch (err) {
    console.error('Error calculating end time:', err);
  }

  const details = `⚽ Partido de Fútbol (${match.format || 'Fútbol'})\n👕 Colores Fríos (Azul/Negro) vs Colores Cálidos (Rojo/Blanco)\n\n📍 Lugar: ${location}\n📋 Organizado desde DT Pishangas.`;

  const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDateTime}/${endDateTime}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;

  window.open(googleCalUrl, '_blank');
}

// Apply Preset Formation
async function applyFormationPreset(team, presetName) {
  if (!state.authToken || !state.matchData) return;

  try {
    const res = await fetch('/api/admin/match/preset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.authToken}`
      },
      body: JSON.stringify({
        match_id: state.matchData.match.id,
        format: state.matchData.match.format,
        team: team,
        formation_name: presetName
      })
    });

    const json = await res.json();
    if (json.success) {
      state.matchData = json.data;
      renderAll();
      showToast(json.message, 'success');
    } else {
      showToast(json.message || 'Error al aplicar alineación.', 'error');
    }
  } catch (err) {
    console.error('Error applying preset:', err);
    showToast('Error aplicando formación.', 'error');
  }
}

// Format Change in Admin Form
function handleFormatChange() {
  const newFormat = document.getElementById('inputFormat').value;
  const presets = state.allPresets[newFormat] || {};
  const homePresets = presets.home ? Object.keys(presets.home) : [];
  const awayPresets = presets.away ? Object.keys(presets.away) : [];

  renderPresetButtons('homePresetButtons', homePresets, 'home');
  renderPresetButtons('awayPresetButtons', awayPresets, 'away');
}

// Save Match Details Form
async function saveMatchDetails(e) {
  e.preventDefault();
  if (!state.authToken || !state.matchData) return;

  const payload = {
    id: state.matchData.match.id,
    title: document.getElementById('inputTitle').value,
    date: document.getElementById('inputDate').value,
    time: document.getElementById('inputTime').value,
    opponent: 'Colores Cálidos',
    format: document.getElementById('inputFormat').value,
    location: document.getElementById('inputLocation').value,
    formation_name: state.matchData.match.formation_name,
    rival_formation_name: state.matchData.match.rival_formation_name
  };

  try {
    const res = await fetch('/api/admin/match', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.authToken}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (json.success) {
      state.matchData = json.data;
      renderAll();
      showToast('Configuración del partido guardada.', 'success');
    } else {
      showToast(json.message || 'Error al guardar.', 'error');
    }
  } catch (err) {
    console.error('Error updating match details:', err);
    showToast('Error de conexión.', 'error');
  }
}

// Modal Handlers (Add / Edit Player)
function openAddPlayerModal() {
  document.getElementById('playerModalTitle').innerHTML = '<i class="fa-solid fa-user-plus"></i> Agregar Jugador';
  document.getElementById('editPlayerId').value = '';
  document.getElementById('editPlayerName').value = '';
  document.getElementById('editPlayerNickname').value = '';
  document.getElementById('editPlayerNumber').value = '10';
  document.getElementById('editPlayerRole').value = 'MID';
  document.getElementById('editPlayerTeam').value = 'home';
  document.getElementById('editPlayerStatus').value = 'starter';
  document.getElementById('editPlayerPhotoUrl').value = '';
  document.getElementById('editPlayerPhotoFile').value = '';
  document.getElementById('editPlayerDescription').value = '';
  document.getElementById('editPlayerIsCaptain').checked = false;
  document.getElementById('btnDeletePlayer').style.display = 'none';

  resetPhotoPreview();
  updateCharCounter();
  document.getElementById('playerModal').classList.add('active');
}

function openEditPlayerModal(player) {
  document.getElementById('playerModalTitle').innerHTML = '<i class="fa-solid fa-user-pen"></i> Editar Jugador';
  document.getElementById('editPlayerId').value = player.id;
  document.getElementById('editPlayerName').value = player.name;
  document.getElementById('editPlayerNickname').value = player.nickname || '';
  document.getElementById('editPlayerNumber').value = player.number;
  document.getElementById('editPlayerRole').value = player.role;
  document.getElementById('editPlayerTeam').value = player.team || 'home';
  document.getElementById('editPlayerStatus').value = player.is_starter ? 'starter' : 'sub';
  document.getElementById('editPlayerPhotoUrl').value = player.photo_url || '';
  document.getElementById('editPlayerPhotoFile').value = '';
  document.getElementById('editPlayerDescription').value = player.description || '';
  document.getElementById('editPlayerIsCaptain').checked = player.is_captain == 1;
  document.getElementById('btnDeletePlayer').style.display = 'block';

  if (player.photo_url && player.photo_url.trim().length > 0) {
    showPhotoPreview(player.photo_url);
  } else {
    resetPhotoPreview();
  }

  updateCharCounter();
  document.getElementById('playerModal').classList.add('active');
}

function updateCharCounter() {
  const descEl = document.getElementById('editPlayerDescription');
  const badgeEl = document.getElementById('charCountBadge');
  if (!descEl || !badgeEl) return;

  const count = descEl.value.length;
  badgeEl.innerText = `${count} / 150 caracteres`;
  if (count >= 130) {
    badgeEl.style.color = 'var(--accent-red)';
  } else if (count >= 50) {
    badgeEl.style.color = 'var(--accent-emerald)';
  } else {
    badgeEl.style.color = 'var(--accent-amber)';
  }
}

function applyDescPreset(presetText) {
  const descEl = document.getElementById('editPlayerDescription');
  if (!descEl) return;
  descEl.value = presetText;
  updateCharCounter();
}

async function uploadPlayerPhotoFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    const base64Data = evt.target.result;

    // Asignar Base64 inmediatamente para vista previa instantánea y respaldo de guardado
    document.getElementById('editPlayerPhotoUrl').value = base64Data;
    showPhotoPreview(base64Data);

    if (!state.authToken) {
      showToast('Imagen lista para guardar.', 'info');
      return;
    }

    try {
      const res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.authToken}`
        },
        body: JSON.stringify({ image: base64Data })
      });

      const json = await res.json();
      if (json.success && json.url) {
        document.getElementById('editPlayerPhotoUrl').value = json.url;
        showPhotoPreview(json.url);
        showToast('¡Imagen guardada exitosamente en el servidor!', 'success');
      }
    } catch (err) {
      console.error('Error subiendo imagen:', err);
      // Mantiene la versión Base64 funcional en caso de algún fallo de red
    }
  };

  reader.readAsDataURL(file);
}

function updatePhotoPreviewFromUrl() {
  const url = document.getElementById('editPlayerPhotoUrl').value.trim();
  if (url.length > 5) {
    showPhotoPreview(url);
  } else {
    resetPhotoPreview();
  }
}

function showPhotoPreview(url) {
  const box = document.getElementById('photoPreviewBox');
  const img = document.getElementById('photoPreviewImg');
  if (box && img) {
    img.src = url;
    box.classList.remove('hidden');
  }
}

function resetPhotoPreview() {
  const box = document.getElementById('photoPreviewBox');
  const img = document.getElementById('photoPreviewImg');
  if (box && img) {
    img.src = '';
    box.classList.add('hidden');
  }
}

function openEditPlayerModalById(id) {
  const allPlayers = getAllPlayersList();
  const player = allPlayers.find(p => p.id === id);
  if (player) openEditPlayerModal(player);
}

function closePlayerModal() {
  document.getElementById('playerModal').classList.remove('active');
}

// Save / Add Player Submit
async function handleSavePlayer(e) {
  e.preventDefault();
  const id = document.getElementById('editPlayerId').value;
  const name = document.getElementById('editPlayerName').value;
  const nickname = document.getElementById('editPlayerNickname').value;
  const number = document.getElementById('editPlayerNumber').value;
  const role = document.getElementById('editPlayerRole').value;
  const team = document.getElementById('editPlayerTeam').value;
  const is_starter = document.getElementById('editPlayerStatus').value === 'starter';
  const photo_url = document.getElementById('editPlayerPhotoUrl').value;
  const description = document.getElementById('editPlayerDescription').value;
  const is_captain = document.getElementById('editPlayerIsCaptain').checked ? 1 : 0;

  const isEdit = !!id;
  const url = isEdit ? `/api/admin/players/${id}` : '/api/admin/players';
  const method = isEdit ? 'PUT' : 'POST';

  const payload = {
    match_id: state.matchData.match.id,
    team,
    name,
    nickname,
    number,
    role,
    is_starter,
    photo_url,
    description,
    is_captain
  };

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.authToken}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (json.success) {
      state.matchData = json.data;
      renderAll();
      closePlayerModal();
      showToast(json.message, 'success');
    } else {
      showToast(json.message || 'Error guardando jugador.', 'error');
    }
  } catch (err) {
    console.error('Error saving player:', err);
    showToast('Error de conexión.', 'error');
  }
}

// Delete Single Player
async function handleDeletePlayer() {
  const id = document.getElementById('editPlayerId').value;
  if (!id) return;

  if (!confirm('¿Seguro que deseas eliminar este jugador?')) return;

  try {
    const res = await fetch(`/api/admin/players/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.authToken}`
      }
    });

    const json = await res.json();
    if (json.success) {
      state.matchData = json.data;
      renderAll();
      closePlayerModal();
      showToast('Jugador eliminado.', 'success');
    } else {
      showToast(json.message, 'error');
    }
  } catch (err) {
    console.error('Error deleting player:', err);
    showToast('Error al eliminar.', 'error');
  }
}

// Auth Handlers
function handleAuthAction() {
  if (state.authToken) {
    state.authToken = null;
    localStorage.removeItem('dt_auth_token');
    updateAuthUI(false);
    switchView('public');
    showToast('Sesión de DT cerrada.', 'info');
  } else {
    document.getElementById('loginModal').classList.add('active');
    document.getElementById('adminPass').focus();
  }
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('active');
  document.getElementById('loginErrorMsg').style.display = 'none';
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const password = document.getElementById('adminPass').value;
  const errorMsg = document.getElementById('loginErrorMsg');
  errorMsg.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const json = await res.json();
    if (json.success) {
      state.authToken = json.token;
      localStorage.setItem('dt_auth_token', json.token);
      updateAuthUI(true);
      switchView('admin');
      showToast('¡Bienvenido DT! Modo edición activado.', 'success');
    } else {
      errorMsg.innerText = json.message || 'Contraseña incorrecta.';
      errorMsg.style.display = 'block';
    }
  } catch (err) {
    console.error('Error in login:', err);
    errorMsg.innerText = 'Error de conexión con el servidor.';
    errorMsg.style.display = 'block';
  }
}

function updateAuthUI(isLoggedIn) {
  const lockBadge = document.getElementById('lockBadge');
  const authBtnText = document.getElementById('authBtnText');

  if (isLoggedIn) {
    lockBadge.innerHTML = '<i class="fa-solid fa-lock-open" style="color:var(--accent-emerald);"></i>';
    authBtnText.innerText = 'Cerrar Sesión';
  } else {
    lockBadge.innerHTML = '<i class="fa-solid fa-lock"></i>';
    authBtnText.innerText = 'Acceso DT';
  }
}

// Switch View Modes
function switchView(view) {
  if (view === 'admin' && !state.authToken) {
    handleAuthAction();
    return;
  }

  state.currentView = view;
  document.getElementById('btnModePublic').classList.toggle('active', view === 'public');
  document.getElementById('btnModeAdmin').classList.toggle('active', view === 'admin');

  document.getElementById('publicMatchCard').classList.toggle('hidden', view === 'admin');
  document.getElementById('adminMatchForm').classList.toggle('hidden', view === 'public');
  document.getElementById('pitchControlsAdmin').style.display = view === 'admin' ? 'block' : 'none';

  clearPlayerSelections();
  renderAll();
}

// Export Board to PNG
async function exportTacticalSheet() {
  showToast('Generando imagen de alta resolución...', 'info');

  const wrapper = document.getElementById('tacticalBoardExportWrapper');
  const banner = document.getElementById('exportBanner');

  document.getElementById('expTitle').innerText = `${state.matchData.match.title} (Colores Fríos vs Cálidos)`;
  document.getElementById('expMeta').innerText = `${state.matchData.match.date} • ${state.matchData.match.time} • ${state.matchData.match.location}`;
  banner.style.display = 'block';

  try {
    const canvas = await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#0b0f19'
    });

    banner.style.display = 'none';

    const link = document.createElement('a');
    link.download = `Pizarra_Tactica_Frios_vs_Calidos.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    showToast('¡Imagen descargada exitosamente!', 'success');
  } catch (err) {
    console.error('Error exporting image:', err);
    banner.style.display = 'none';
    showToast('Error al exportar la imagen.', 'error');
  }
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${escapeHtml(message)}`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
