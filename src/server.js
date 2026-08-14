const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { db, FORMATION_PRESETS_HORIZONTAL } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_futbol_key_2026';

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(uploadsDir));

// JWT Auth Middleware
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Acceso no autorizado. Inicie sesión.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Sesión expirada o token inválido.' });
  }
}

// Helper to get number of starter players from format string "7v7" -> 7
function getStartersCountFromFormat(formatStr) {
  const match = (formatStr || '11v11').match(/^(\d+)v\d+$/);
  return match ? parseInt(match[1]) : 11;
}

// Helper to map starter players to formation preset coordinates by player role (preserving role)
function mapStartersToPreset(starters, presetCoords) {
  if (!starters || starters.length === 0 || !presetCoords || presetCoords.length === 0) return [];
  
  const availablePresetSlots = presetCoords.map(slot => ({ ...slot, used: false }));
  const assignments = [];
  const unassignedPlayers = [];

  // Match players by exact role match
  starters.forEach(player => {
    const role = (player.role || 'MID').toUpperCase();
    const slotIndex = availablePresetSlots.findIndex(s => !s.used && s.role === role);
    if (slotIndex !== -1) {
      availablePresetSlots[slotIndex].used = true;
      assignments.push({
        id: player.id,
        pos_x: availablePresetSlots[slotIndex].pos_x,
        pos_y: availablePresetSlots[slotIndex].pos_y
      });
    } else {
      unassignedPlayers.push(player);
    }
  });

  // Assign any remaining players to unused preset slots
  unassignedPlayers.forEach(player => {
    const slotIndex = availablePresetSlots.findIndex(s => !s.used);
    if (slotIndex !== -1) {
      availablePresetSlots[slotIndex].used = true;
      assignments.push({
        id: player.id,
        pos_x: availablePresetSlots[slotIndex].pos_x,
        pos_y: availablePresetSlots[slotIndex].pos_y
      });
    }
  });

  return assignments;
}

// Helper to get full match payload
function getMatchPayload(matchId) {
  let match;
  if (matchId) {
    match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  }
  if (!match) {
    match = db.prepare('SELECT * FROM matches ORDER BY id DESC LIMIT 1').get();
  }
  if (!match) return null;

  const players = db.prepare('SELECT * FROM players WHERE match_id = ? ORDER BY team ASC, is_starter DESC, order_index ASC, id ASC').all(match.id);
  const ball = db.prepare('SELECT pos_x, pos_y FROM ball_position WHERE match_id = ?').get(match.id) || { pos_x: 50, pos_y: 50 };

  const homeStarters = players.filter(p => p.team === 'home' && p.is_starter === 1);
  const homeSubstitutes = players.filter(p => p.team === 'home' && p.is_starter === 0);

  const awayStarters = players.filter(p => p.team === 'away' && p.is_starter === 1);
  const awaySubstitutes = players.filter(p => p.team === 'away' && p.is_starter === 0);

  const formatPresets = FORMATION_PRESETS_HORIZONTAL[match.format] || {};
  const availableHomePresets = formatPresets.home ? Object.keys(formatPresets.home) : [];
  const availableAwayPresets = formatPresets.away ? Object.keys(formatPresets.away) : [];

  return {
    match,
    homeStarters,
    homeSubstitutes,
    awayStarters,
    awaySubstitutes,
    ball,
    availableHomePresets,
    availableAwayPresets,
    allPresets: FORMATION_PRESETS_HORIZONTAL
  };
}

// Public API Routes

// Login
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'La contraseña es requerida.' });
  }

  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'dt_admin', loggedInAt: Date.now() }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ success: true, token, message: 'Autenticación exitosa.' });
  } else {
    return res.status(401).json({ success: false, message: 'Contraseña o PIN incorrecto.' });
  }
});

// Get current match payload
app.get('/api/match/current', (req, res) => {
  const data = getMatchPayload();
  if (!data) {
    return res.status(404).json({ success: false, message: 'No hay partidos registrados.' });
  }
  res.json({ success: true, data });
});

app.get('/api/match/:id', (req, res) => {
  const data = getMatchPayload(req.params.id);
  if (!data) {
    return res.status(404).json({ success: false, message: 'Partido no encontrado.' });
  }
  res.json({ success: true, data });
});

// Protected Admin API Routes

// Update Match details & pitch settings
app.put('/api/admin/match', requireAdmin, (req, res) => {
  const { id, title, date, time, location, opponent, format, formation_name, rival_formation_name, pitch_orientation, pitch_view } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: 'ID del partido es requerido.' });
  }

  const oldMatch = db.prepare('SELECT format FROM matches WHERE id = ?').get(id);
  const newFormat = format || '11v11';
  const formatChanged = oldMatch && oldMatch.format !== newFormat;

  db.prepare(`
    UPDATE matches 
    SET title = ?, date = ?, time = ?, location = ?, opponent = ?, format = ?, formation_name = ?, rival_formation_name = ?, pitch_orientation = ?, pitch_view = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title || 'Partido de Fútbol',
    date || '',
    time || '',
    location || '',
    opponent || 'Colores Cálidos',
    newFormat,
    formation_name || '4-3-3',
    rival_formation_name || '4-4-2',
    pitch_orientation || 'horizontal',
    pitch_view || 'both',
    id
  );

  // If format changed (e.g. 11v11 to 7v7), adjust starters count per team
  if (formatChanged) {
    const targetStarters = getStartersCountFromFormat(newFormat);
    
    ['home', 'away'].forEach(teamName => {
      const teamPlayers = db.prepare('SELECT id, is_starter FROM players WHERE match_id = ? AND team = ? ORDER BY is_starter DESC, order_index ASC').all(id, teamName);
      teamPlayers.forEach((p, index) => {
        const shouldBeStarter = index < targetStarters ? 1 : 0;
        db.prepare('UPDATE players SET is_starter = ? WHERE id = ?').run(shouldBeStarter, p.id);
      });

      // Apply default preset if available for new format
      const teamPresets = FORMATION_PRESETS_HORIZONTAL[newFormat] && FORMATION_PRESETS_HORIZONTAL[newFormat][teamName];
      if (teamPresets) {
        const firstPresetName = Object.keys(teamPresets)[0];
        const presetCoords = teamPresets[firstPresetName];
        const currentStarters = db.prepare('SELECT * FROM players WHERE match_id = ? AND team = ? AND is_starter = 1 ORDER BY order_index ASC').all(id, teamName);
        
        const assignments = mapStartersToPreset(currentStarters, presetCoords);
        assignments.forEach(assign => {
          db.prepare('UPDATE players SET pos_x = ?, pos_y = ? WHERE id = ?')
            .run(assign.pos_x, assign.pos_y, assign.id);
        });

        if (teamName === 'home') {
          db.prepare('UPDATE matches SET formation_name = ? WHERE id = ?').run(firstPresetName, id);
        } else {
          db.prepare('UPDATE matches SET rival_formation_name = ? WHERE id = ?').run(firstPresetName, id);
        }
      }
    });
  }

  const updatedData = getMatchPayload(id);
  res.json({ success: true, data: updatedData, message: 'Información del partido y formato actualizados.' });
});

// Update Squad Positions & Ball for Both Teams
app.post('/api/admin/match/squad', requireAdmin, (req, res) => {
  const { match_id, players, ball } = req.body;

  if (!match_id || !Array.isArray(players)) {
    return res.status(400).json({ success: false, message: 'Datos de alineación inválidos.' });
  }

  const updateStmt = db.prepare(`
    UPDATE players 
    SET name = ?, number = ?, pos_x = ?, pos_y = ?, is_starter = ?, role = ?, team = ?, order_index = ?
    WHERE id = ? AND match_id = ?
  `);

  const updateTx = db.transaction(() => {
    players.forEach((p, idx) => {
      updateStmt.run(
        p.name,
        p.number,
        p.pos_x,
        p.pos_y,
        p.is_starter ? 1 : 0,
        p.role || 'MID',
        p.team || 'home',
        idx,
        p.id,
        match_id
      );
    });

    if (ball && typeof ball.pos_x === 'number' && typeof ball.pos_y === 'number') {
      db.prepare('INSERT INTO ball_position (match_id, pos_x, pos_y) VALUES (?, ?, ?) ON CONFLICT(match_id) DO UPDATE SET pos_x = excluded.pos_x, pos_y = excluded.pos_y')
        .run(match_id, ball.pos_x, ball.pos_y);
    }

    db.prepare('UPDATE matches SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(match_id);
  });

  try {
    updateTx();
    const updatedData = getMatchPayload(match_id);
    res.json({ success: true, data: updatedData, message: 'Pizarra táctica guardada exitosamente.' });
  } catch (err) {
    console.error('Error guardando alineación:', err);
    res.status(500).json({ success: false, message: 'Error interno guardando la alineación.' });
  }
});

// Apply Formation Preset
app.post('/api/admin/match/preset', requireAdmin, (req, res) => {
  const { match_id, format, team, formation_name } = req.body;

  const targetTeam = team || 'home';
  if (!match_id || !format || !formation_name) {
    return res.status(400).json({ success: false, message: 'Parámetros incompletos.' });
  }

  const presets = FORMATION_PRESETS_HORIZONTAL[format] && FORMATION_PRESETS_HORIZONTAL[format][targetTeam];
  if (!presets || !presets[formation_name]) {
    return res.status(400).json({ success: false, message: 'Formación no válida para este formato.' });
  }

  const presetCoords = presets[formation_name];
  const starters = db.prepare('SELECT * FROM players WHERE match_id = ? AND team = ? AND is_starter = 1 ORDER BY order_index ASC').all(match_id, targetTeam);

  const applyTx = db.transaction(() => {
    const assignments = mapStartersToPreset(starters, presetCoords);
    assignments.forEach(assign => {
      db.prepare('UPDATE players SET pos_x = ?, pos_y = ? WHERE id = ?')
        .run(assign.pos_x, assign.pos_y, assign.id);
    });

    if (targetTeam === 'home') {
      db.prepare('UPDATE matches SET formation_name = ? WHERE id = ?').run(formation_name, match_id);
    } else {
      db.prepare('UPDATE matches SET rival_formation_name = ? WHERE id = ?').run(formation_name, match_id);
    }

    db.prepare('UPDATE matches SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(match_id);
  });

  try {
    applyTx();
    const updatedData = getMatchPayload(match_id);
    const teamLabel = targetTeam === 'home' ? 'Colores Fríos (Azul)' : 'Colores Cálidos (Rojo)';
    res.json({ success: true, data: updatedData, message: `Formación ${formation_name} aplicada a ${teamLabel}.` });
  } catch (err) {
    console.error('Error aplicando preset:', err);
    res.status(500).json({ success: false, message: 'Error al aplicar la formación.' });
  }
});

// Add Player (Home or Away)
app.post('/api/admin/players', requireAdmin, (req, res) => {
  const { match_id, team, name, number, role, is_starter, nickname, description, photo_url, is_captain } = req.body;

  if (!match_id || !name || number === undefined) {
    return res.status(400).json({ success: false, message: 'Nombre y dorsal son obligatorios.' });
  }

  const targetTeam = team || 'home';
  const defaultX = targetTeam === 'home' ? 30 : 70;

  const insert = db.prepare(`
    INSERT INTO players (match_id, team, name, number, pos_x, pos_y, is_starter, role, order_index, nickname, description, photo_url, is_captain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    match_id, 
    targetTeam, 
    name, 
    parseInt(number), 
    defaultX, 
    50, 
    is_starter ? 1 : 0, 
    role || 'MID', 
    99,
    nickname || '',
    description || '',
    photo_url || '',
    is_captain ? 1 : 0
  );

  const updatedData = getMatchPayload(match_id);
  res.json({ success: true, data: updatedData, message: 'Jugador añadido exitosamente.' });
});

// Update Single Player
app.put('/api/admin/players/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, number, role, is_starter, team, pos_x, pos_y, nickname, description, photo_url, is_captain } = req.body;

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  if (!player) {
    return res.status(404).json({ success: false, message: 'Jugador no encontrado.' });
  }

  db.prepare(`
    UPDATE players 
    SET name = ?, number = ?, role = ?, team = ?, is_starter = ?, pos_x = ?, pos_y = ?, nickname = ?, description = ?, photo_url = ?, is_captain = ?
    WHERE id = ?
  `).run(
    name !== undefined ? name : player.name,
    number !== undefined ? parseInt(number) : player.number,
    role !== undefined ? role : player.role,
    team !== undefined ? team : player.team,
    is_starter !== undefined ? (is_starter ? 1 : 0) : player.is_starter,
    pos_x !== undefined ? parseFloat(pos_x) : player.pos_x,
    pos_y !== undefined ? parseFloat(pos_y) : player.pos_y,
    nickname !== undefined ? nickname : (player.nickname || ''),
    description !== undefined ? description : (player.description || ''),
    photo_url !== undefined ? photo_url : (player.photo_url || ''),
    is_captain !== undefined ? (is_captain ? 1 : 0) : (player.is_captain || 0),
    id
  );

  const updatedData = getMatchPayload(player.match_id);
  res.json({ success: true, data: updatedData, message: 'Jugador actualizado.' });
});

// Bulk Import Players from CSV / JSON
app.post('/api/admin/players/import-csv', requireAdmin, (req, res) => {
  const { match_id, players } = req.body;
  if (!match_id || !Array.isArray(players) || players.length === 0) {
    return res.status(400).json({ success: false, message: 'Se requiere una lista válida de jugadores.' });
  }

  const insert = db.prepare(`
    INSERT INTO players (match_id, team, name, number, pos_x, pos_y, is_starter, role, order_index, nickname, description, photo_url, is_captain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((playerList) => {
    let count = 0;
    for (const p of playerList) {
      if (!p.name) continue;
      const targetTeam = (p.team && (p.team === 'away' || p.team === 'cálidos' || p.team === 'calidos' || p.team === 'rojo')) ? 'away' : 'home';
      const defaultX = targetTeam === 'home' ? (15 + (count * 6) % 30) : (55 + (count * 6) % 30);
      const defaultY = 20 + ((count * 12) % 60);

      const capVal = (p.is_captain || p.escapitan || p.capitan || '').toString().toLowerCase();
      const isCaptain = (capVal === '1' || capVal === 'true' || capVal === 'si' || capVal === 'sí') ? 1 : 0;

      insert.run(
        match_id,
        targetTeam,
        p.name.toString().trim(),
        parseInt(p.number) || (count + 1),
        p.pos_x !== undefined ? parseFloat(p.pos_x) : defaultX,
        p.pos_y !== undefined ? parseFloat(p.pos_y) : defaultY,
        p.is_starter !== undefined ? (p.is_starter ? 1 : 0) : 1,
        (p.role || 'MID').toString().toUpperCase(),
        count,
        p.nickname ? p.nickname.toString().trim() : '',
        p.description ? p.description.toString().trim() : '',
        p.photo_url ? p.photo_url.toString().trim() : '',
        isCaptain
      );
      count++;
    }
    return count;
  });

  const importedCount = insertMany(players);
  const updatedData = getMatchPayload(match_id);

  res.json({
    success: true,
    data: updatedData,
    message: `${importedCount} jugadores importados desde el archivo CSV.`
  });
});

// Clear All Players in Match
app.post('/api/admin/players/clear-all', requireAdmin, (req, res) => {
  const { match_id } = req.body;
  if (!match_id) {
    return res.status(400).json({ success: false, message: 'ID del partido es requerido.' });
  }

  db.prepare('DELETE FROM players WHERE match_id = ?').run(match_id);

  const updatedData = getMatchPayload(match_id);
  res.json({ success: true, data: updatedData, message: 'Plantilla vaciada por completo.' });
});

// Bulk Delete Selected Players
app.post('/api/admin/players/bulk-delete', requireAdmin, (req, res) => {
  const { match_id, ids } = req.body;
  if (!match_id || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'Seleccione al menos un jugador para eliminar.' });
  }

  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM players WHERE match_id = ? AND id IN (${placeholders})`).run(match_id, ...ids);

  const updatedData = getMatchPayload(match_id);
  res.json({ success: true, data: updatedData, message: `${ids.length} jugadores eliminados.` });
});

// Delete Player
app.delete('/api/admin/players/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const player = db.prepare('SELECT match_id FROM players WHERE id = ?').get(id);
  if (!player) {
    return res.status(404).json({ success: false, message: 'Jugador no encontrado.' });
  }

  db.prepare('DELETE FROM players WHERE id = ?').run(id);

  const updatedData = getMatchPayload(player.match_id);
  res.json({ success: true, data: updatedData, message: 'Jugador eliminado.' });
});

// Upload Player Photo from PC (Base64 -> File)
app.post('/api/admin/upload-image', requireAdmin, (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, message: 'No se recibió ninguna imagen.' });
  }

  try {
    const matches = image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ success: false, message: 'Formato de imagen no soportado (debe ser JPG, PNG o WebP).' });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];
    const safeFilename = `player_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
    const filePath = path.join(uploadsDir, safeFilename);

    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    const fileUrl = `/uploads/${safeFilename}`;
    res.json({ success: true, url: fileUrl, message: 'Imagen subida con éxito.' });
  } catch (err) {
    console.error('Error al guardar la imagen:', err);
    res.status(500).json({ success: false, message: 'Error interno guardando el archivo de imagen.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`⚽ Servidor DT Táctico activo en http://localhost:${PORT}`);
});
