bash

cat /home/claude/telecom_app/server.js
Salida

const express = require('express');
const cors = require('cors');
const https = require('https');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eypzqzmzagcoauczrxwr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_rOtLJbe4EXSSA7GZq5D6fQ_SB3QB0nw';
const JWT_SECRET = process.env.JWT_SECRET || 'telecom-inspector-secret-2026';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Sin autorizacion' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido' });
  }
}

// LOGIN
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });
  try {
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();
    if (error || !user) return res.status(401).json({ error: 'Usuario no encontrado' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Contrasena incorrecta' });
    const token = jwt.sign({ id: user.id, email: user.email, rol: user.rol, nombre: user.nombre }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CREAR USUARIO (solo admin/jefe)
app.post('/api/usuarios', authMiddleware, async (req, res) => {
  if (req.user.rol !== 'jefe') return res.status(403).json({ error: 'Solo el jefe puede crear usuarios' });
  const { email, password, nombre, rol } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('usuarios')
      .insert([{ email: email.toLowerCase(), password_hash: hash, nombre, rol: rol || 'auxiliar' }])
      .select('id, email, nombre, rol')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LISTAR USUARIOS (solo jefe)
app.get('/api/usuarios', authMiddleware, async (req, res) => {
  if (req.user.rol !== 'jefe') return res.status(403).json({ error: 'Acceso denegado' });
  const { data, error } = await supabase.from('usuarios').select('id, email, nombre, rol, created_at');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GUARDAR INFORME
app.post('/api/informes', authMiddleware, async (req, res) => {
  const { sitio, datos, estado } = req.body;
  try {
    const { data, error } = await supabase
      .from('informes')
      .insert([{ usuario_id: req.user.id, sitio_codigo: sitio, datos: datos, estado: estado || 'borrador' }])
      .select('id, sitio_codigo, estado, created_at')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LISTAR INFORMES
app.get('/api/informes', authMiddleware, async (req, res) => {
  try {
    let query = supabase.from('informes').select('id, sitio_codigo, estado, created_at, usuario_id, usuarios(nombre)');
    if (req.user.rol !== 'jefe') query = query.eq('usuario_id', req.user.id);
    query = query.order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// OBTENER INFORME
app.get('/api/informes/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('informes').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'No encontrado' });
    if (req.user.rol !== 'jefe' && data.usuario_id !== req.user.id) return res.status(403).json({ error: 'Acceso denegado' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// APROBAR INFORME (solo jefe)
app.patch('/api/informes/:id/aprobar', authMiddleware, async (req, res) => {
  if (req.user.rol !== 'jefe') return res.status(403).json({ error: 'Solo el jefe puede aprobar' });
  const { data, error } = await supabase.from('informes').update({ estado: 'aprobado' }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GUARDAR CORRECCION IA
app.post('/api/correcciones', authMiddleware, async (req, res) => {
  const { categoria, estado_ia, estado_corregido, observacion } = req.body;
  try {
    const { data, error } = await supabase
      .from('correcciones_ia')
      .insert([{ usuario_id: req.user.id, categoria, estado_ia, estado_corregido, observacion }])
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// OBTENER CORRECCIONES PARA CONTEXTO DE IA
app.get('/api/correcciones/contexto', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('correcciones_ia')
    .select('categoria, estado_ia, estado_corregido, observacion')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PROXY ANTHROPIC
app.post('/api/analizar', authMiddleware, async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(400).json({ error: 'Falta API key' });
  const body = JSON.stringify(req.body);
  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body)
    }
  };
  const proxyReq = https.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
    proxyRes.pipe(res);
  });
  proxyReq.on('error', err => res.status(500).json({ error: err.message }));
  proxyReq.write(body);
  proxyReq.end();
});

// SETUP INICIAL — crea tablas y usuario admin
app.post('/api/setup', async (req, res) => {
  const { adminPassword } = req.body;
  if (!adminPassword) return res.status(400).json({ error: 'Falta contrasena de admin' });
  try {
    const hash = await bcrypt.hash(adminPassword, 10);
    const { error } = await supabase.from('usuarios').insert([{
      email: 'maxisuga11@gmail.com',
      password_hash: hash,
      nombre: 'Maxi (Admin)',
      rol: 'admin'
    }]);
    if (error && !error.message.includes('duplicate')) return res.status(400).json({ error: error.message });
    res.json({ ok: true, mensaje: 'Setup completado. Ya podes iniciar sesion.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log('Telecom Inspector corriendo en puerto', PORT));
