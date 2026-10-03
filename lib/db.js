'use strict';

const { MongoClient } = require('mongodb');

let mode = 'memory';
let client = null;
let db = null;
const mem = new Map();

async function init() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[db] 未配置 MONGODB_URI，使用内存模式（收藏与缓存不持久化）');
    return mode;
  }
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 });
    await client.connect();
    db = client.db('stock_analyzer');
    try { await db.collection('cache').createIndex({ updatedAt: 1 }, { expireAfterSeconds: 3600 }); } catch (e) {}
    try { await db.collection('favorites').createIndex({ clientId: 1, symbol: 1 }, { unique: true }); } catch (e) {}
    mode = 'mongodb';
    console.log('[db] 已连接 MongoDB Atlas');
  } catch (e) {
    console.error('[db] MongoDB 连接失败，回退内存模式: ' + e.message);
    mode = 'memory'; client = null; db = null;
  }
  return mode;
}

function getMode() { return mode; }

async function getCached(key, ttlMs, loader) {
  if (mode === 'mongodb' && db) {
    try {
      const col = db.collection('cache');
      const hit = await col.findOne({ _id: key });
      if (hit && hit.updatedAt && Date.now() - hit.updatedAt < ttlMs) return hit.data;
      const data = await loader();
      await col.updateOne({ _id: key }, { $set: { data, updatedAt: Date.now() } }, { upsert: true });
      return data;
    } catch (e) {
      console.error('[cache] mongodb 缓存失败: ' + e.message);
    }
  }
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.d;
  const data = await loader();
  mem.set(key, { d: data, t: Date.now() });
  return data;
}

async function listFavorites(clientId) {
  if (mode === 'mongodb' && db) {
    try { return await db.collection('favorites').find({ clientId }).sort({ addedAt: -1 }).toArray(); }
    catch (e) { console.error('[db] favorites 读取失败: ' + e.message); }
  }
  return (mem.get('fav:' + clientId) || []).slice().sort((a, b) => b.addedAt - a.addedAt);
}

async function addFavorite(fav) {
  const doc = Object.assign({}, fav, { addedAt: Date.now() });
  if (mode === 'mongodb' && db) {
    try {
      await db.collection('favorites').updateOne(
        { clientId: fav.clientId, symbol: fav.symbol },
        { $set: doc },
        { upsert: true }
      );
      return true;
    } catch (e) { console.error('[db] favorites 写入失败: ' + e.message); }
  }
  const key = 'fav:' + fav.clientId;
  const arr = mem.get(key) || [];
  if (!arr.some((x) => x.symbol === fav.symbol)) arr.push(doc);
  mem.set(key, arr);
  return true;
}

async function removeFavorite(clientId, symbol) {
  if (mode === 'mongodb' && db) {
    try { await db.collection('favorites').deleteOne({ clientId, symbol }); return true; }
    catch (e) { console.error('[db] favorites 删除失败: ' + e.message); }
  }
  const key = 'fav:' + clientId;
  const arr = mem.get(key) || [];
  mem.set(key, arr.filter((x) => x.symbol !== symbol));
  return true;
}

module.exports = { init, getMode, getCached, listFavorites, addFavorite, removeFavorite };
