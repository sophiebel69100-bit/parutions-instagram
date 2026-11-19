// Publication automatique des parutions Instagram (exécuté par GitHub Actions)
import fs from 'node:fs';

const TOKEN = process.env.IG_TOKEN;
const BASE = 'https://sophiebel69100-bit.github.io/parutions-instagram/';
const GRAPH = 'https://graph.instagram.com/v22.0';
const FENETRE_HEURES = 12;
const MAX_ESSAIS = 3;
const ETAT = 'etat.json';

if (!TOKEN) { console.log('Pas de token IG_TOKEN : rien à faire'); process.exit(0); }
const etat = JSON.parse(fs.readFileSync(ETAT, 'utf8'));
etat.published ||= {}; etat.essais ||= {};
const debut = Date.parse(etat.debut || '2099-01-01T00:00:00Z');
const sauver = () => fs.writeFileSync(ETAT, JSON.stringify(etat, null, 1));

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(method, path, params = {}) {
  const u = new URL(GRAPH + path);
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  let res;
  if (method === 'GET') { body.forEach((v, k) => u.searchParams.set(k, v)); res = await fetch(u); }
  else res = await fetch(u, { method, body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`${res.status} ${JSON.stringify(j.error || j).slice(0, 500)}`);
  return j;
}
async function attendrePret(id) {
  for (let i = 0; i < 60; i++) {
    const r = await api('GET', '/' + id, { fields: 'status_code' });
    if (!r.status_code || r.status_code === 'FINISHED') return;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') throw new Error('Traitement Instagram : ' + r.status_code);
    await sleep(6000);
  }
  throw new Error('Vidéo trop longue à traiter par Instagram');
}

// Prolonge la validité du token une fois par semaine
if (Date.now() - Date.parse(etat.refreshedAt || 0) > 7 * 24 * 3600e3) {
  try {
    const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${TOKEN}`).then(r => r.json());
    if (r.expires_in) { etat.refreshedAt = new Date().toISOString(); etat.tokenValideJusquA = new Date(Date.now() + r.expires_in * 1000).toISOString(); }
  } catch (e) { console.log('Renouvellement du token impossible pour l’instant'); }
}

const me = await api('GET', '/me', { fields: 'user_id,username' });
const IG = '/' + (me.user_id || me.id);
const prog = await fetch(BASE + 'programmation.json?t=' + Date.now()).then(r => r.json());
const url = f => BASE + f;
const estVideo = f => /\.mp4$/i.test(f);
const maintenant = Date.now();

for (const p of prog.parutions || []) {
  if (etat.published[p.id]) continue;
  const t = Date.parse(p.date);
  if (isNaN(t) || t < debut || t > maintenant || maintenant - t > FENETRE_HEURES * 3600e3) continue;
  if ((etat.essais[p.id] || 0) >= MAX_ESSAIS) continue;
  etat.essais[p.id] = (etat.essais[p.id] || 0) + 1;
  sauver();
  try {
    const legende = p.legende || '';
    let c;
    if (p.type === 'carrousel') {
      const enfants = [];
      for (const f of p.medias) {
        const k = await api('POST', IG + '/media', estVideo(f)
          ? { media_type: 'VIDEO', video_url: url(f), is_carousel_item: 'true' }
          : { image_url: url(f), is_carousel_item: 'true' });
        await attendrePret(k.id);
        enfants.push(k.id);
      }
      c = await api('POST', IG + '/media', { media_type: 'CAROUSEL', children: enfants.join(','), caption: legende });
    } else if (p.type === 'post') {
      c = await api('POST', IG + '/media', { image_url: url(p.medias[0]), caption: legende });
    } else if (p.type === 'reel') {
      const q = { media_type: 'REELS', video_url: url(p.medias[0]), caption: legende, share_to_feed: 'true' };
      if (p.couverture) q.cover_url = url(p.couverture);
      c = await api('POST', IG + '/media', q);
    } else if (p.type === 'story') {
      const f = p.medias[0];
      c = await api('POST', IG + '/media', estVideo(f) ? { media_type: 'STORIES', video_url: url(f) } : { media_type: 'STORIES', image_url: url(f) });
    } else throw new Error('Type inconnu : ' + p.type);
    await attendrePret(c.id);
    const pub = await api('POST', IG + '/media_publish', { creation_id: c.id });
    etat.published[p.id] = new Date().toISOString();
    console.log('PUBLIÉ', p.id, pub.id);
  } catch (e) {
    console.log('ERREUR', p.id, `essai ${etat.essais[p.id]}/${MAX_ESSAIS}`, String(e.message || e));
  }
  sauver();
}
sauver();
console.log('Terminé', new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }));
