require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DATABASE,
  timezone: '-05:00',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.get('/api/trabajador/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        s.\`Trabajador\`,
        v.\`Cargo\`,
        v.\`Operación\`,
        v.\`Regional\`
      FROM \`Maestro_Segmentación\` s
      INNER JOIN \`Maestro_Vinculación\` v ON v.\`Identificación\` = s.\`Identificación\`
      WHERE s.\`Identificación\` = ? AND v.\`Estado\` = 'Activo'
      LIMIT 1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No encontrado' });
    }

    const row = rows[0];
    res.json({
      trabajador: row.Trabajador,
      cargo: row.Cargo,
      operacion: row['Operación'],
      regional: row.Regional
    });
  } catch (err) {
    console.error('[/api/trabajador]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/operaciones/:regional', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT \`OPERACIÓN\` FROM \`Maestro_Operaciones\` WHERE \`REGIONAL\` = ?`,
      [req.params.regional]
    );
    res.json(rows.map(r => r['OPERACIÓN']));
  } catch (err) {
    console.error('[/api/operaciones]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/marcacion', async (req, res) => {
  try {
    const {
      identificacion,
      trabajador,
      cargo,
      operacion,
      regional,
      tipo,
      latitud,
      longitud,
      precision_gps,
      device_fingerprint,
      user_agent,
      observaciones
    } = req.body;

    const fecha_hora = new Date();
    const ip = req.headers['x-forwarded-for'] || req.ip;

    const [result] = await pool.execute(
      `INSERT INTO \`Dynamic_registro_marcaciones\`
        (identificacion, trabajador, cargo, operacion, regional, tipo, latitud, longitud, precision_gps, fecha_hora, device_fingerprint, ip, user_agent, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        identificacion,
        trabajador,
        cargo,
        operacion,
        regional,
        tipo,
        latitud,
        longitud,
        precision_gps,
        fecha_hora,
        device_fingerprint,
        ip,
        user_agent,
        observaciones || null
      ]
    );

    res.json({ id: result.insertId, fecha_hora });
  } catch (err) {
    console.error('[/api/marcacion]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/marcaciones-hoy/:id', async (req, res) => {
  try {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const [rows] = await pool.execute(
      `SELECT operacion, tipo, fecha_hora
       FROM \`Dynamic_registro_marcaciones\`
       WHERE identificacion = ?
         AND DATE(fecha_hora) = ?
       ORDER BY fecha_hora ASC`,
      [req.params.id, hoy]
    );
    res.json(rows);
  } catch (err) {
    console.error('[/api/marcaciones-hoy]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT);
