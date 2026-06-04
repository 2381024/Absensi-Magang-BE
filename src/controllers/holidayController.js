const pool = require("../config/db");

const getHolidays = async (req, res, next) => {
  try {
    const { year, month } = req.query;

    let query = `SELECT * FROM holidays WHERE 1=1`;
    const params = [];
    let idx = 0;

    if (year) {
      idx++;
      query += ` AND EXTRACT(YEAR FROM date) = $${idx}`;
      params.push(Number(year));
    }

    if (month) {
      idx++;
      query += ` AND EXTRACT(MONTH FROM date) = $${idx}`;
      params.push(Number(month));
    }

    query += ` ORDER BY date ASC`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

const createHoliday = async (req, res, next) => {
  try {
    const { date, name, type } = req.body;

    if (!date || !name) {
      return res.status(400).json({ error: { message: "date dan name wajib", status: 400 } });
    }

    const { rows } = await pool.query(
      `INSERT INTO holidays (date, name, type) VALUES ($1, $2, $3) RETURNING *`,
      [date, name, type || 'national']
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { message: "Tanggal ini sudah terdaftar sebagai hari libur", status: 409 } });
    }
    next(err);
  }
};

const updateHoliday = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { date, name, type } = req.body;

    const { rows } = await pool.query(
      `UPDATE holidays SET date = COALESCE($1, date), name = COALESCE($2, name), type = COALESCE($3, type) WHERE id = $4 RETURNING *`,
      [date, name, type, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Hari libur tidak ditemukan", status: 404 } });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

const deleteHoliday = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `DELETE FROM holidays WHERE id = $1 RETURNING id`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Hari libur tidak ditemukan", status: 404 } });
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getHolidays, createHoliday, updateHoliday, deleteHoliday };
