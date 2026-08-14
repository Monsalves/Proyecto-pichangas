const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './data/tactics.db';

const dataDir = path.dirname(path.resolve(dbPath));
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT 'Partido de Fútbol',
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    location TEXT NOT NULL,
    opponent TEXT NOT NULL DEFAULT 'Colores Cálidos',
    format TEXT NOT NULL DEFAULT '11v11',
    formation_name TEXT NOT NULL DEFAULT '4-3-3',
    rival_formation_name TEXT NOT NULL DEFAULT '4-4-2',
    pitch_orientation TEXT NOT NULL DEFAULT 'horizontal',
    pitch_view TEXT NOT NULL DEFAULT 'both',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    team TEXT NOT NULL DEFAULT 'home',
    name TEXT NOT NULL,
    number INTEGER NOT NULL,
    pos_x REAL NOT NULL DEFAULT 50,
    pos_y REAL NOT NULL DEFAULT 50,
    is_starter INTEGER NOT NULL DEFAULT 1,
    role TEXT NOT NULL DEFAULT 'MID',
    order_index INTEGER DEFAULT 0,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ball_position (
    match_id INTEGER PRIMARY KEY,
    pos_x REAL NOT NULL DEFAULT 50,
    pos_y REAL NOT NULL DEFAULT 50,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
  );
`);

// Dynamic column migrations for existing databases
try {
  db.exec("ALTER TABLE players ADD COLUMN description TEXT DEFAULT ''");
} catch (e) {}

try {
  db.exec("ALTER TABLE players ADD COLUMN photo_url TEXT DEFAULT ''");
} catch (e) {}

try {
  db.exec("ALTER TABLE players ADD COLUMN nickname TEXT DEFAULT ''");
} catch (e) {}

try {
  db.exec("ALTER TABLE players ADD COLUMN is_captain INTEGER DEFAULT 0");
} catch (e) {}

// Formations Presets for Formats from 5v5 to 11v11
// home = Colores Fríos (Azul, Left side X: 5% to 48%)
// away = Colores Cálidos (Rojo, Right side X: 52% to 95%)

const FORMATION_PRESETS_HORIZONTAL = {
  '11v11': {
    'home': {
      '4-3-3': [
        { role: 'GK', number: 1, name: 'Arquero Azul', pos_x: 6, pos_y: 50 },
        { role: 'DEF', number: 4, name: 'Lateral Izq', pos_x: 18, pos_y: 18 },
        { role: 'DEF', number: 2, name: 'Central Izq', pos_x: 16, pos_y: 38 },
        { role: 'DEF', number: 6, name: 'Central Der', pos_x: 16, pos_y: 62 },
        { role: 'DEF', number: 3, name: 'Lateral Der', pos_x: 18, pos_y: 82 },
        { role: 'MID', number: 5, name: 'Pivote', pos_x: 26, pos_y: 50 },
        { role: 'MID', number: 8, name: 'Volante Izq', pos_x: 34, pos_y: 33 },
        { role: 'MID', number: 10, name: 'Volante Der', pos_x: 34, pos_y: 67 },
        { role: 'FWD', number: 11, name: 'Extremo Izq', pos_x: 44, pos_y: 20 },
        { role: 'FWD', number: 9, name: 'Centrodelantero', pos_x: 46, pos_y: 50 },
        { role: 'FWD', number: 7, name: 'Extremo Der', pos_x: 44, pos_y: 80 }
      ],
      '4-4-2': [
        { role: 'GK', number: 1, name: 'Arquero Azul', pos_x: 6, pos_y: 50 },
        { role: 'DEF', number: 3, name: 'Lateral Izq', pos_x: 18, pos_y: 18 },
        { role: 'DEF', number: 2, name: 'Central Izq', pos_x: 16, pos_y: 38 },
        { role: 'DEF', number: 6, name: 'Central Der', pos_x: 16, pos_y: 62 },
        { role: 'DEF', number: 4, name: 'Lateral Der', pos_x: 18, pos_y: 82 },
        { role: 'MID', number: 11, name: 'Banda Izq', pos_x: 32, pos_y: 18 },
        { role: 'MID', number: 5, name: 'Medio Centro 1', pos_x: 28, pos_y: 38 },
        { role: 'MID', number: 8, name: 'Medio Centro 2', pos_x: 28, pos_y: 62 },
        { role: 'MID', number: 7, name: 'Banda Der', pos_x: 32, pos_y: 82 },
        { role: 'FWD', number: 9, name: 'Delantero A', pos_x: 45, pos_y: 36 },
        { role: 'FWD', number: 10, name: 'Delantero B', pos_x: 45, pos_y: 64 }
      ]
    },
    'away': {
      '4-4-2': [
        { role: 'GK', number: 1, name: 'Arquero Rojo', pos_x: 94, pos_y: 50 },
        { role: 'DEF', number: 4, name: 'Defensa Der', pos_x: 82, pos_y: 18 },
        { role: 'DEF', number: 2, name: 'Central Der', pos_x: 84, pos_y: 38 },
        { role: 'DEF', number: 6, name: 'Central Izq', pos_x: 84, pos_y: 62 },
        { role: 'DEF', number: 3, name: 'Defensa Izq', pos_x: 82, pos_y: 82 },
        { role: 'MID', number: 7, name: 'Banda Der', pos_x: 68, pos_y: 18 },
        { role: 'MID', number: 5, name: 'Medio Der', pos_x: 72, pos_y: 38 },
        { role: 'MID', number: 8, name: 'Medio Izq', pos_x: 72, pos_y: 62 },
        { role: 'MID', number: 11, name: 'Banda Izq', pos_x: 68, pos_y: 82 },
        { role: 'FWD', number: 9, name: 'Atacante 1', pos_x: 55, pos_y: 36 },
        { role: 'FWD', number: 10, name: 'Atacante 2', pos_x: 55, pos_y: 64 }
      ],
      '4-3-3': [
        { role: 'GK', number: 1, name: 'Arquero Rojo', pos_x: 94, pos_y: 50 },
        { role: 'DEF', number: 4, name: 'Defensa Der', pos_x: 82, pos_y: 18 },
        { role: 'DEF', number: 2, name: 'Central Der', pos_x: 84, pos_y: 38 },
        { role: 'DEF', number: 6, name: 'Central Izq', pos_x: 84, pos_y: 62 },
        { role: 'DEF', number: 3, name: 'Defensa Izq', pos_x: 82, pos_y: 82 },
        { role: 'MID', number: 5, name: 'Pivote Rojo', pos_x: 74, pos_y: 50 },
        { role: 'MID', number: 8, name: 'Volante Der', pos_x: 66, pos_y: 33 },
        { role: 'MID', number: 10, name: 'Volante Izq', pos_x: 66, pos_y: 67 },
        { role: 'FWD', number: 7, name: 'Extremo Der', pos_x: 56, pos_y: 20 },
        { role: 'FWD', number: 9, name: 'Punta Rojo', pos_x: 54, pos_y: 50 },
        { role: 'FWD', number: 11, name: 'Extremo Izq', pos_x: 56, pos_y: 80 }
      ]
    }
  },
  '10v10': {
    'home': {
      '4-3-2': [
        { role: 'GK', number: 1, name: 'Arquero Azul', pos_x: 6, pos_y: 50 },
        { role: 'DEF', number: 4, name: 'Lat. Izq', pos_x: 18, pos_y: 18 },
        { role: 'DEF', number: 2, name: 'Central Izq', pos_x: 16, pos_y: 38 },
        { role: 'DEF', number: 6, name: 'Central Der', pos_x: 16, pos_y: 62 },
        { role: 'DEF', number: 3, name: 'Lat. Der', pos_x: 18, pos_y: 82 },
        { role: 'MID', number: 5, name: 'Pivote', pos_x: 26, pos_y: 50 },
        { role: 'MID', number: 8, name: 'Medio Izq', pos_x: 34, pos_y: 32 },
        { role: 'MID', number: 10, name: 'Medio Der', pos_x: 34, pos_y: 68 },
        { role: 'FWD', number: 9, name: 'Atacante A', pos_x: 45, pos_y: 38 },
        { role: 'FWD', number: 11, name: 'Atacante B', pos_x: 45, pos_y: 62 }
      ]
    },
    'away': {
      '4-3-2': [
        { role: 'GK', number: 1, name: 'Arquero Rojo', pos_x: 94, pos_y: 50 },
        { role: 'DEF', number: 4, name: 'Defensa Der', pos_x: 82, pos_y: 18 },
        { role: 'DEF', number: 2, name: 'Central Der', pos_x: 84, pos_y: 38 },
        { role: 'DEF', number: 6, name: 'Central Izq', pos_x: 84, pos_y: 62 },
        { role: 'DEF', number: 3, name: 'Defensa Izq', pos_x: 82, pos_y: 82 },
        { role: 'MID', number: 5, name: 'Pivote', pos_x: 74, pos_y: 50 },
        { role: 'MID', number: 8, name: 'Medio Der', pos_x: 66, pos_y: 32 },
        { role: 'MID', number: 10, name: 'Medio Izq', pos_x: 66, pos_y: 68 },
        { role: 'FWD', number: 9, name: 'Atacante A', pos_x: 55, pos_y: 38 },
        { role: 'FWD', number: 11, name: 'Atacante B', pos_x: 55, pos_y: 62 }
      ]
    }
  },
  '9v9': {
    'home': {
      '3-4-1': [
        { role: 'GK', number: 1, name: 'Arquero Azul', pos_x: 6, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Defensa Izq', pos_x: 18, pos_y: 24 },
        { role: 'DEF', number: 5, name: 'Líbero', pos_x: 16, pos_y: 50 },
        { role: 'DEF', number: 3, name: 'Defensa Der', pos_x: 18, pos_y: 76 },
        { role: 'MID', number: 11, name: 'Volante Izq', pos_x: 32, pos_y: 18 },
        { role: 'MID', number: 8, name: 'Medio Izq', pos_x: 28, pos_y: 38 },
        { role: 'MID', number: 10, name: 'Medio Der', pos_x: 28, pos_y: 62 },
        { role: 'MID', number: 7, name: 'Volante Der', pos_x: 32, pos_y: 82 },
        { role: 'FWD', number: 9, name: 'Centrodelantero', pos_x: 45, pos_y: 50 }
      ]
    },
    'away': {
      '3-4-1': [
        { role: 'GK', number: 1, name: 'Arquero Rojo', pos_x: 94, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Defensa Der', pos_x: 82, pos_y: 24 },
        { role: 'DEF', number: 5, name: 'Líbero', pos_x: 84, pos_y: 50 },
        { role: 'DEF', number: 3, name: 'Defensa Izq', pos_x: 82, pos_y: 76 },
        { role: 'MID', number: 11, name: 'Volante Der', pos_x: 68, pos_y: 18 },
        { role: 'MID', number: 8, name: 'Medio Der', pos_x: 72, pos_y: 38 },
        { role: 'MID', number: 10, name: 'Medio Izq', pos_x: 72, pos_y: 62 },
        { role: 'MID', number: 7, name: 'Volante Izq', pos_x: 68, pos_y: 82 },
        { role: 'FWD', number: 9, name: 'Centrodelantero', pos_x: 55, pos_y: 50 }
      ]
    }
  },
  '8v8': {
    'home': {
      '3-3-1': [
        { role: 'GK', number: 1, name: 'Arquero Azul', pos_x: 6, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Defensa Izq', pos_x: 18, pos_y: 24 },
        { role: 'DEF', number: 5, name: 'Central', pos_x: 16, pos_y: 50 },
        { role: 'DEF', number: 3, name: 'Defensa Der', pos_x: 18, pos_y: 76 },
        { role: 'MID', number: 6, name: 'Banda Izq', pos_x: 32, pos_y: 22 },
        { role: 'MID', number: 8, name: 'Medio Centro', pos_x: 30, pos_y: 50 },
        { role: 'MID', number: 7, name: 'Banda Der', pos_x: 32, pos_y: 78 },
        { role: 'FWD', number: 9, name: 'Atacante', pos_x: 45, pos_y: 50 }
      ]
    },
    'away': {
      '3-3-1': [
        { role: 'GK', number: 1, name: 'Arquero Rojo', pos_x: 94, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Defensa Der', pos_x: 82, pos_y: 24 },
        { role: 'DEF', number: 5, name: 'Central', pos_x: 84, pos_y: 50 },
        { role: 'DEF', number: 3, name: 'Defensa Izq', pos_x: 82, pos_y: 76 },
        { role: 'MID', number: 6, name: 'Banda Der', pos_x: 68, pos_y: 22 },
        { role: 'MID', number: 8, name: 'Medio Centro', pos_x: 70, pos_y: 50 },
        { role: 'MID', number: 7, name: 'Banda Izq', pos_x: 68, pos_y: 78 },
        { role: 'FWD', number: 9, name: 'Atacante', pos_x: 55, pos_y: 50 }
      ]
    }
  },
  '7v7': {
    'home': {
      '2-3-1': [
        { role: 'GK', number: 1, name: 'Arquero Azul', pos_x: 6, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Defensa Izq', pos_x: 18, pos_y: 30 },
        { role: 'DEF', number: 3, name: 'Defensa Der', pos_x: 18, pos_y: 70 },
        { role: 'MID', number: 6, name: 'Banda Izq', pos_x: 34, pos_y: 20 },
        { role: 'MID', number: 5, name: 'Mediocentro', pos_x: 30, pos_y: 50 },
        { role: 'MID', number: 8, name: 'Banda Der', pos_x: 34, pos_y: 80 },
        { role: 'FWD', number: 9, name: 'Atacante', pos_x: 45, pos_y: 50 }
      ],
      '3-2-1': [
        { role: 'GK', number: 1, name: 'Arquero Azul', pos_x: 6, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Lat. Izq', pos_x: 18, pos_y: 22 },
        { role: 'DEF', number: 5, name: 'Central', pos_x: 16, pos_y: 50 },
        { role: 'DEF', number: 3, name: 'Lat. Der', pos_x: 18, pos_y: 78 },
        { role: 'MID', number: 8, name: 'Medio Izq', pos_x: 32, pos_y: 36 },
        { role: 'MID', number: 10, name: 'Medio Der', pos_x: 32, pos_y: 64 },
        { role: 'FWD', number: 9, name: 'Delantero', pos_x: 45, pos_y: 50 }
      ]
    },
    'away': {
      '2-3-1': [
        { role: 'GK', number: 1, name: 'Arquero Rojo', pos_x: 94, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Defensa Der', pos_x: 82, pos_y: 30 },
        { role: 'DEF', number: 3, name: 'Defensa Izq', pos_x: 82, pos_y: 70 },
        { role: 'MID', number: 6, name: 'Banda Der', pos_x: 66, pos_y: 20 },
        { role: 'MID', number: 5, name: 'Mediocentro', pos_x: 70, pos_y: 50 },
        { role: 'MID', number: 8, name: 'Banda Izq', pos_x: 66, pos_y: 80 },
        { role: 'FWD', number: 9, name: 'Atacante', pos_x: 55, pos_y: 50 }
      ]
    }
  },
  '6v6': {
    'home': {
      '2-2-1': [
        { role: 'GK', number: 1, name: 'Arquero Azul', pos_x: 6, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Defensa Izq', pos_x: 20, pos_y: 32 },
        { role: 'DEF', number: 3, name: 'Defensa Der', pos_x: 20, pos_y: 68 },
        { role: 'MID', number: 6, name: 'Medio Izq', pos_x: 34, pos_y: 32 },
        { role: 'MID', number: 8, name: 'Medio Der', pos_x: 34, pos_y: 68 },
        { role: 'FWD', number: 9, name: 'Punta', pos_x: 45, pos_y: 50 }
      ]
    },
    'away': {
      '2-2-1': [
        { role: 'GK', number: 1, name: 'Arquero Rojo', pos_x: 94, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Defensa Der', pos_x: 80, pos_y: 32 },
        { role: 'DEF', number: 3, name: 'Defensa Izq', pos_x: 80, pos_y: 68 },
        { role: 'MID', number: 6, name: 'Medio Der', pos_x: 66, pos_y: 32 },
        { role: 'MID', number: 8, name: 'Medio Izq', pos_x: 66, pos_y: 68 },
        { role: 'FWD', number: 9, name: 'Punta', pos_x: 55, pos_y: 50 }
      ]
    }
  },
  '5v5': {
    'home': {
      '1-2-1': [
        { role: 'GK', number: 1, name: 'Arquero Azul', pos_x: 6, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Cierre Azul', pos_x: 22, pos_y: 50 },
        { role: 'MID', number: 6, name: 'Ala Izquierda', pos_x: 34, pos_y: 24 },
        { role: 'MID', number: 8, name: 'Ala Derecha', pos_x: 34, pos_y: 76 },
        { role: 'FWD', number: 9, name: 'Pívot Azul', pos_x: 45, pos_y: 50 }
      ],
      '2-2': [
        { role: 'GK', number: 1, name: 'Arquero Azul', pos_x: 6, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Defensa Izq', pos_x: 22, pos_y: 30 },
        { role: 'DEF', number: 3, name: 'Defensa Der', pos_x: 22, pos_y: 70 },
        { role: 'FWD', number: 7, name: 'Atacante Izq', pos_x: 42, pos_y: 30 },
        { role: 'FWD', number: 9, name: 'Atacante Der', pos_x: 42, pos_y: 70 }
      ]
    },
    'away': {
      '1-2-1': [
        { role: 'GK', number: 1, name: 'Arquero Rojo', pos_x: 94, pos_y: 50 },
        { role: 'DEF', number: 2, name: 'Cierre Rojo', pos_x: 78, pos_y: 50 },
        { role: 'MID', number: 6, name: 'Ala Derecha', pos_x: 66, pos_y: 24 },
        { role: 'MID', number: 8, name: 'Ala Izquierda', pos_x: 66, pos_y: 76 },
        { role: 'FWD', number: 9, name: 'Pívot Rojo', pos_x: 55, pos_y: 50 }
      ]
    }
  }
};

// Seed default initial match if database is empty
const matchCount = db.prepare('SELECT COUNT(*) as count FROM matches').get().count;
if (matchCount === 0) {
  const stmt = db.prepare(`
    INSERT INTO matches (title, date, time, location, opponent, format, formation_name, rival_formation_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const today = new Date().toISOString().split('T')[0];
  const info = stmt.run('Clásico de Fútbol', today, '20:00', 'Cancha Principal', 'Colores Cálidos', '11v11', '4-3-3', '4-4-2');
  const matchId = info.lastInsertRowid;

  db.prepare('INSERT INTO ball_position (match_id, pos_x, pos_y) VALUES (?, 50, 50)').run(matchId);

  const homeDefault = FORMATION_PRESETS_HORIZONTAL['11v11']['home']['4-3-3'];
  const awayDefault = FORMATION_PRESETS_HORIZONTAL['11v11']['away']['4-4-2'];

  const insertPlayer = db.prepare(`
    INSERT INTO players (match_id, team, name, number, pos_x, pos_y, is_starter, role, order_index)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  if (homeDefault) {
    homeDefault.forEach((p, idx) => {
      insertPlayer.run(matchId, 'home', p.name, p.number, p.pos_x, p.pos_y, p.role, idx);
    });
  }

  if (awayDefault) {
    awayDefault.forEach((p, idx) => {
      insertPlayer.run(matchId, 'away', p.name, p.number, p.pos_x, p.pos_y, p.role, idx);
    });
  }
}

module.exports = {
  db,
  FORMATION_PRESETS_HORIZONTAL
};
